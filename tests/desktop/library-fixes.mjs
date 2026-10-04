import { _electron, expect } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documents, latest } from "../browser/helpers.ts";

const profile = mkdtempSync(join(tmpdir(), "slate-library-fixes-"));
const content =
  "\n***\n\n## tags: \\[latihan, uas, study/math]\n\n# Practice\n\n<br />\n\nReal practice content.\n";
const app = await _electron.launch({
  executablePath:
    process.platform === "win32"
      ? "artifacts/desktop/Slate-win32-x64/Slate.exe"
      : "artifacts/desktop/Slate-linux-x64/Slate",
  env: { ...process.env, SLATE_TEST_USER_DATA: profile, SLATE_TEST_HIDE_WINDOW: "1" },
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
  await page.getByRole("button", { name: "Vault options", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import documents", exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: "Practice.md", mimeType: "text/markdown", buffer: Buffer.from(content) });
  await expect(page.locator(".editor-mount:visible .note-tag-property")).toHaveText(
    "#latihan#uas#study/math",
  );
  const note = await latest(page);
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose .note-tag-property")).toHaveText(
    "#latihan#uas#study/math",
  );
  expect((await latest(page)).content).toBe(content);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  const preview = page
    .locator(".recent-section .document-card")
    .filter({ hasText: "Practice" })
    .locator(".note-preview");
  await expect(preview.locator(".preview-tags")).toHaveText("#latihan#uas#study/math");
  await expect(preview).toContainText("Real practice content.");
  await expect(preview).not.toContainText("tags:");
  const row = page.locator(".document-row").filter({ hasText: "Practice" });
  await row.scrollIntoViewIfNeeded();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent("dragstart", { dataTransfer });
  await page.locator(".library-scroll").dispatchEvent("dragover", { dataTransfer });
  await expect(page.locator(".library-scroll")).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0);
  await row.dispatchEvent("dragend", { dataTransfer });
  const saved = (await documents(page)).find((doc) => doc.id === note.id);
  expect(saved.folderId).toBeNull();
  expect(saved.content).toBe(content);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      nativeDragCancel: "pass",
      tagRendering: "pass",
      contentPreview: "pass",
      sourcePreserved: "pass",
      errors,
    }),
  );
} finally {
  await app.close();
}
