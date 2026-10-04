import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest, draw, source } from "./helpers";
test("Live Preview tasks and link completion edit Markdown directly", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Control+n");
  await source(page, "# Tasks\n\n- [ ] Review vectors\n\nMore writing.\n");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page.getByRole("checkbox", { name: "Complete task", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.content).toContain("- [x] Review vectors");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown editor", exact: true }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n[[Line");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("Linear transformations");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await latest(page))?.content)
    .toContain("[[Linear transformations]]");
});
test("Long-note mode switching preserves reading context", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Control+n");
  const text =
    "# Long lecture\n\n" +
    Array.from(
      { length: 120 },
      (_, i) =>
        "## Idea " +
        (i + 1) +
        "\nA clear paragraph explaining the evidence and connecting this idea to the previous section.\n",
    ).join("\n");
  await source(page, text);
  const scroll = page.locator(".document-pane:not([hidden]) .cm-scroller");
  await scroll.evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.55;
  });
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".reading-scroll")
        .evaluate((el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)),
    )
    .toBeGreaterThan(0.35);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect
    .poll(() =>
      scroll.evaluate((el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)),
    )
    .toBeGreaterThan(0.35);
  expect((await latest(page)).content).toBe(text);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
test("Pen pressure survives saving, touch pans by default, finger ink is explicit", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).tap();
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  const c = page.locator(".document-pane:not([hidden]) .ink-canvas");
  let b = (await c.boundingBox())!;
  const session = await context.newCDPSession(page);
  const x = b.x + 80,
    y = b.y + 70;
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "pen",
    force: 0.2,
  });
  for (let i = 1; i <= 20; i++)
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + i * 5,
      y: y + Math.sin(i / 3) * 18,
      button: "left",
      buttons: 1,
      pointerType: "pen",
      force: 0.2 + i * 0.03,
    });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: x + 100,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "pen",
    force: 0,
  });
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  const points = (await latest(page)).pages[0].strokes[0].points;
  expect(
    Math.max(...points.map((p: any) => p.p)) - Math.min(...points.map((p: any) => p.p)),
  ).toBeGreaterThan(0.3);
  b = (await c.boundingBox())!;
  const touches = (at: number) => [
    { x: b.x + 100, y: Math.max(250, b.y + 130 - at), id: 1, radiusX: 5, radiusY: 5, force: 0.5 },
  ];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touches(0) });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touches(30) });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect((await latest(page)).pages[0].strokes.length).toBe(1);
  await page.getByRole("button", { name: "Ink options", exact: true }).tap();
  await page
    .getByRole("menuitem", { name: "Touch pans. Switch to touch drawing", exact: true })
    .tap();
  await page.getByRole("button", { name: "Ink options", exact: true }).tap();
  await expect(
    page.getByRole("menuitem", { name: "Touch draws. Switch to touch panning", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  b = (await c.boundingBox())!;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touches(0) });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touches(30) });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(2);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await context.close();
});
test("Production shell reopens notes and writes ink with the network disabled", async ({
  page,
  context,
}) => {
  test.skip(!process.env.SLATE_PRODUCTION_TEST, "Requires the built production server.");
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.keyboard.press("Control+n");
  await page.getByLabel("Document title", { exact: true }).fill("Offline lecture");
  await source(page, "# Offline lecture\n\nConserved momentum and $p = mv$.\n");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Offline lecture");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose .katex")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("conserved");
  await expect(page.getByRole("option").first()).toContainText("Offline lecture");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+n");
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  await draw(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  await page.reload();
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  expect((await latest(page)).pages[0].strokes).toHaveLength(1);
  await context.setOffline(false);
});
