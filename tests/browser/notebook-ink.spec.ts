import { test, expect, type Page, type CDPSession } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest } from "./helpers";

async function notebook(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await page.getByRole("button", { name: "Hide pages", exact: true }).click();
}

async function pen(
  page: Page,
  session: CDPSession,
  samples: { x: number; y: number; pressure: number }[],
) {
  const box = (await page.locator(".ink-canvas:visible").boundingBox())!;
  const doc = await latest(page);
  for (const [i, sample] of samples.entries()) {
    await session.send("Input.dispatchMouseEvent", {
      type: i === 0 ? "mousePressed" : "mouseMoved",
      x: box.x + (sample.x * box.width) / doc.pages[0].width,
      y: box.y + (sample.y * box.height) / doc.pages[0].height,
      pointerType: "pen",
      button: "left",
      buttons: 1,
      force: sample.pressure,
    });
  }
  const last = samples.at(-1)!;
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x + (last.x * box.width) / doc.pages[0].width,
    y: box.y + (last.y * box.height) / doc.pages[0].height,
    pointerType: "pen",
    button: "left",
    buttons: 0,
    force: 0,
  });
}

test("pressure can be disabled and restored without changing previous ink, and survives reload", async ({
  page,
  context,
}) => {
  await notebook(page);
  const session = await context.newCDPSession(page);
  const samples = (y: number) =>
    Array.from({ length: 65 }, (_, i) => ({ x: 40 + i * 4, y, pressure: i / 64 }));
  await pen(page, session, samples(80));
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  const original = (await latest(page)).pages[0].strokes[0];
  const firstPath = await page.locator(".ink-vector:visible g path").first().getAttribute("d");
  expect(original.pressureSensitive).toBe(true);
  expect(original.points[0].p).toBe(0);

  await page.getByRole("button", { name: "Ink options", exact: true }).click();
  const pressure = page.getByRole("menuitemcheckbox", {
    name: "Pen pressure sensitivity",
    exact: true,
  });
  await expect(pressure).toHaveAttribute("aria-checked", "true");
  await pressure.click();
  await pen(page, session, samples(140));
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(2);
  const fixed = (await latest(page)).pages[0].strokes[1];
  expect(fixed.pressureSensitive).toBe(false);
  expect(fixed.points.at(-1).p - fixed.points[0].p).toBeGreaterThan(0.9);
  expect((await latest(page)).pages[0].strokes[0]).toEqual(original);
  await expect(page.locator(".ink-vector:visible g path").first()).toHaveAttribute("d", firstPath!);

  // Measure actual raster widths, rather than inferring behavior from stored flags.
  const widths = await page.locator(".ink-vector:visible g path").evaluateAll((elements) =>
    elements.map((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(8, 8);
      ctx.fill(new Path2D(element.getAttribute("d")!));
      return [80, 260].map((x) => {
        const pixels = ctx.getImageData(x * 8, 0, 1, canvas.height).data;
        const covered = Array.from({ length: canvas.height }, (_, y) => y).filter(
          (y) => pixels[y * 4 + 3] > 127,
        );
        return (covered.at(-1)! - covered[0] + 1) / 8;
      });
    }),
  );
  expect(widths[0][1] - widths[0][0]).toBeGreaterThan(0.8);
  expect(Math.abs(widths[1][1] - widths[1][0])).toBeLessThanOrEqual(0.125);

  await page.reload();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(2);
  await page.getByRole("button", { name: "Ink options", exact: true }).click();
  await expect(pressure).toHaveAttribute("aria-checked", "false");
  const scan = await new AxeBuilder({ page }).include('[role="menu"]').analyze();
  expect(scan.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""))).toEqual(
    [],
  );
  await page.screenshot({ path: "artifacts/notebook-pressure-options.png" });
  await pressure.click();
  await pen(page, session, samples(200));
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(3);
  expect((await latest(page)).pages[0].strokes[2].pressureSensitive).toBe(true);
  expect((await latest(page)).pages[0].strokes.slice(0, 2)).toEqual([original, fixed]);
});

test("new ink follows sharp turns and retracing exactly while preserving saved smoothed ink", async ({
  page,
  context,
}) => {
  await notebook(page);
  const session = await context.newCDPSession(page);
  const samples = [
    [40, 180],
    [220, 180],
    [220, 60],
    [40, 60],
    [40, 140],
    [170, 140],
    [170, 90],
    [90, 90],
    [90, 120],
    [90, 90],
  ].map(([x, y]) => ({ x, y, pressure: 0.5 }));
  await pen(page, session, samples);
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  const doc = await latest(page);
  expect(doc.pages[0].strokes[0].rendering).toBe("precise");
  const ink = page.locator(".ink-vector:visible g path").first();
  const precisePath = await ink.getAttribute("d");
  const coverage = await ink.evaluate((element, samples) => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    const path = new Path2D(element.getAttribute("d")!);
    return {
      recorded: samples.map((p) => ctx.isPointInPath(path, p.x, p.y)),
      gaps: [
        [200, 80],
        [150, 115],
        [100, 160],
        [65, 150],
      ].map(([x, y]) => ctx.isPointInPath(path, x, y)),
    };
  }, samples);
  expect(coverage.recorded.every(Boolean)).toBe(true);
  expect(coverage.gaps.some(Boolean)).toBe(false);
  const previous = { ...doc.pages[0].strokes[0], id: "saved-smooth", rendering: "smooth" };
  doc.pages[0].strokes.push(previous);
  await page.evaluate(
    (doc) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("slate-workspace");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("documents", "readwrite");
          tx.objectStore("documents").put(doc);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    doc,
  );
  await page.reload();
  const paths = page.locator(".ink-vector:visible g path");
  await expect(paths).toHaveCount(2);
  await expect(paths.first()).toHaveAttribute("d", precisePath!);
  const previousPath = await paths.nth(1).getAttribute("d");
  expect(previousPath).toContain("Q");
  expect((await latest(page)).pages[0].strokes).toEqual(doc.pages[0].strokes);
  await page.reload();
  await expect(paths.nth(1)).toHaveAttribute("d", previousPath!);
  await page.screenshot({ path: "artifacts/notebook-precise-corners.png" });
});

test("zoom buttons and wheel reach 1000 percent with accurate ink coordinates and bounded buffers", async ({
  page,
  context,
}) => {
  await notebook(page);
  const viewport = page.locator(".page-viewport:visible");
  await viewport.dispatchEvent("wheel", {
    ctrlKey: true,
    deltaY: -450 * Math.log(9.9),
    clientX: 650,
    clientY: 400,
  });
  await expect(page.locator(".zoom-control")).toContainText("990%");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".zoom-control")).toContainText("1000%");
  await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
  await viewport.dispatchEvent("wheel", {
    ctrlKey: true,
    deltaY: -4000,
    clientX: 650,
    clientY: 400,
  });
  await expect(page.locator(".zoom-control")).toContainText("1000%");
  const canvas = page.locator(".ink-canvas:visible");
  const buffer = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  expect(Math.max(buffer.width, buffer.height)).toBeLessThanOrEqual(4097);
  expect(buffer.width * buffer.height).toBeLessThanOrEqual(8_010_000);
  const box = (await canvas.boundingBox())!;
  const doc = await latest(page);
  const start = {
    x: ((650 - box.x) * doc.pages[0].width) / box.width,
    y: ((400 - box.y) * doc.pages[0].height) / box.height,
  };
  const end = {
    x: ((730 - box.x) * doc.pages[0].width) / box.width,
    y: ((420 - box.y) * doc.pages[0].height) / box.height,
  };
  const session = await context.newCDPSession(page);
  await pen(page, session, [
    { ...start, pressure: 0.3 },
    { ...end, pressure: 0.7 },
  ]);
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  const points = (await latest(page)).pages[0].strokes[0].points;
  expect(points[0].x).toBeCloseTo(start.x, 3);
  expect(points.at(-1).x).toBeCloseTo(end.x, 3);
  expect(points.at(-1).y).toBeCloseTo(end.y, 3);
  await expect(page.locator(".ink-vector:visible g path")).toHaveAttribute("d", /a/);
  await page.screenshot({ path: "artifacts/notebook-1000-percent.png" });
  await page.getByTitle("Fit page width", { exact: true }).click();
  await expect(page.locator(".zoom-control")).toContainText("100%");
  expect((await latest(page)).pages[0].strokes[0].points).toEqual(points);
});

test("phone pinch reaches 1000 percent without shifting the focal point or adding ink", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await notebook(page);
  const paper = page.locator(".paper-page:visible");
  const before = (await paper.boundingBox())!;
  const focal = { x: (245 - before.x) / before.width, y: (450 - before.y) / before.height };
  const session = await context.newCDPSession(page);
  const send = (type: string, distance: number) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd"
          ? []
          : [
              { x: 245 - distance / 2, y: 450, id: 1 },
              { x: 245 + distance / 2, y: 450, id: 2 },
            ],
    });
  await send("touchStart", 20);
  await send("touchMove", 240);
  await expect(page.locator(".zoom-control")).toContainText("1000%");
  const preview = (await paper.boundingBox())!;
  await send("touchEnd", 0);
  await expect(paper).not.toHaveClass(/pinching/);
  const settled = (await paper.boundingBox())!;
  expect(settled.x).toBeCloseTo(preview.x, 0);
  expect(settled.y).toBeCloseTo(preview.y, 0);
  expect((245 - settled.x) / settled.width).toBeCloseTo(focal.x, 3);
  expect((450 - settled.y) / settled.height).toBeCloseTo(focal.y, 3);
  expect((await latest(page)).pages[0].strokes).toHaveLength(0);
});
