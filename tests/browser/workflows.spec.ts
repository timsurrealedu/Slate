import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { ready, documents, latest, draw, source, nameNewDocument } from "./helpers";

test("Markdown keeps its source through all three modes, local images, links and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.keyboard.press("Control+n");
  await nameNewDocument(page);
  await page.getByLabel("Document title", { exact: true }).fill("Study session");
  const text =
    "# Study session\n\n## Key ideas\nA **clear** explanation with *emphasis* and `inline code`.\n\n- [ ] Review definitions\n- [x] Work through examples\n\nSee [[Linear transformations]] and [[New concept]].\n\n$$\nE = mc^2\n$$\n\n| Quantity | Meaning |\n| --- | --- |\n| E | Energy |\n\n```python\nprint('energy')\n```\n";
  await source(page, text);
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(page.locator(".document-pane:not([hidden]) .file-title textarea")).toHaveValue(
    "Study session",
  );
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose h2")).toHaveText("Key ideas");
  await expect(page.locator(".reading-prose .katex")).toBeVisible();
  await expect(page.locator(".reading-prose table")).toBeVisible();
  await page.screenshot({ path: "artifacts/reading.jpg", type: "jpeg", quality: 85 });
  await page.getByRole("link", { name: "New concept", exact: true }).click();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("New concept");
  await page.getByRole("button", { name: /^Links/ }).click();
  await expect(page.locator(".backlink")).toContainText("Study session");
  await page.getByRole("button", { name: "Study session", exact: true }).first().click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Insert local image", exact: true }).click();
  await page.getByLabel("Import local image").setInputFiles("artifacts/fixtures/sample.png");
  await expect.poll(async () => (await latest(page))?.content).toContain("attachment:");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose img")).toHaveJSProperty("complete", true);
  await expect
    .poll(() =>
      page
        .locator(".reading-prose img")
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const saved = (await latest(page)).content;
  await page.reload();
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Study session");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  expect((await latest(page)).content).toBe(saved);
  await expect(page.locator(".document-pane:not([hidden]) .cm-content")).toContainText("**clear**");
  expect(errors).toEqual([]);
});

test("Notebook uses recent paper, ink is reversible, pages duplicate and ink survives reopening", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Open Problem set 03", { exact: true }).first().click();
  const visibleInk = () =>
    page
      .locator(".ink-vector:visible g path")
      .evaluateAll((paths) =>
        paths.reduce((sum, path) => sum + (path.getAttribute("d") || "").length, 0),
      );
  await expect.poll(visibleInk).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Close Problem set 03", exact: true }).click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await nameNewDocument(page);
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await page.getByRole("button", { name: "Lined", exact: true }).click();
  await page.getByRole("button", { name: "Warm paper", exact: true }).click();
  await page.keyboard.press("Escape");
  await draw(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  await page.getByRole("button", { name: "Undo ink", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(0);
  await page.getByRole("button", { name: "Redo ink", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  const original = (await latest(page)).pages[0].strokes[0].points[0];
  await page.getByRole("button", { name: "Select ink (V)", exact: true }).click();
  await draw(page, { x: 90, y: 90 }, { x: 360, y: 210 });
  await draw(page, { x: 170, y: 140 }, { x: 210, y: 190 });
  await expect
    .poll(async () => (await latest(page))?.pages[0].strokes[0].points[0].x)
    .toBeGreaterThan(original.x);
  await page.getByRole("button", { name: "Page actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate page", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.pages.length).toBe(2);
  const copied = await latest(page);
  expect(copied.pages[0].strokes[0].id).not.toBe(copied.pages[1].strokes[0].id);
  await page.getByRole("button", { name: "Page actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move earlier", exact: true }).click();
  await expect(page.locator(".notebook-page-label")).toContainText("Page 1");
  await page.screenshot({ path: "artifacts/notebook.jpg", type: "jpeg", quality: 85 });
  await page.reload();
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  expect((await latest(page)).pages[0].strokes).toHaveLength(1);
  await expect.poll(visibleInk).toBeGreaterThan(100);
  await page.keyboard.press("Control+Shift+n");
  await nameNewDocument(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(0);
  expect((await latest(page)).pages[0].paper).toMatchObject({ style: "lined", color: "#fffef6" });
});

test("PDF and DOCX imports read locally and annotated exports preserve the source", async ({
  page,
}) => {
  await ready(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByLabel("Import local documents")
    .setInputFiles("artifacts/fixtures/Energy lecture.pdf");
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Energy lecture");
  await expect(page.locator(".pdf-canvas")).toBeVisible();
  await expect(page.locator('[aria-label="Text of PDF page 1"]')).toContainText(
    "Conservation of energy",
  );
  await draw(page, { x: 90, y: 125 }, { x: 370, y: 125 });
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator('[aria-label="Text of PDF page 2"]')).toContainText("rotated page");
  await draw(page, { x: 80, y: 100 }, { x: 300, y: 150 });
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  const annotated = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export annotated PDF", exact: true }).click();
  const output = await annotated;
  await output.saveAs("artifacts/annotated.pdf");
  const out = await PDFDocument.load(readFileSync("artifacts/annotated.pdf"));
  expect(out.getPageCount()).toBe(2);
  expect(out.getPage(1).getRotation().angle).toBe(90);
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  const original = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export original file", exact: true }).click();
  await (await original).saveAs("artifacts/original.pdf");
  expect(readFileSync("artifacts/original.pdf")).toEqual(
    readFileSync("artifacts/fixtures/Energy lecture.pdf"),
  );
  await page
    .getByLabel("Import local documents")
    .setInputFiles("artifacts/fixtures/Reading seminar.docx");
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue("Reading seminar");
  await expect(page.locator(".docx-prose")).toContainText("preserving the original file");
  expect(errors).toEqual([]);
});

test("Backup downloads verifiable documents and restores additively", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Control+n");
  await nameNewDocument(page);
  await source(page, "# Backup test\n\nImportant local work.");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace", exact: true }).click();
  await (await download).saveAs("artifacts/workspace.slate.zip");
  const files = unzipSync(readFileSync("artifacts/workspace.slate.zip"));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.documents.length).toBe(7);
  await page.getByLabel("Choose workspace backup").setInputFiles("artifacts/workspace.slate.zip");
  await expect(page.locator(".toast")).toContainText("Restored 7 documents");
  expect((await documents(page)).length).toBe(14);
});

test("Keyboard search, folders and Trash complete a recoverable organization flow", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "New folder", exact: true }).first().click();
  await page.getByLabel("Folder name").fill("Semester three");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await page.keyboard.press("Control+n");
  await nameNewDocument(page);
  await page.getByLabel("Document title", { exact: true }).fill("Revision checklist");
  await source(page, "# Revision checklist\n\nSpectral decomposition is on the exam.");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("spectral");
  await expect(page.getByRole("option").first()).toContainText("Revision checklist");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Document title", { exact: true })).toHaveValue(
    "Revision checklist",
  );
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () => (await documents(page)).find((d) => d.title === "Revision checklist")?.trashedAt,
    )
    .toBeNull();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".empty-state")).toContainText("A clean slate");
});

test("Light and dark desktop and phone layouts pass accessibility and stay within the viewport", async ({
  page,
}) => {
  await ready(page);
  let results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/library-light.jpg", type: "jpeg", quality: 85 });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page.screenshot({ path: "artifacts/library-dark.jpg", type: "jpeg", quality: 85 });
  for (const width of [1000, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".mobile-navigation")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.screenshot({ path: "artifacts/phone-library.jpg", type: "jpeg", quality: 85 });
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await nameNewDocument(page);
  await expect(page.locator(".ink-canvas").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/phone-notebook.jpg", type: "jpeg", quality: 85 });
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});
