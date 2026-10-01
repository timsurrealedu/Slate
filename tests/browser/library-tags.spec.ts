import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, documents, latest } from "./helpers";

const content =
  "---\ntags: [moc, domain, ideas]\n" +
  Array.from({ length: 30 }, (_, index) => `property${index}: value`).join("\n") +
  "\n---\n# Ideas — Map of Content\n\nHub for researched ideas and project concepts.\n\n## Bank\n- Automated project\n- Research notes\n\nMore #ideas to explore.\n";

async function fixture(page: Page) {
  await ready(page);
  await page.evaluate(async (text) => {
    const open = indexedDB.open("slate-workspace");
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const tx = db.transaction(["documents", "folders", "meta"], "readwrite");
    tx.objectStore("documents").clear();
    tx.objectStore("folders").clear();
    const now = Date.now();
    for (const folder of [
      { id: "project", name: "Projects" },
      { id: "ideas", name: "Ideas", parentId: "project" },
      { id: "math", name: "Math", parentId: "ideas" },
      { id: "hidden", name: ".private" },
      { id: "hidden-sub", name: "Private ideas", parentId: "hidden" },
    ])
      tx.objectStore("folders").put({ color: "#385775", ...folder });
    for (const [id, title, folderId, content] of [
      ["ideas-note", "Ideas", "ideas", text],
      ["related", "Other idea", "project", "# Other idea\n\nTagged #ideas."],
      ["secret", "Secret note", "hidden-sub", "# Secret"],
      ["dot-note", ".draft", null, "Hidden file"],
      ["home", "Home", null, "# Home\n\nStart here."],
    ])
      tx.objectStore("documents").put({
        id,
        title,
        folderId,
        content,
        kind: "note",
        pages: [],
        tags: [],
        revision: 1,
        starred: false,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
        openedAt: id === "ideas-note" ? now + 10 : now,
      });
    tx.objectStore("meta").put(true, "initialized");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.removeItem("slate-session");
  }, content);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
}

test("sidebar expands parents and library opens one level with breadcrumbs and renaming", async ({
  page,
}) => {
  await fixture(page);
  const sidebar = page.getByRole("navigation", { name: "Folders", exact: true });
  await expect(sidebar.getByRole("button", { name: "Ideas", exact: true })).toHaveCount(0);
  await expect(page.locator(".folder-grid .library-folder")).toHaveCount(1);
  await page.getByRole("button", { name: "Open folder Projects", exact: true }).click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Ideas", exact: true })).toBeVisible();
  await expect(page.locator(".folder-grid .library-folder")).toHaveCount(1);
  await expect(page.locator(".document-table .document-name")).toHaveText(["Other idea"]);
  await page.getByRole("button", { name: "Open folder Ideas", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Folder path" })).toHaveText(
    "LibraryProjectsIdeas",
  );
  await expect(page.locator(".document-table .document-name")).toHaveText(["Ideas"]);
  await page
    .getByRole("button", { name: "Open folder Math", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename folder", exact: true }).click();
  await page.getByLabel("Folder name").fill("Equations");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open folder Equations", exact: true }),
  ).toBeVisible();
  await page.locator(".document-table .document-name").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename file", exact: true }).click();
  await page.getByLabel("File name").fill("Project ideas");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator(".document-table .document-name")).toHaveText(["Project ideas"]);
  const note = (await documents(page)).find((doc) => doc.id === "ideas-note");
  expect(note.content).toBe(content);
  await page.locator(".document-table .document-name").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Version history", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Folder path" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await expect(page.locator(".folder-grid .library-folder")).toHaveCount(1);
  await page.reload();
  expect((await documents(page)).find((doc) => doc.id === "ideas-note").title).toBe(
    "Project ideas",
  );
});

test("hidden files, folders and descendants stay hidden in navigation and search until enabled", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.getByRole("button", { name: "Open folder .private", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(".draft", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Secret note");
  await expect(page.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Show hidden files", { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open folder .private", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(".draft", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Secret note");
  await expect(page.getByRole("option")).toContainText("Secret note");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Show hidden files", { exact: true })).toBeChecked();
  await page.getByLabel("Show hidden files", { exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Secret note");
  await expect(page.getByRole("option")).toHaveCount(0);
  expect((await documents(page)).some((doc) => doc.id === "secret")).toBe(true);
});

test("tags render as clickable metadata in both modes and previews show body content at the top", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  const preview = page
    .locator(".recent-section .kind-note")
    .filter({ hasText: "Ideas" })
    .first()
    .locator(".note-preview");
  await expect(preview).toContainText("Hub for researched ideas");
  await expect(preview.locator(".preview-tags")).toHaveText("#moc#domain#ideas");
  const topSpace = await preview
    .locator(".preview-tags")
    .evaluate(
      (tags) =>
        tags.getBoundingClientRect().top -
        tags.closest(".document-preview")!.getBoundingClientRect().top,
    );
  expect(topSpace).toBeLessThan(30);
  await page.getByRole("button", { name: "Open Ideas", exact: true }).click();
  await expect(page.locator(".editor-mount:visible .note-metadata")).toHaveText(
    "#moc#domain#ideasEdit properties",
  );
  await expect(page.locator(".editor-mount:visible")).not.toContainText("tags: [");
  await page.locator(".editor-mount:visible .note-tags [data-tag=ideas]").click();
  await expect(page.getByRole("heading", { name: "#ideas", exact: true })).toBeVisible();
  await expect(page.locator(".document-table .document-name")).toHaveText(["Ideas", "Other idea"]);
  await page
    .locator(".document-table .document-name")
    .filter({ hasText: /^\s*Ideas\s*$/ })
    .click();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose h1")).toHaveCount(1);
  await page.getByRole("button", { name: "Show line numbers", exact: true }).click();
  await expect(page.locator(".reading-block").first()).toHaveAttribute("data-source-line", "34");
  await page.locator(".reading-prose .note-tags [data-tag=domain]").click();
  await expect(page.locator(".document-table .document-name")).toHaveText(["Ideas"]);
  await page.locator(".document-table .document-name").click();
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page.getByRole("button", { name: "Edit properties", exact: true }).click();
  await expect(page.locator(".cm-content:visible")).toContainText("tags: [moc, domain, ideas]");
  expect((await latest(page)).content).toBe(content);
  expect(errors).toEqual([]);
});

test("hierarchy and tags keep the Slate layout accessible on desktop and phone", async ({
  page,
}) => {
  await fixture(page);
  await page.screenshot({ path: "artifacts/folders-library-light.png" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/folders-library-dark.png" });
  await page.getByRole("button", { name: "Open Ideas", exact: true }).click();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page.screenshot({ path: "artifacts/tags-reading-dark.png" });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: "artifacts/tags-reading-phone.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 812, height: 375 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
