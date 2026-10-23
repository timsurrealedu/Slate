import { test, expect, type Page } from "@playwright/test";
import { ready, nameNewDocument } from "./helpers";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 1440, height: 850 } });

async function bounds(page: Page, selector: string, top = 0, right = 0, bottom = 0, left = 0) {
  const box = (await page.locator(selector).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBe(left);
  expect(box.y).toBe(top);
  expect(box.x + box.width).toBe(viewport.width - right);
  expect(box.y + box.height).toBe(viewport.height - bottom);
}

test("tablet library and notebook reach all edges after rotation, cutout changes and keyboard resizing", async ({
  page,
}) => {
  await ready(page);
  await bounds(page, ".slate-app");
  await bounds(page, ".workspace-shell");
  expect((await page.locator(".workspace-topbar").boundingBox())!.y).toBe(0);
  await page.screenshot({ path: "artifacts/viewport-tablet-library.png" });

  await page.getByRole("button", { name: "New note", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).tap();
  await nameNewDocument(page);
  await page.getByRole("button", { name: "Hide pages", exact: true }).tap();
  await bounds(page, ".workspace-shell");
  expect((await page.locator(".document-titlebar").boundingBox())!.y).toBe(0);
  const paper = page.locator(".notebook-paper-area");
  const area = (await paper.boundingBox())!;
  expect(area.y + area.height).toBe(850);
  await page.screenshot({ path: "artifacts/viewport-tablet-notebook.png" });

  // Android publishes only real cutouts, then clears them when rotation removes them.
  await page.evaluate(() => {
    for (const [edge, value] of Object.entries({ top: 24, right: 12, bottom: 16, left: 32 }))
      document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
  });
  await bounds(page, ".slate-app");
  await bounds(page, ".workspace-shell", 24, 12, 16, 32);
  expect((await page.locator(".document-titlebar").boundingBox())!.y).toBe(24);
  const insetArea = (await paper.boundingBox())!;
  expect(insetArea.y + insetArea.height).toBe(834);

  await page.evaluate(() => {
    for (const edge of ["top", "right", "bottom", "left"])
      document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, "0px");
  });
  await page.setViewportSize({ width: 850, height: 1440 });
  await bounds(page, ".workspace-shell");
  await page.setViewportSize({ width: 850, height: 620 });
  await bounds(page, ".workspace-shell");
  const keyboardArea = (await paper.boundingBox())!;
  expect(keyboardArea.y + keyboardArea.height).toBe(620);
  const tools = (await page.getByRole("group", { name: "Ink tools", exact: true }).boundingBox())!;
  expect(tools.y + tools.height).toBeLessThanOrEqual(620);

  await page.setViewportSize({ width: 1440, height: 850 });
  await page.reload();
  await expect(paper).toBeVisible();
  await bounds(page, ".workspace-shell");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await bounds(page, ".workspace-shell");
  const darkArea = (await paper.boundingBox())!;
  expect(darkArea.y + darkArea.height).toBe(850);
  await page.screenshot({ path: "artifacts/viewport-tablet-dark.png" });
});
