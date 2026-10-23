import { expect, type Page } from "@playwright/test";
export async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
}
export async function nameNewDocument(page: Page, name?: string) {
  const dialog = page.getByRole("dialog", { name: /^New (notebook|Markdown)$/ });
  const notebook = (await dialog.getByRole("textbox", { name: "Notebook name" }).count()) > 0;
  const input = dialog.getByRole("textbox");
  await input.fill(name ?? (notebook ? "Untitled notebook" : "Untitled note"));
  await dialog.getByRole("button", { name: /^Create (notebook|note)$/ }).click();
  await expect(dialog).toBeHidden();
}
export async function documents(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const r = indexedDB.open("slate-workspace");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("documents");
          const q = tx.objectStore("documents").getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
          tx.oncomplete = () => db.close();
        };
        r.onerror = () => reject(r.error);
      }),
  );
}
export async function latest(page: Page) {
  const id = new URL(page.url()).hash.slice(5);
  return (await documents(page)).find((d) => d.id === id);
}
export async function draw(page: Page, start = { x: 110, y: 120 }, end = { x: 330, y: 180 }) {
  const c = page.locator(".document-pane:not([hidden]) .ink-canvas");
  const b = (await c.boundingBox())!;
  await page.mouse.move(b.x + start.x, b.y + start.y);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++)
    await page.mouse.move(
      b.x + start.x + ((end.x - start.x) * i) / 30,
      b.y + start.y + ((end.y - start.y) * i) / 30,
    );
  await page.mouse.up();
}
export async function source(page: Page, text: string) {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const e = page.locator(".document-pane:not([hidden]) .cm-content");
  await e.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(text);
  await expect.poll(async () => (await latest(page))?.content).toBe(text);
}
