import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest, documents } from "./helpers";

test("a photo of handwritten paper becomes a notebook of editable ink", async ({ page }) => {
  await ready(page);
  // A sheet on a desk with a handwritten loop and line, rendered by the browser as a JPEG.
  const photo = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#5c4a3a";
    ctx.fillRect(0, 0, 1200, 900);
    const light = ctx.createLinearGradient(100, 0, 1100, 0);
    light.addColorStop(0, "#f2efe6");
    light.addColorStop(1, "#c9c4b8");
    ctx.fillStyle = light;
    ctx.fillRect(110, 60, 980, 780);
    ctx.strokeStyle = "#c7d3e6";
    for (let y = 100; y < 840; y += 36) {
      ctx.beginPath();
      ctx.moveTo(110, y);
      ctx.lineTo(1090, y);
      ctx.stroke();
    }
    ctx.lineCap = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1d2a8a";
    ctx.beginPath();
    ctx.arc(400, 400, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#222222";
    ctx.beginPath();
    ctx.moveTo(560, 300);
    ctx.bezierCurveTo(700, 200, 820, 520, 960, 380);
    ctx.stroke();
    const blob = await new Promise<Blob>((done) =>
      canvas.toBlob((b) => done(b!), "image/jpeg", 0.9),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByRole("button", { name: "New note", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Notebook from photos", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "Lecture notes.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(photo),
  });
  const dialog = page.getByRole("dialog", { name: "Notebook from photos" });
  await expect(dialog).toBeVisible();
  const create = dialog.getByRole("button", { name: "Create notebook" });
  await expect(create).toBeEnabled({ timeout: 20000 });
  await expect(dialog.getByText(/Lined paper detected/)).toBeVisible();
  await expect(dialog.getByRole("img", { name: /Traced handwriting, \d+ strokes/ })).toBeVisible();
  await page.screenshot({ path: "artifacts/photo-import-dialog.png" });
  await dialog.getByRole("switch", { name: "Keep ink colors" }).uncheck();
  await expect(create).toBeEnabled({ timeout: 20000 });
  await create.click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await latest(page))?.title).toBe("Lecture notes");
  const doc = await latest(page);
  expect(doc.kind).toBe("notebook");
  expect(doc.pages).toHaveLength(1);
  expect(doc.pages[0]).toMatchObject({
    width: 794,
    height: 1059,
    paper: { style: "lined", template: "flexcil" },
  });
  const strokes = doc.pages[0].strokes;
  expect(strokes.length).toBeGreaterThanOrEqual(2);
  expect(strokes.length).toBeLessThan(20);
  expect(new Set(strokes.map((s: { color: string }) => s.color))).toEqual(new Set(["#000000"]));
  await expect(page.locator(".document-pane:not([hidden]) .ink-canvas")).toBeVisible();
  // Imported ink participates in the ordinary lasso/transform/undo workflow.
  const canvas = page.locator(".document-pane:not([hidden]) .ink-canvas");
  const box = (await canvas.boundingBox())!,
    factor = box.width / doc.pages[0].width;
  const points = strokes.flatMap((s: { points: { x: number; y: number }[] }) => s.points);
  const left = Math.min(...points.map((p: { x: number }) => p.x)) - 12,
    right = Math.max(...points.map((p: { x: number }) => p.x)) + 12;
  const top = Math.min(...points.map((p: { y: number }) => p.y)) - 12,
    bottom = Math.max(...points.map((p: { y: number }) => p.y)) + 12;
  const corner = (x: number, y: number) => ({ x: box.x + x * factor, y: box.y + y * factor });
  await page.getByRole("button", { name: "Lasso (V)", exact: true }).click();
  const start = corner(left, top);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [x, y] of [
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ]) {
    const p = corner(x, y);
    await page.mouse.move(p.x, p.y, { steps: 8 });
  }
  await page.mouse.up();
  const middle = corner((left + right) / 2, (top + bottom) / 2);
  await page.mouse.click(middle.x, middle.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Make selection larger", exact: true }).click();
  await expect
    .poll(async () => (await latest(page)).pages[0].strokes[0].width)
    .toBeCloseTo(strokes[0].width * 1.1);
  await page.getByRole("button", { name: "Undo ink", exact: true }).click();
  await expect.poll(async () => (await latest(page)).pages).toEqual(doc.pages);
  await page.screenshot({ path: "artifacts/photo-import.png" });
  // Reload keeps the extracted vectors and the import preferences.
  await page.reload();
  await expect(page.locator(".document-pane:not([hidden]) .ink-canvas")).toBeVisible();
  expect((await latest(page)).pages).toEqual(doc.pages);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  const again = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Notebook from photos", exact: true }).click();
  await (
    await again
  ).setFiles({ name: "Second.jpg", mimeType: "image/jpeg", buffer: Buffer.from(photo) });
  await expect(dialog.getByRole("switch", { name: "Keep ink colors" })).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Create notebook" })).toBeEnabled({
    timeout: 20000,
  });
  await dialog.getByLabel("Notebook paper").selectOption("grid");
  await expect(dialog.getByRole("button", { name: "Create notebook" })).toBeEnabled({
    timeout: 20000,
  });
  await dialog.getByRole("button", { name: "Create notebook" }).click();
  await expect(dialog).toBeHidden();
  expect((await latest(page)).pages[0].paper.style).toBe("grid");
});

test("mixed paper photos work on a phone without a Worker and a bad photo cannot create a partial notebook", async ({
  page,
}) => {
  await ready(page);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.evaluate(() => Object.defineProperty(window, "Worker", { value: undefined }));
  const photos = await page.evaluate(async () => {
    const results: number[][] = [];
    for (const style of ["grid", "dot"]) {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 640;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 480, 640);
      ctx.strokeStyle = "#aaaaaa";
      ctx.fillStyle = "#aaaaaa";
      if (style === "grid") {
        for (let x = 30; x < 480; x += 24) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 640);
          ctx.stroke();
        }
        for (let y = 40; y < 640; y += 24) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(480, y);
          ctx.stroke();
        }
      } else
        for (let x = 30; x < 480; x += 24)
          for (let y = 40; y < 640; y += 24) {
            ctx.beginPath();
            ctx.arc(x, y, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
      ctx.strokeStyle = "#1c2a70";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(180, 230, 40, 0, Math.PI * 2);
      ctx.stroke();
      const blob = await new Promise<Blob>((done) => c.toBlob((b) => done(b!), "image/png"));
      results.push(Array.from(new Uint8Array(await blob.arrayBuffer())));
    }
    return results;
  });
  const initial = (await documents(page)).length;
  const open = async (files: { name: string; mimeType: string; buffer: Buffer }[]) => {
    await page.getByRole("button", { name: "New note", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "Notebook from photos", exact: true }).click();
    await (await chooser).setFiles(files);
  };
  const files = photos.map((bytes, i) => ({
    name: ["Squared.png", "Dotted.png"][i],
    mimeType: "image/png",
    buffer: Buffer.from(bytes),
  }));
  await open([
    ...files,
    { name: "Broken.png", mimeType: "image/png", buffer: Buffer.from("not a PNG") },
  ]);
  const dialog = page.getByRole("dialog", { name: "Notebook from photos" });
  await expect(dialog.getByText(/could not be opened/)).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByRole("button", { name: "Create notebook" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await documents(page)).length).toBe(initial);
  await open(files);
  const create = dialog.getByRole("button", { name: "Create notebook" });
  await expect(create).toBeEnabled({ timeout: 20000 });
  await expect(dialog.getByText(/Squared paper detected/)).toBeVisible();
  await dialog.getByRole("button", { name: "Next photo" }).click();
  await expect(dialog.getByText(/Dotted paper detected/)).toBeVisible();
  await page.screenshot({ path: "artifacts/photo-import-phone.png" });
  await create.click();
  await expect(dialog).toBeHidden();
  const doc = await latest(page);
  expect(doc.pages.map((p: { paper: { style: string } }) => p.paper.style)).toEqual([
    "grid",
    "dot",
  ]);
  expect(
    doc.pages.every((p: { strokes: unknown[] }) => p.strokes.length > 0 && p.strokes.length < 20),
  ).toBe(true);
});

test("the owner's photographed page is detected as lined and imports as native ink", async ({
  page,
}) => {
  test.skip(!process.env.SLATE_HANDWRITING_PHOTO, "Optional private photo fixture.");
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Notebook from photos", exact: true }).click();
  await (await chooser).setFiles(process.env.SLATE_HANDWRITING_PHOTO!);
  const dialog = page.getByRole("dialog", { name: "Notebook from photos" });
  await expect(dialog.getByRole("button", { name: "Create notebook" })).toBeEnabled({
    timeout: 20000,
  });
  await expect(dialog.getByText(/Lined paper detected/)).toBeVisible();
  await page.screenshot({ path: "artifacts/photo-import-owner-review.png" });
  await dialog.getByRole("button", { name: "Create notebook" }).click();
  await expect(dialog).toBeHidden();
  const doc = await latest(page),
    p = doc.pages[0];
  expect(p).toMatchObject({
    width: 794,
    height: 1059,
    paper: { style: "lined", template: "flexcil" },
  });
  expect(p.strokes.length).toBeGreaterThan(500);
  expect(p.strokes.length).toBeLessThan(2500);
  expect(new Set(p.strokes.map((s: { color: string }) => s.color))).toEqual(new Set(["#0069db"]));
  const lines = p.strokes.filter((s: { points: unknown[] }) => s.points.length > 1);
  expect(new Set(lines.map((s: { width: number }) => s.width.toFixed(5))).size).toBe(1);
  expect(lines[0].width * 2).toBeCloseTo(1.2, 6);
  expect(
    lines.every(
      (s: { rendering: string; pressureSensitive: boolean; brush?: string }) =>
        s.rendering === "precise" && !s.pressureSensitive && !s.brush,
    ),
  ).toBe(true);
  expect(
    p.strokes.every((s: { points: { x: number; y: number }[] }) =>
      s.points.every((v) => v.x > 0 && v.y > 0 && v.x < p.width && v.y < p.height),
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/photo-import-owner-notebook.png" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(page.locator(".document-pane:not([hidden]) .ink-canvas")).toBeVisible();
  expect((await latest(page)).pages).toEqual(doc.pages);
});
