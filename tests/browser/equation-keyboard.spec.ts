import { test, expect, type Page } from "@playwright/test";
import type { MathfieldElement } from "mathlive";
import { ready, latest, source } from "./helpers";

async function openEquation(page: Page) {
  const formatting = page.getByRole("button", { name: "Formatting", exact: true });
  if (await formatting.isVisible()) await formatting.click();
  await page.getByRole("button", { name: "Insert equation", exact: true }).click();
  await expect(page.locator("math-field")).toBeVisible();
  await page.locator('math-field [part="virtual-keyboard-toggle"]').click();
  await expect(page.locator(".ML__keyboard.is-visible")).toHaveCount(1);
}

async function key(page: Page, latex: string, touch: boolean) {
  const id = await page
    .locator(".MLK__layer.is-visible .MLK__keycap")
    .evaluateAll(
      (elements, value) =>
        elements.find(
          (element) => window.mathVirtualKeyboard.getKeycap(element.id)?.latex === value,
        )?.id,
      latex,
    );
  expect(id, `On-screen key for ${latex}`).toBeTruthy();
  if (touch) await page.locator("#" + id).tap();
  else await page.locator("#" + id).click();
  await expect(page.getByRole("dialog", { name: "Insert equation", exact: true })).toBeVisible();
}

for (const device of [
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "tablet", width: 820, height: 1180, touch: true },
  { name: "desktop", width: 1440, height: 960, touch: false },
]) {
  test.describe(device.name, () => {
    test.use({ viewport: { width: device.width, height: device.height }, hasTouch: device.touch });

    test("on-screen equation keys keep the popup open and insert a complete equation offline", async ({
      page,
      context,
    }) => {
      await ready(page);
      await page.getByRole("button", { name: "New note", exact: true }).click();
      await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
      await source(page, "# Keyboard equation\n\n");
      if (process.env.SLATE_PRODUCTION_TEST) {
        await page.evaluate(() => navigator.serviceWorker.ready);
        await expect
          .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
          .toBe(true);
        await context.setOffline(true);
      }
      await openEquation(page);
      for (const character of "123+45=168") await key(page, character, device.touch);
      await expect
        .poll(() =>
          page.locator("math-field").evaluate((element) => (element as MathfieldElement).value),
        )
        .toBe("123+45=168");
      const dialog = page.getByRole("dialog", { name: "Insert equation", exact: true });
      const insert = dialog.getByRole("button", { name: "Insert equation", exact: true });
      await insert.scrollIntoViewIfNeeded();
      const buttonBox = (await insert.boundingBox())!;
      const keyboardBox = (await page.locator(".MLK__plate").boundingBox())!;
      expect(buttonBox.y + buttonBox.height).toBeLessThan(keyboardBox.y);
      if (device.name === "phone")
        await page.screenshot({ path: "artifacts/final-equation-phone.png" });
      await insert.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".ML__keyboard")).toHaveCount(0);
      await expect.poll(async () => (await latest(page))?.content).toContain("$$\n123+45=168\n$$");
      await page.getByRole("button", { name: "Reading", exact: true }).click();
      await expect(page.locator(".reading-prose .katex")).toBeVisible();
      await expect(page.locator(".katex-error")).toHaveCount(0);
      await context.setOffline(false);
    });
  });
}

test.describe("phone dismissal", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Android Back dismisses the equation and keyboard without leaving the note", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.assign(window, { CapacitorCustomPlatform: { name: "android" } });
    });
    await ready(page);
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
    await source(page, "# Android Back\n\nKeep this note.");
    const url = page.url();
    await openEquation(page);
    await key(page, "1", true);
    await key(page, "2", true);
    const dispatch = (phase: string, progress = 0) =>
      page.evaluate(
        (detail) => {
          window.dispatchEvent(new CustomEvent("slate-native-back", { detail }));
        },
        { phase, progress, edge: 0 },
      );
    await dispatch("start");
    await dispatch("progress", 0.5);
    await dispatch("cancel");
    await expect(page.getByRole("dialog", { name: "Insert equation", exact: true })).toBeVisible();
    await expect(page.locator(".ML__keyboard.is-visible")).toHaveCount(1);
    await expect(page.locator(".navigation-stack")).not.toHaveClass(/back-preview/);
    await dispatch("start");
    await dispatch("progress", 0.7);
    await dispatch("commit");
    await expect(page.getByRole("dialog", { name: "Insert equation", exact: true })).toHaveCount(0);
    await expect(page.locator(".ML__keyboard")).toHaveCount(0);
    expect(page.url()).toBe(url);
    expect((await latest(page)).content).toBe("# Android Back\n\nKeep this note.");
  });

  test("closing, cancelling, Escape and outside taps clean up the keyboard and allow reopening", async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
    await source(page, "# Keep this note\n\nExisting text.");
    for (const action of ["Cancel", "Close", "Escape", "Outside"]) {
      await openEquation(page);
      await key(page, "1", true);
      await key(page, "2", true);
      const dialog = page.getByRole("dialog", { name: "Insert equation", exact: true });
      if (action === "Escape") await page.keyboard.press("Escape");
      else if (action === "Outside") await page.touchscreen.tap(4, 4);
      else await dialog.getByRole("button", { name: action, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".ML__keyboard")).toHaveCount(0);
      expect(await page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(false);
      expect(await page.evaluate(() => document.body.style.paddingBottom)).toBe("");
      expect((await latest(page)).content).toBe("# Keep this note\n\nExisting text.");
    }
    await openEquation(page);
    await expect
      .poll(() =>
        page.locator("math-field").evaluate((element) => (element as MathfieldElement).value),
      )
      .toBe("");
    await key(page, "3", true);
    await key(page, "4", true);
    await page
      .getByRole("dialog", { name: "Insert equation", exact: true })
      .getByRole("button", { name: "Insert equation", exact: true })
      .click();
    await expect.poll(async () => (await latest(page))?.content).toContain("$$\n34\n$$");
    await expect(page.locator(".ML__keyboard")).toHaveCount(0);
  });
});
