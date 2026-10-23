import { test, expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, documents, latest, nameNewDocument, draw } from "./helpers";

async function notebook(page: Page, dark = false) {
  await ready(page);
  if (dark) {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill("Toggle light");
    await page.getByRole("option", { name: /Toggle light \/ dark theme/ }).click();
  }
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await nameNewDocument(page, "Lecture sketches");
  await page.getByRole("button", { name: "Hide pages", exact: true }).click();
}

async function touch(session: CDPSession, type: string, x = 0, y = 350) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y, id: 1 }],
  });
}
async function swipe(session: CDPSession, from: number, to: number, y = 350, dy = 0) {
  await touch(session, "touchStart", from, y);
  for (let i = 1; i <= 8; i++)
    await touch(session, "touchMove", from + ((to - from) * i) / 8, y + (dy * i) / 8);
  await touch(session, "touchEnd");
}

test("naming is required, cancellation creates nothing, and invalid names can be corrected", async ({
  page,
}) => {
  await ready(page);
  const before = (await documents(page)).length;
  await page.keyboard.press("Control+n");
  const dialog = page.getByRole("dialog", { name: "New Markdown", exact: true });
  const name = dialog.getByRole("textbox", { name: "Note name" });
  await expect(name).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Create note", exact: true })).toBeDisabled();
  await name.fill("Discard this draft");
  await page.keyboard.press("Escape");
  expect((await documents(page)).length).toBe(before);
  await page.keyboard.press("Control+n");
  await expect(name).toHaveValue("");
  await name.fill("bad/name");
  await name.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Choose a name");
  expect((await documents(page)).length).toBe(before);
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(accessibility.violations).toEqual([]);
  await name.fill("  Thermodynamics  ");
  await name.press("Enter");
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await latest(page))?.title).toBe("Thermodynamics");
  await page.reload();
  await expect.poll(async () => (await latest(page))?.title).toBe("Thermodynamics");
});

test("the title field fits its header, renames on Enter and cancels on Escape", async ({
  page,
}) => {
  await notebook(page);
  const title = page.getByRole("textbox", { name: "Document title", exact: true });
  await title.fill("Lecture sketches and diagrams");
  await title.press("Enter");
  await expect.poll(async () => (await latest(page))?.title).toBe("Lecture sketches and diagrams");
  await title.fill("Cancelled edit");
  await title.press("Escape");
  await expect(title).toHaveValue("Lecture sketches and diagrams");
  await title.focus();
  const layout = await title.evaluate((input) => {
    const field = input.getBoundingClientRect();
    const header = input.closest(".document-titlebar")!.getBoundingClientRect();
    const style = getComputedStyle(input);
    return {
      top: field.top - header.top,
      bottom: header.bottom - field.bottom,
      offset: style.outlineOffset,
      height: field.height,
      lineHeight: style.lineHeight,
    };
  });
  expect(layout.top).toBeGreaterThanOrEqual(3);
  expect(layout.bottom).toBeGreaterThanOrEqual(3);
  expect(layout.offset).toBe("-1px");
  expect(layout.height).toBeGreaterThan(parseFloat(layout.lineHeight));
  await page.screenshot({ path: "artifacts/notebook-title-desktop.png" });
});

test.describe("horizontal notebook gestures", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 800, height: 900 } });

  test("long pulls add at either end, turn existing pages, and preserve ink on reload", async ({
    page,
    context,
  }) => {
    await notebook(page);
    await draw(page, { x: 90, y: 130 }, { x: 210, y: 160 });
    await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
    const original = (await latest(page)).pages[0];
    const session = await context.newCDPSession(page);
    await swipe(session, 600, 240);
    await expect.poll(async () => (await latest(page))?.pages.length).toBe(2);
    await expect(page.locator(".notebook-page-label")).toHaveText("2 / 2");
    await swipe(session, 230, 590);
    await expect(page.locator(".notebook-page-label")).toHaveText("1 / 2");
    expect((await latest(page)).pages.length).toBe(2);
    await swipe(session, 230, 590);
    await expect.poll(async () => (await latest(page))?.pages.length).toBe(3);
    await expect(page.locator(".notebook-page-label")).toHaveText("1 / 3");
    expect((await latest(page)).pages[1]).toEqual(original);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Document title" })).toHaveValue(
      "Lecture sketches",
    );
    expect((await latest(page)).pages[1]).toEqual(original);
    await page.getByRole("button", { name: "Add page", exact: true }).tap();
    await expect.poll(async () => (await latest(page))?.pages.length).toBe(4);
  });

  test("short, vertical, cancelled and two-finger gestures do not create pages", async ({
    page,
    context,
  }) => {
    await notebook(page);
    const session = await context.newCDPSession(page);
    await swipe(session, 530, 450);
    await swipe(session, 420, 410, 300, 340);
    await page.locator(".page-viewport").evaluate((element) => (element.scrollTop = 0));
    await touch(session, "touchStart", 600);
    await touch(session, "touchMove", 240);
    await expect(
      page.getByRole("status").filter({ hasText: "Release to add a page" }),
    ).toBeVisible();
    await touch(session, "touchCancel");
    await expect(page.locator(".page-pull-hint")).toHaveCount(0);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 550, y: 350, id: 1 },
        { x: 650, y: 350, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 210, y: 350, id: 1 },
        { x: 310, y: 350, id: 2 },
      ],
    });
    await touch(session, "touchEnd");
    expect((await latest(page)).pages).toHaveLength(1);
    await expect(page.locator(".page-pull-hint")).toHaveCount(0);
  });

  test("horizontal panning consumes the scrollable paper before a page pull", async ({
    page,
    context,
  }) => {
    await notebook(page);
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 300, y: 350, id: 1 },
        { x: 500, y: 350, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 200, y: 350, id: 1 },
        { x: 600, y: 350, id: 2 },
      ],
    });
    await touch(session, "touchEnd");
    const viewport = page.locator(".page-viewport");
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeGreaterThan(230);
    await viewport.evaluate((element) => {
      element.scrollLeft = 230;
    });
    await swipe(session, 260, 580);
    expect((await latest(page)).pages).toHaveLength(1);
    await expect(page.locator(".page-pull-hint")).toHaveCount(0);
    await viewport.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await swipe(session, 240, 600);
    await expect.poll(async () => (await latest(page))?.pages.length).toBe(2);
  });

  test("a pen owns its stroke while horizontal palm movement cannot create a page", async ({
    page,
    context,
  }) => {
    await notebook(page);
    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 600,
      y: 350,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.5,
    });
    await swipe(session, 600, 240, 420);
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 240,
      y: 350,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.5,
    });
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 240,
      y: 350,
      button: "left",
      buttons: 0,
      pointerType: "pen",
      force: 0,
    });
    await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
    expect((await latest(page)).pages).toHaveLength(1);
    await expect(page.locator(".page-pull-hint")).toHaveCount(0);
  });

  test("phone title and right-side page creation remain usable in dark mode", async ({ page }) => {
    await notebook(page, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const title = page.getByRole("textbox", { name: "Document title", exact: true });
    await title.fill("A long notebook title that stays inside the compact header");
    await title.press("Enter");
    await title.focus();
    const button = page.getByRole("button", { name: "Add page", exact: true });
    const fieldBox = (await title.boundingBox())!;
    const headerBox = (await page.locator(".document-titlebar").boundingBox())!;
    expect(fieldBox.y - headerBox.y).toBeGreaterThanOrEqual(3);
    expect(headerBox.y + headerBox.height - fieldBox.y - fieldBox.height).toBeGreaterThanOrEqual(3);
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThan(195);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    const result = await new AxeBuilder({ page }).include(".document-titlebar").analyze();
    expect(result.violations).toEqual([]);
    await page.screenshot({ path: "artifacts/notebook-title-phone-dark.png" });
  });
});
