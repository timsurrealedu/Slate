import { test, expect } from "@playwright/test";
import { ready } from "./helpers";

test("mobile controls respect native system insets and Settings opens the existing dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.evaluate(() => {
    for (const [edge, value] of Object.entries({ top: 32, right: 8, bottom: 24, left: 8 }))
      document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
  });
  const topbar = await page.locator(".workspace-topbar").boundingBox();
  expect(topbar!.y).toBeGreaterThanOrEqual(32);
  expect(topbar!.x).toBeGreaterThanOrEqual(8);
  expect(topbar!.x + topbar!.width).toBeLessThanOrEqual(382);
  const navigation = page.locator(".mobile-navigation");
  const box = await navigation.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(820);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Markdown", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await navigation.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await navigation.getByRole("button", { name: "Library", exact: true }).click();
  const drawer = await page.getByRole("dialog", { name: "Library", exact: true }).boundingBox();
  expect(drawer!.y).toBeGreaterThanOrEqual(32);
  expect(drawer!.y + drawer!.height).toBeLessThanOrEqual(820);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/mobile-safe-area.png" });
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--safe-area-inset-bottom", "0px"),
  );
  const keyboardBox = await navigation.boundingBox();
  expect(keyboardBox!.y + keyboardBox!.height).toBe(844);
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await page.locator(".workspace-topbar").boundingBox();
  expect(landscape!.y).toBeGreaterThanOrEqual(32);
  expect(landscape!.x + landscape!.width).toBeLessThanOrEqual(836);
});
