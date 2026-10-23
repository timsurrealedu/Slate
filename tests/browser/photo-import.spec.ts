import { test, expect } from "@playwright/test";
import { ready, latest } from "./helpers";

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
  const strokes = doc.pages[0].strokes;
  expect(strokes.length).toBeGreaterThanOrEqual(2);
  expect(strokes.length).toBeLessThan(20);
  expect(new Set(strokes.map((s: { color: string }) => s.color))).toEqual(new Set(["#000000"]));
  await expect(page.locator(".document-pane:not([hidden]) .ink-canvas")).toBeVisible();
  await page.screenshot({ path: "artifacts/photo-import.png" });
});
