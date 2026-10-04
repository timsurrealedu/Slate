import { test, expect, type Page } from "@playwright/test";
import { ready, documents, latest } from "./helpers";

const content =
  "\n***\n\n## tags: \\[latihan, uas, scientificcomputing, numerical-differentiation]\n\n" +
  "# Practice\n\n<br />\n\nPractice questions with real content near the top.\n\n***\n\n## First problem\n\nUse a central difference.\n";

async function fixture(page: Page, noteContent = content) {
  await ready(page);
  await page.evaluate(async (content) => {
    const request = indexedDB.open("slate-workspace");
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction(["documents", "folders", "meta"], "readwrite");
    tx.objectStore("documents").clear();
    tx.objectStore("folders").clear();
    tx.objectStore("folders").put({ id: "course", name: "Course", color: "#385775" });
    const now = Date.now();
    tx.objectStore("documents").put({
      id: "practice",
      title: "Practice",
      folderId: null,
      content,
      kind: "note",
      pages: [],
      tags: [],
      revision: 1,
      starred: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
      openedAt: now,
    });
    tx.objectStore("meta").put(true, "initialized");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.removeItem("slate-session");
  }, noteContent);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
}

test("canceled desktop drags clear the library and nested folder highlights without moving notes", async ({
  page,
}) => {
  await fixture(page);
  const row = page.locator(".document-row");
  const library = page.locator(".library-scroll");
  const folder = page.locator(".library-folder");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  for (const end of ["dragend", "Escape", "blur", "outside-drop"]) {
    await row.dispatchEvent("dragstart", { dataTransfer });
    await library.dispatchEvent("dragover", { dataTransfer });
    await expect(library).toHaveAttribute("data-drop-target", "true");
    await folder.dispatchEvent("dragover", { dataTransfer });
    await expect(folder).toHaveAttribute("data-drop-target", "true");
    await expect(library).not.toHaveAttribute("data-drop-target", "true");
    if (end === "Escape") await page.keyboard.press("Escape");
    else if (end === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (end === "outside-drop")
      await page.locator(".workspace-topbar").dispatchEvent("drop", { dataTransfer });
    else await row.dispatchEvent("dragend", { dataTransfer });
    await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0);
    expect((await documents(page)).find((doc) => doc.id === "practice")?.folderId).toBeNull();
  }
  // A later valid drag must still move the note after every cancellation path.
  await row.dragTo(page.getByRole("button", { name: "Open folder Course", exact: true }));
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === "practice")?.folderId)
    .toBe("course");
  await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0);
});

test("a real mouse drag canceled with Escape restores the library", async ({ page }) => {
  await fixture(page);
  const source = (await page.locator(".document-row").boundingBox())!;
  const target = (await page.locator(".library-heading").boundingBox())!;
  await page.mouse.move(source.x + 80, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 100, source.y + source.height / 2, { steps: 5 });
  await page.mouse.move(target.x + 150, target.y + 20, { steps: 10 });
  await expect(page.locator(".library-scroll")).toHaveAttribute("data-drop-target", "true");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator('[data-drop-target="true"]')).toHaveCount(0);
  expect((await documents(page)).find((doc) => doc.id === "practice")?.folderId).toBeNull();
});

test("canceled touch drags remove highlights and the move label and allow the next drag", async ({
  page,
}) => {
  await fixture(page);
  const row = page.locator(".document-row");
  const target = page.locator(".library-folder");
  const a = (await row.boundingBox())!,
    b = (await target.boundingBox())!;
  for (const end of ["pointercancel", "Escape", "blur"]) {
    await row.dispatchEvent("pointerdown", {
      pointerType: "touch",
      pointerId: 7,
      clientX: a.x + 20,
      clientY: a.y + 20,
    });
    await expect(page.locator(".touch-drag-label")).toBeVisible();
    await row.dispatchEvent("pointermove", {
      pointerType: "touch",
      pointerId: 7,
      clientX: b.x + 20,
      clientY: b.y + 20,
    });
    await expect(target).toHaveAttribute("data-drop-target", "true");
    if (end === "Escape") await page.keyboard.press("Escape");
    else if (end === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await row.dispatchEvent("pointercancel", { pointerType: "touch", pointerId: 7 });
    await row.dispatchEvent("pointerup", {
      pointerType: "touch",
      pointerId: 7,
      clientX: b.x + 20,
      clientY: b.y + 20,
    });
    await expect(page.locator('[data-drop-target="true"], .touch-drag-label')).toHaveCount(0);
    await expect(row).toHaveAttribute("draggable", "true");
    expect((await documents(page)).find((doc) => doc.id === "practice")?.folderId).toBeNull();
  }
  await row.dispatchEvent("pointerdown", {
    pointerType: "touch",
    pointerId: 8,
    clientX: a.x + 20,
    clientY: a.y + 20,
  });
  await expect(page.locator(".touch-drag-label")).toBeVisible();
  await row.dispatchEvent("pointermove", {
    pointerType: "touch",
    pointerId: 8,
    clientX: b.x + 20,
    clientY: b.y + 20,
  });
  await row.dispatchEvent("pointerup", {
    pointerType: "touch",
    pointerId: 8,
    clientX: b.x + 20,
    clientY: b.y + 20,
  });
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === "practice")?.folderId)
    .toBe("course");
  await expect(page.locator('[data-drop-target="true"], .touch-drag-label')).toHaveCount(0);
});

test("YAML after leading blank lines keeps clickable tags and source line numbers", async ({
  page,
}) => {
  const padded =
    "\uFEFF\r\n \r\n---\r\ntags: [study, uas]\r\n---\r\n\r\n# Practice\r\n\r\nKeep this body.\r\n";
  await fixture(page, padded);
  await expect(page.locator(".recent-section .preview-tags")).toHaveText("#study#uas");
  await page.getByRole("button", { name: "Open Practice", exact: true }).click();
  await expect(page.locator(".editor-mount:visible .note-tags")).toHaveText("#study#uas");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose .note-tags")).toHaveText("#study#uas");
  await page.getByRole("button", { name: "Show line numbers", exact: true }).click();
  await expect(page.locator(".reading-block").first()).toHaveAttribute("data-source-line", "9");
  expect((await latest(page)).content).toBe(padded);
  await page.getByRole("textbox", { name: "File title", exact: true }).fill("Practice renamed");
  await page.getByRole("textbox", { name: "File title", exact: true }).press("Enter");
  const renamed = padded.replace("# Practice", "# Practice renamed");
  await expect.poll(async () => (await latest(page)).content).toBe(renamed);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("textbox", { name: "Markdown editor", exact: true }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("Edited line.\n");
  await expect.poll(async () => (await latest(page)).content).toBe(renamed + "Edited line.\r\n");
});

test("body tag lists render and filter consistently in live preview and reading without changing source", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Open Practice", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Document outline" }).getByRole("button"),
  ).toHaveText(["Practice", "First problem"]);
  for (const mode of ["Reading", "Live preview"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    const rendered = page.locator(
      mode === "Reading" ? ".reading-prose:visible" : ".editor-mount:visible",
    );
    await expect(rendered.locator(".note-tag-property .tag-link")).toHaveText([
      "#latihan",
      "#uas",
      "#scientificcomputing",
      "#numerical-differentiation",
    ]);
    await expect(rendered).not.toContainText("tags:");
    await rendered.locator('[data-tag="uas"]').click();
    await expect(page.getByRole("heading", { name: "#uas", exact: true })).toBeVisible();
    await expect(page.locator(".document-table .document-name")).toHaveText(["Practice"]);
    await page.locator(".document-table .document-name").click();
    expect((await latest(page)).content).toBe(content);
  }
});

test("note thumbnails show chips, a heading and body near the top in light, dark and mobile layouts", async ({
  page,
}) => {
  await fixture(page);
  for (const theme of ["light", "dark"]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: theme === "light" ? "Light" : "Dark", exact: true })
      .click();
    await page.keyboard.press("Escape");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 });
      const preview = page.locator(".recent-section .note-preview");
      await expect(preview.locator(".preview-tags .tag-link")).toHaveText([
        "#latihan",
        "#uas",
        "#scientificcomputing",
        "#numerical-differentiation",
      ]);
      await expect(preview).not.toContainText("tags:");
      const positions = await preview.evaluate((element) => {
        const top = element.closest(".document-preview")!.getBoundingClientRect().top;
        return {
          heading: element.querySelector("h1")!.getBoundingClientRect().top - top,
          body: element.querySelector("p")!.getBoundingClientRect().top - top,
        };
      });
      expect(positions.heading).toBeLessThan(85);
      expect(positions.body).toBeLessThan(115);
      await page.screenshot({ path: `artifacts/library-fixes-${theme}-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
  expect((await documents(page)).find((doc) => doc.id === "practice")?.content).toBe(content);
});
