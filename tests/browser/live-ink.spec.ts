import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { ready, latest } from "./helpers";

async function notebook(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  // Let the entry animation and fit-to-width zoom settle before sizing rasters.
  const canvas = page.locator(".document-pane:not([hidden]) .ink-canvas");
  let width = -1;
  await expect
    .poll(async () => {
      const next = (await canvas.boundingBox())!.width;
      const settled = next === width;
      width = next;
      await page.waitForTimeout(250);
      return settled;
    })
    .toBe(true);
  // The cached raster was sized mid-animation, and transforms never fire ResizeObserver.
  await page.setViewportSize({ width: 1441, height: 960 });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.waitForTimeout(250);
  return canvas.boundingBox();
}
function pen(session: CDPSession, type: string, x: number, y: number, force: number) {
  return session.send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: type === "mouseMoved" ? 0 : 1,
    pointerType: "pen",
    force,
  });
}
// Snapshots stay in the page; only the comparison crosses the protocol.
function snapshot(page: Page) {
  return page.evaluate(() => {
    const read = (selector: string) => {
      const c = document.querySelector<HTMLCanvasElement>(
        `.document-pane:not([hidden]) ${selector}`,
      )!;
      return {
        data: c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
        width: c.width,
        opacity: Number(c.style.opacity || 1),
      };
    };
    const w = window as unknown as { inkShots: unknown[] };
    (w.inkShots ??= []).push({
      live: read(".ink-live-raster"),
      base: read(".ink-raster:not(.ink-live-raster)"),
    });
  });
}
// Compares live ink before the lift with what the lift added to the committed raster.
function compare(page: Page) {
  return page.evaluate(() => {
    type Shot = { data: Uint8ClampedArray; width: number; opacity: number };
    const w = window as unknown as { inkShots: { live: Shot; base: Shot }[] };
    const [before, after] = w.inkShots.splice(0, 2);
    let changed = 0,
      mismatched = 0;
    for (let i = 3; i < before.base.data.length; i += 4) {
      const committed = after.base.data[i] - before.base.data[i];
      const live = before.live.data[i] * before.live.opacity;
      if (committed > 8 || live > 8) changed++;
      if (Math.abs(Math.max(0, committed) - live) > 96) mismatched++;
    }
    return {
      changed,
      mismatched,
      sameSize: before.live.width === after.base.width,
      sizes: [before.live.width, before.base.width, after.base.width],
    };
  });
}

test("Live pen ink matches the committed stroke for every Flexcil pen", async ({ page }) => {
  test.setTimeout(120000);
  const b = (await notebook(page))!;
  const session = await page.context().newCDPSession(page);
  const slots = page.locator(".fx-pens [role=radio]");
  const results: Record<string, number> = {};
  for (let slot = 0; slot < (await slots.count()); slot++) {
    const name = (await slots.nth(slot).getAttribute("aria-label"))!;
    if (/straight/i.test(name)) continue;
    // A second tap on the selected slot opens its editor.
    if ((await slots.nth(slot).getAttribute("aria-checked")) !== "true")
      await slots.nth(slot).click();
    const x = b.x + 120,
      y = b.y + 120 + slot * 40;
    await pen(session, "mousePressed", x, y, 0.3);
    for (let i = 1; i <= 80; i++)
      await pen(
        session,
        "mouseMoved",
        x + i * 4,
        y + Math.sin(i / 6) * 16,
        0.3 + 0.5 * Math.abs(Math.sin(i / 9)),
      );
    await snapshot(page);
    await pen(session, "mouseReleased", x + 320, y + Math.sin(80 / 6) * 16, 0);
    await page.waitForTimeout(120);
    await snapshot(page);
    const { changed, mismatched, sameSize, sizes } = await compare(page);
    expect(sameSize, `${name} ${sizes}`).toBe(true);
    expect(changed).toBeGreaterThan(100);
    results[name] = mismatched / changed;
    expect(mismatched / changed, name).toBeLessThan(0.03);
  }
  console.log(JSON.stringify(results));
});

test("Live ink cost stays flat as a stroke grows", async ({ page }) => {
  test.setTimeout(120000);
  const b = (await notebook(page))!;
  await page
    .getByRole("radio", { name: /^Fountain pen/ })
    .first()
    .click();
  const session = await page.context().newCDPSession(page);
  const x = b.x + 80,
    y = b.y + 300;
  await pen(session, "mousePressed", x, y, 0.5);
  await session.send("Performance.enable");
  const script = async () =>
    (await session.send("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration")!
      .value * 1000;
  const marks: number[] = [];
  for (let i = 1; i <= 900; i++) {
    if (i === 100 || i === 200 || i === 800 || i === 900) marks.push(await script());
    const a = i / 14;
    await pen(
      session,
      "mouseMoved",
      x + 200 + Math.cos(a) * (30 + i / 6),
      y + Math.sin(a) * (30 + i / 6),
      0.5 + 0.3 * Math.sin(i / 20),
    );
  }
  await pen(session, "mouseReleased", x, y, 0);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  // Script milliseconds per 100 samples, near the start and near the end of a 900-sample stroke.
  const early = marks[1] - marks[0],
    late = marks[3] - marks[2];
  console.log(JSON.stringify({ early, late }));
  expect(late).toBeLessThan(early * 2 + 2);
});

test("A tapped dot stays visible after the vector layer takes over", async ({ page }) => {
  const b = (await notebook(page))!;
  const session = await page.context().newCDPSession(page);
  const x = b.x + 200,
    y = b.y + 200;
  await pen(session, "mousePressed", x, y, 0.5);
  await pen(session, "mouseReleased", x, y, 0.5);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  // Completed ink hands over from the cached raster to SVG after the writing pause.
  await page.waitForTimeout(1800);
  const d = await page
    .locator(".document-pane:not([hidden]) .ink-vector path")
    .last()
    .getAttribute("d");
  expect(d).toMatch(/L/);
  const dot = await page.screenshot({ clip: { x: x - 6, y: y - 6, width: 12, height: 12 } });
  const blank = await page.screenshot({ clip: { x: x + 60, y: y + 60, width: 12, height: 12 } });
  expect(dot.equals(blank)).toBe(false);
});
