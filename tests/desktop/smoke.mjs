import { _electron, expect } from "@playwright/test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { latest, draw } from "../browser/helpers.ts";
const profile = mkdtempSync(join(tmpdir(), "slate-desktop-test-"));
const backup = join(profile, "export.slate.zip");
const errors = [];
let instance;
const titleField = (page) =>
  page.locator('[aria-label="Document title"]:visible, [aria-label="File title"]:visible').first();
async function launch() {
  instance = await _electron.launch({
    executablePath:
      process.platform === "win32"
        ? "artifacts/desktop/Slate-win32-x64/Slate.exe"
        : "artifacts/desktop/Slate-linux-x64/Slate",
    args:
      process.env.SLATE_CI_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    env: { ...process.env, SLATE_TEST_USER_DATA: profile, SLATE_TEST_HIDE_WINDOW: "1" },
    timeout: 60000,
  });
  const page = await instance.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".slate-app")).toBeVisible();
  await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
  return page;
}
async function closeNormally() {
  const closed = instance.waitForEvent("close");
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
}
try {
  let page = await launch();
  await expect(page.locator(".workspace-topbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import documents", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Vault options", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import documents", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "Desktop import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Desktop import\n\nKeep the imported body.\n"),
  });
  await expect(page.getByLabel("File title", { exact: true })).toHaveValue("Desktop import");
  await expect(page.locator(".editor-mount:visible h1")).toHaveCount(1);
  await page.getByLabel("File title", { exact: true }).fill("Desktop heading");
  await page.getByLabel("File title", { exact: true }).press("Enter");
  await expect.poll(async () => (await latest(page))?.title).toBe("Desktop heading");
  expect((await latest(page)).content).toBe("# Desktop heading\n\nKeep the imported body.\n");
  const importedId = (await latest(page)).id;
  await page.keyboard.press("Control+n");
  await expect.poll(async () => (await latest(page))?.id).not.toBe(importedId);
  await expect(titleField(page)).toHaveValue((await latest(page)).title);
  await titleField(page).fill("Native persistence");
  await titleField(page).press("Enter");
  await expect.poll(async () => (await latest(page))?.title).toBe("Native persistence");
  // Commit the hidden native window's new tab layout before pointer actions.
  await page.screenshot({ path: "artifacts/desktop-native-heading.png" });
  const pane = page.locator(".document-pane:not([hidden])");
  await pane.getByRole("button", { name: "Source", exact: true }).click();
  await pane.getByRole("textbox", { name: "Markdown editor", exact: true }).click();
  await page.keyboard.press("Control+A");
  const text = "# Native persistence\n\nSaved before the window closes.\n";
  await page.keyboard.insertText(text);
  // Close immediately after editing, then relaunch into the same isolated native profile.
  await closeNormally();
  page = await launch();
  await expect(titleField(page)).toHaveValue("Native persistence");
  await expect(page).toHaveURL(/#doc=.+$/);
  expect((await latest(page)).content).toBe(text);
  const formatting = page.getByRole("button", { name: "Formatting", exact: true });
  if (await formatting.isVisible()) await formatting.click();
  await page.getByRole("button", { name: "Insert equation", exact: true }).click();
  await expect(page.locator("math-field")).toBeVisible();
  await page.locator('math-field [part="virtual-keyboard-toggle"]').click();
  await expect(page.locator(".ML__keyboard.is-visible")).toHaveCount(1);
  for (const character of "123+45=168") {
    const id = await page
      .locator(".MLK__layer.is-visible .MLK__keycap")
      .evaluateAll(
        (elements, value) =>
          elements.find(
            (element) => window.mathVirtualKeyboard.getKeycap(element.id)?.latex === value,
          )?.id,
        character,
      );
    expect(id).toBeTruthy();
    await page.locator("#" + id).click();
    await expect(page.getByRole("dialog", { name: "Insert equation", exact: true })).toBeVisible();
  }
  await expect
    .poll(() => page.locator("math-field").evaluate((element) => element.value))
    .toBe("123+45=168");
  const insertEquation = page
    .getByRole("dialog", { name: "Insert equation", exact: true })
    .getByRole("button", { name: "Insert equation", exact: true });
  await insertEquation.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/final-${process.platform}-equation.png` });
  await insertEquation.click();
  await expect(page.locator(".ML__keyboard")).toHaveCount(0);
  await expect.poll(async () => (await latest(page))?.content).toContain("$$\n123+45=168\n$$");
  await page.keyboard.press("Control+Shift+n");
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  await expect
    .poll(() => page.workers().filter((worker) => worker.url().includes("ink-save.worker-")).length)
    .toBeGreaterThan(0);
  const inkWorker = page.workers().find((worker) => worker.url().includes("ink-save.worker-"));
  await inkWorker.evaluate(() => {
    globalThis.__slateInkWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "documents") globalThis.__slateInkWrites++;
      return put.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Pen (P)", exact: true }).click();
  await page.getByRole("button", { name: "Fine", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ink options", exact: true }).click();
  const pressure = page.getByRole("menuitemcheckbox", {
    name: "Pen pressure sensitivity",
    exact: true,
  });
  await expect(pressure).toHaveAttribute("aria-checked", "true");
  await pressure.click();
  await draw(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  await expect.poll(() => inkWorker.evaluate(() => globalThis.__slateInkWrites)).toBeGreaterThan(0);
  expect((await latest(page)).pages[0].strokes[0].width).toBe(0.6);
  expect((await latest(page)).pages[0].strokes[0]).toMatchObject({
    rendering: "precise",
    pressureSensitive: false,
  });
  await page
    .locator(".page-viewport:visible")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -4000 });
  await expect(page.locator(".zoom-control")).toContainText("1000%");
  await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
  await page.getByTitle("Fit page width", { exact: true }).click();
  await instance.evaluate(({ session }, file) => {
    session.defaultSession.on("will-download", (_event, item) => item.setSavePath(file));
  }, backup);
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "Open settings Command", exact: true }).click();
  await page.getByRole("button", { name: "Export workspace", exact: true }).click();
  await expect
    .poll(() => {
      if (!existsSync(backup)) return false;
      try {
        return !!unzipSync(readFileSync(backup))["manifest.json"];
      } catch {
        return false;
      }
    })
    .toBe(true);
  const files = unzipSync(readFileSync(backup));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.documents.length).toBe(9);
  expect(manifest.preferences.penPressure).toBe(false);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: "artifacts/desktop-native.png" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  await expect
    .poll(() => page.workers().filter((worker) => worker.url().includes("ink-save.worker-")).length)
    .toBeGreaterThan(0);
  expect((await latest(page)).pages[0].strokes.length).toBe(1);
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Ink options", exact: true }).click();
  await expect(pressure).toHaveAttribute("aria-checked", "false");
  await pressure.focus();
  await page.keyboard.press("Space");
  expect((await latest(page)).pages[0].strokes[0].pressureSensitive).toBe(false);
  // A failed save must keep the window alive and allow another close attempt.
  await instance.evaluate(({ dialog }) => {
    globalThis.__slateTestDialogs = { original: dialog.showMessageBox, messages: [] };
    dialog.showMessageBox = async (...args) => {
      globalThis.__slateTestDialogs.messages.push(args[args.length - 1].message);
      return { response: 0, checkboxChecked: false };
    };
  });
  await page.evaluate(() => {
    globalThis.__slateTestFlush = globalThis.__slateFlush;
    globalThis.__slateFlush = async () => {
      throw new Error("Injected save failure");
    };
  });
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect
    .poll(() => instance.evaluate(() => globalThis.__slateTestDialogs.messages.length))
    .toBe(1);
  expect(instance.windows().length).toBe(1);
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  await page.evaluate(() => {
    globalThis.__slateFlush = globalThis.__slateTestFlush;
  });
  await instance.evaluate(({ dialog }) => {
    dialog.showMessageBox = globalThis.__slateTestDialogs.original;
  });
  await closeNormally();
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        launch: "pass",
        vaultMenuImport: "pass",
        unifiedHeading: "pass",
        equationKeyboard: "pass",
        zoom1000AndFinePen: "pass",
        pressureToggleAndBackup: "pass",
        backgroundInkSavingAndOfflineWorker: "pass",
        immediateCloseSave: "pass",
        relaunch: "pass",
        ink: "pass",
        backupDownload: "pass",
        offlineReload: "pass",
        saveFailureKeepsOpen: "pass",
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  if (instance) await instance.close().catch(() => {});
}
