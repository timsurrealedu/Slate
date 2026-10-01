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
async function launch() {
  instance = await _electron.launch({
    executablePath: process.platform === "win32" ? "artifacts/desktop/Slate-win32-x64/Slate.exe" : "artifacts/desktop/Slate-linux-x64/Slate",
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
  await page.keyboard.press("Control+n");
  await page.getByLabel("Document title", { exact: true }).fill("Native persistence");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown editor", exact: true }).click();
  await page.keyboard.press("Control+A");
  const text = "# Native persistence\n\nSaved before the window closes.\n";
  await page.keyboard.insertText(text);
  // Close immediately after editing, then relaunch into the same isolated native profile.
  await closeNormally();
  page = await launch();
  await page.getByRole("button", { name: "Open Native persistence", exact: true }).click();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    "Native persistence",
  );
  expect((await latest(page)).content).toBe(text);
  await page.keyboard.press("Control+Shift+n");
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  await draw(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  await instance.evaluate(({ session }, file) => {
    session.defaultSession.on("will-download", (_event, item) => item.setSavePath(file));
  }, backup);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
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
  expect(manifest.documents.length).toBe(8);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: "artifacts/desktop-native.png" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  expect((await latest(page)).pages[0].strokes.length).toBe(1);
  await page.context().setOffline(false);
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
