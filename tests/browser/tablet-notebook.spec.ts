import { test, expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest, draw } from "./helpers";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 1440, height: 900 } });

async function notebook(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).tap();
  await page.getByRole("button", { name: "Hide pages", exact: true }).tap();
}
async function finger(
  session: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  x = 0,
  y = 450,
) {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
  });
}
async function prefs(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const open = indexedDB.open("slate-workspace");
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("meta"),
            request = tx.objectStore("meta").get("preferences");
          request.onsuccess = () => resolve(request.result);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}

test("tablet chrome fills the viewport and header swipes open both drawers", async ({
  page,
  context,
}) => {
  await notebook(page);
  await expect(page.locator(".document-tabs")).toBeHidden();
  await expect(page.locator(".workspace-topbar-slot")).toBeHidden();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(
    page
      .locator(".document-titlebar")
      .getByRole("button", { name: /document context|Show library/ }),
  ).toHaveCount(0);
  const title = (await page.locator(".document-titlebar").boundingBox())!;
  expect(title.y).toBe(0);
  const area = (await page.locator(".notebook-paper-area").boundingBox())!;
  expect(area.y + area.height).toBe(900);
  const toolbar = (await page
    .getByRole("group", { name: "Ink tools", exact: true })
    .boundingBox())!;
  expect(toolbar.height).toBeLessThanOrEqual(56);
  expect(toolbar.width).toBeLessThan(490);
  await page.screenshot({ path: "artifacts/tablet-notebook-landscape.png" });
  const session = await context.newCDPSession(page);
  const controls = (await page.locator(".notebook-controls").boundingBox())!;
  const swipeY = controls.y + controls.height / 2;
  for (const [start, middle, end, name] of [
    [50, 120, 260, "Library"],
    [1390, 1320, 1170, "Document context"],
  ] as const) {
    await finger(session, "touchStart", start, swipeY);
    await finger(session, "touchMove", middle, swipeY);
    const drawer = page.getByRole("dialog", { name, exact: true });
    await expect(drawer).toHaveAttribute("data-dragging", "true");
    const partial = (await drawer.boundingBox())!;
    expect(name === "Library" ? partial.x < 0 : partial.x + partial.width > 1440).toBe(true);
    await finger(session, "touchMove", end, swipeY);
    await finger(session, "touchEnd");
    await expect(drawer).toHaveAttribute("data-dragging", "false");
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  }
  expect((await latest(page)).pages[0].strokes).toHaveLength(0);
  await page.setViewportSize({ width: 900, height: 1440 });
  const portrait = (await page.locator(".notebook-paper-area").boundingBox())!;
  expect(portrait.y + portrait.height).toBe(1440);
  await page.screenshot({ path: "artifacts/tablet-notebook-portrait.png" });
});

test("pen and highlighter reopen thickness, the single color picker and preferences survive reload", async ({
  page,
}) => {
  await notebook(page);
  const toolbar = page.getByRole("group", { name: "Ink tools", exact: true });
  await expect(toolbar.locator(".ink-swatch")).toHaveCount(1);
  await toolbar.getByRole("button", { name: "Pen (P)", exact: true }).tap();
  await page.getByRole("button", { name: "Fine", exact: true }).tap();
  await toolbar.getByRole("button", { name: "Highlighter (H)", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Highlighter thickness", exact: true }),
  ).toHaveCount(0);
  await toolbar.getByRole("button", { name: "Highlighter (H)", exact: true }).tap();
  await page.getByRole("button", { name: "Heavy", exact: true }).tap();
  await toolbar.getByRole("button", { name: "Pen (P)", exact: true }).tap();
  await toolbar.getByRole("button", { name: "Pen (P)", exact: true }).tap();
  await page.getByRole("button", { name: "Fine", exact: true }).tap();
  await toolbar.getByRole("button", { name: "Ink color", exact: true }).tap();
  await page.getByRole("button", { name: "Rose ink", exact: true }).tap();
  await expect(page.locator(".ink-color-picker")).toHaveCount(0);
  await draw(page);
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  expect((await latest(page)).pages[0].strokes[0]).toMatchObject({
    width: 0.6,
    color: "#aa6467",
    rendering: "precise",
    pressureSensitive: true,
  });
  await page.reload();
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Pen (P)", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Fine", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(toolbar.locator(".ink-swatch")).toHaveCSS("background-color", "rgb(170, 100, 103)");
  await page.screenshot({ path: "artifacts/tablet-notebook-ink.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(toolbar).toHaveCSS("background-color", "rgb(36, 44, 56)");
  await page.screenshot({ path: "artifacts/tablet-notebook-dark.png" });
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""))).toEqual(
    [],
  );
});

test("touch moves the floating toolbar without ink, keeps it inside paper, and restores its position", async ({
  page,
  context,
}) => {
  await notebook(page);
  const toolbar = page.getByRole("group", { name: "Ink tools", exact: true });
  const grip = page.getByRole("button", { name: "Move ink toolbar", exact: true });
  const start = (await grip.boundingBox())!,
    session = await context.newCDPSession(page);
  await finger(session, "touchStart", start.x + 22, start.y + 22);
  await finger(session, "touchMove", 140, 240);
  await finger(session, "touchEnd");
  const moved = (await toolbar.boundingBox())!;
  expect(moved.y).toBeLessThan(250);
  expect(moved.x).toBeLessThan(150);
  await expect.poll(async () => (await prefs(page))?.inkToolbarPosition?.y).toBeLessThan(0.3);
  expect((await latest(page)).pages[0].strokes).toHaveLength(0);
  await page.reload();
  await expect(toolbar).toBeVisible();
  await expect.poll(async () => (await toolbar.boundingBox())!.x).toBeCloseTo(moved.x, 0);
  const restored = (await toolbar.boundingBox())!;
  expect(restored.x).toBeCloseTo(moved.x, 0);
  expect(restored.y).toBeCloseTo(moved.y, 0);
  await page.setViewportSize({ width: 900, height: 1440 });
  const rotated = (await toolbar.boundingBox())!,
    area = (await page.locator(".notebook-paper-area").boundingBox())!;
  expect(rotated.x).toBeGreaterThanOrEqual(12);
  expect(rotated.x + rotated.width).toBeLessThanOrEqual(888);
  expect(rotated.y).toBeGreaterThanOrEqual(area.y + 12);
  expect(rotated.y + rotated.height).toBeLessThanOrEqual(1428);
  await grip.focus();
  await page.keyboard.press("ArrowRight");
  expect((await toolbar.boundingBox())!.x).toBeCloseTo(rotated.x + 20, 0);
});

test("pen input retains coalesced samples, sharp turns and the lift-off endpoint without palm ink", async ({
  page,
  context,
}) => {
  await notebook(page);
  const canvas = page.locator(".ink-canvas:visible"),
    box = (await canvas.boundingBox())!;
  await canvas.evaluate((element) =>
    element.addEventListener(
      "pointerdown",
      (event) => {
        (window as any).penId = (event as PointerEvent).pointerId;
      },
      { once: true },
    ),
  );
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x + 100,
    y: box.y + 100,
    button: "left",
    buttons: 1,
    pointerType: "pen",
    force: 0.2,
  });
  await canvas.evaluate((element, box) => {
    const id = (window as any).penId;
    const sample = (x: number, y: number, pressure: number) =>
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: id,
        pointerType: "pen",
        buttons: 1,
        clientX: box.x + x,
        clientY: box.y + y,
        pressure,
      });
    const coalesced = [sample(130, 100, 0.4), sample(180, 100, 0.6)];
    const event = sample(220, 100, 0.8);
    Object.defineProperty(event, "getCoalescedEvents", {
      value: () => coalesced,
    });
    element.dispatchEvent(event);
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 99,
        pointerType: "touch",
        clientX: box.x + 110,
        clientY: box.y + 120,
      }),
    );
  }, box);
  const prefix = () =>
    canvas.evaluate((element) => {
      const raster = element.parentElement!.querySelector(".ink-live-raster") as HTMLCanvasElement;
      const x = parseFloat(raster.style.left),
        y = parseFloat(raster.style.top);
      const scaleX = raster.width / parseFloat(raster.style.width),
        scaleY = raster.height / parseFloat(raster.style.height);
      return Array.from(
        raster
          .getContext("2d")!
          .getImageData(
            Math.floor((120 - x) * scaleX),
            Math.floor((96 - y) * scaleY),
            Math.ceil(20 * scaleX),
            Math.ceil(8 * scaleY),
          ).data,
      );
    });
  const initial = await prefix();
  expect(initial.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: box.x + 220,
    y: box.y + 220,
    buttons: 1,
    button: "left",
    pointerType: "pen",
    force: 0.5,
  });
  expect(await prefix()).toEqual(initial);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x + 250,
    y: box.y + 240,
    button: "left",
    buttons: 0,
    pointerType: "pen",
    force: 0,
  });
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  const doc = await latest(page),
    points = doc.pages[0].strokes[0].points;
  expect(points.slice(0, 4).map((p: any) => Math.round(p.x))).toEqual(
    [100, 130, 180, 220].map((x) => Math.round((x * doc.pages[0].width) / box.width)),
  );
  expect(points.at(-1).x).toBeCloseTo((250 * doc.pages[0].width) / box.width, 3);
  expect(points.at(-1).y).toBeCloseTo((240 * doc.pages[0].height) / box.height, 3);
  expect(points.at(-1).p).toBeCloseTo(0.5);
  // Fresh fingers can zoom after the short palm guard, even with the pen hovering nearby.
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: box.x + 250,
    y: box.y + 240,
    pointerType: "pen",
    buttons: 2,
    force: 0,
  });
  await page.waitForTimeout(360);
  const touches = (distance: number) => [
    { x: box.x + 100, y: box.y + 320, id: 1 },
    { x: box.x + 100 + distance, y: box.y + 320, id: 2 },
  ];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touches(100) });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touches(170) });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".zoom-control")).not.toContainText("100%");
  expect((await latest(page)).pages[0].strokes).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(1);
  expect((await latest(page)).pages[0].strokes[0].points).toEqual(points);
});

test("phone toolbar keeps touch targets on one row with remaining controls in its menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await notebook(page);
  const toolbar = page.getByRole("group", { name: "Ink tools", exact: true }),
    box = (await toolbar.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(56);
  expect(box.x + box.width).toBeLessThanOrEqual(363);
  const buttons = await toolbar.getByRole("button").all();
  for (const button of buttons) {
    if (!(await button.isVisible())) continue;
    const target = (await button.boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Ink options", exact: true }).tap();
  for (const name of ["Select ink", "Pan page", "Redo ink", "Touch pans. Switch to touch drawing"])
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/tablet-notebook-phone.png" });
});
