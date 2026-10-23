import { chromium, expect } from "@playwright/test";
import { latest, draw, source, nameNewDocument } from "./helpers.ts";
const url = process.env.SLATE_TEST_URL;
if (!url?.startsWith("https://")) throw new Error("Set SLATE_TEST_URL to the deployed HTTPS URL.");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const [name, device] of [
    ["desktop", { viewport: { width: 1440, height: 960 } }],
    ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ]) {
    const context = await browser.newContext({ baseURL: url, ...device });
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().startsWith(new URL(url).origin))
        failed.push({ status: response.status(), url: response.url() });
    });
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
    await expect(page).toHaveTitle(/Slate/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    if (name === "desktop") {
      await page.keyboard.press("Control+n");
      await nameNewDocument(page);
      await page.getByLabel("Document title", { exact: true }).fill("Release smoke note");
      await source(page, "# Release smoke note\n\nLocal math: $p = mv$.\n");
      await page.getByRole("button", { name: "Reading", exact: true }).click();
      await expect(page.locator(".reading-prose .katex")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
        "Release smoke note",
      );
    } else {
      await page.getByRole("button", { name: "New note", exact: true }).tap();
      await page.getByRole("menuitem", { name: "Notebook", exact: true }).tap();
      await nameNewDocument(page);
      await expect(page.locator(".ink-canvas").first()).toBeVisible();
      await draw(page, { x: 40, y: 60 }, { x: 200, y: 120 });
      await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
      await page.reload();
      await expect(page.locator(".ink-canvas").first()).toBeVisible();
      expect((await latest(page)).pages[0].strokes.length).toBe(1);
    }
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration())?.active,
      undefined,
      { timeout: 45000 },
    );
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByLabel("Document title", { exact: true })).toBeVisible();
    await context.setOffline(false);
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
    results.push({
      name,
      launch: "pass",
      saveReload: "pass",
      offlineReload: "pass",
      errors,
      failed,
    });
    await context.close();
  }
  console.log(JSON.stringify({ url, results }, null, 2));
} finally {
  await browser.close();
}
