import { _electron, expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { source, latest } from "../browser/helpers.ts";

const scratch = resolve("artifacts/tests");
mkdirSync(scratch, { recursive: true });
const profile = mkdtempSync(join(scratch, "native-vault-"));
const root = join(profile, "Existing vault");
mkdirSync(join(root, "Course"), { recursive: true });
mkdirSync(join(root, "Archived elsewhere"), { recursive: true });
const text = "# Lesson\n\nExisting Markdown.\n\n![Diagram](diagram.png)\n";
writeFileSync(join(root, "Course", "Lesson.md"), text);
writeFileSync(join(root, "Course", "diagram.png"), readFileSync("artifacts/fixtures/sample.png"));
const errors = [];
let instance;
async function launch() {
  instance = await _electron.launch({
    executablePath:
      process.platform === "win32"
        ? "artifacts/desktop/Slate-win32-x64/Slate.exe"
        : "artifacts/desktop/Slate-linux-x64/Slate",
    env: { ...process.env, SLATE_TEST_USER_DATA: profile, SLATE_TEST_HIDE_WINDOW: "1" },
    timeout: 60000,
  });
  const page = await instance.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
  return page;
}
async function close() {
  const closed = instance.waitForEvent("close");
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed;
}
try {
  let page = await launch();
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
  await instance.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, root);
  await page.locator(".vault-button").click();
  await page.getByRole("menuitem", { name: "Open vault folder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Archived elsewhere", exact: true })).toHaveCount(
    1,
  );
  await page.getByLabel("Open Lesson", { exact: true }).first().click();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose h1")).toHaveCount(1);
  await expect(
    page.locator(".reading-prose").getByLabel("File title", { exact: true }),
  ).toHaveValue("Lesson");
  await expect
    .poll(() => page.locator(".reading-prose img").evaluate((element) => element.naturalWidth))
    .toBeGreaterThan(0);
  const revised = text + "\nSaved to the existing folder.\n";
  await source(page, revised);
  await expect.poll(() => readFileSync(join(root, "Course", "Lesson.md"), "utf8")).toBe(revised);
  await close();
  rmSync(join(root, "Archived elsewhere"), { recursive: true });
  page = await launch();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Lesson");
  await expect(page).toHaveURL(/#doc=.+$/);
  expect((await latest(page)).content).toBe(revised);
  await expect(page.getByRole("button", { name: "Archived elsewhere", exact: true })).toHaveCount(
    0,
  );
  const originalId = (await latest(page)).id;
  await page
    .getByRole("navigation", { name: "Folders", exact: true })
    .getByRole("button", { name: "Course", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename folder", exact: true }).click();
  await page.getByLabel("Folder name").fill("Studies");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => readFileSync(join(root, "Studies", "Lesson.md"), "utf8")).toBe(revised);
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename file", exact: true }).click();
  await page.getByLabel("File name").fill("Lecture");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const renamed = revised.replace("# Lesson\n", "# Lecture\n");
  await expect.poll(() => readFileSync(join(root, "Studies", "Lecture.md"), "utf8")).toBe(renamed);
  expect((await latest(page)).id).toBe(originalId);
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose h1")).toHaveCount(1);
  await expect(
    page.locator(".reading-prose").getByLabel("File title", { exact: true }),
  ).toHaveValue("Lecture");
  await expect
    .poll(() => page.locator(".reading-prose img").evaluate((element) => element.naturalWidth))
    .toBeGreaterThan(0);
  await close();
  page = await launch();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Lecture");
  await expect(page).toHaveURL(/#doc=.+$/);
  expect((await latest(page)).id).toBe(originalId);
  await page.locator(".library-tab").click();
  await page.locator(".vault-button").click();
  await page.getByRole("menuitem", { name: "Open local workspace", exact: true }).click();
  await expect(
    page.getByLabel("Open Linear transformations", { exact: true }).first(),
  ).toBeVisible();
  expect(readFileSync(join(root, "Studies", "Lecture.md"), "utf8")).toBe(renamed);
  await close();
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      nativeVault: "pass",
      writeThrough: "pass",
      localImages: "pass",
      relaunch: "pass",
      localWorkspaceRetained: "pass",
      renameAndStableIdentity: "pass",
      externalFolderDeletionOnStartup: "pass",
    }),
  );
} finally {
  if (instance) await instance.close().catch(() => {});
  if (!profile.startsWith(scratch + sep)) throw new Error("Invalid test cleanup path.");
  rmSync(profile, { recursive: true, force: true });
}
