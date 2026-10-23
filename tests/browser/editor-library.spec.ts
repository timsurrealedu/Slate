import { test, expect } from "@playwright/test";
import { ready, source, latest, documents, nameNewDocument } from "./helpers";

test("touch long-press drag moves a note", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "New folder", exact: true }).first().click();
  await page.getByLabel("Folder name").fill("Touch course");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page.keyboard.press("Control+n");
  await nameNewDocument(page);
  await expect(page.getByLabel("Document title", { exact: true })).toBeVisible();
  const note = await latest(page);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  const row = page.locator(".document-row").filter({ hasText: note.title });
  await expect(page.locator(".library-pane")).not.toHaveClass(/library-behind/);
  await row.evaluate(async (element) => {
    await Promise.all(
      element
        .closest(".navigation-stack")!
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const target = page.getByRole("button", { name: "Open folder Touch course", exact: true });
  const a = (await row.boundingBox())!,
    b = (await target.boundingBox())!;
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
  await row.dispatchEvent("pointerup", {
    pointerType: "touch",
    pointerId: 7,
    clientX: b.x + 20,
    clientY: b.y + 20,
  });
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === note.id)?.folderId)
    .toBeTruthy();
  await expect(page.locator(".touch-drag-label")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/drag-and-drop-library.png" });
});

test("live preview matches reading blocks, edits source, renames the file and keeps completion readable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.keyboard.press("Control+n");
  await nameNewDocument(page);
  const text =
    "# Lecture\n\nA **clear** paragraph with *emphasis*.\n\n> A quotation.\n\n1. First\n2. Second\n\n---\n\n```js\nconst value = 1;\n```\n\n| Topic | Value |\n| --- | --- |\n| Study | 2 |\n\nEnd.\n";
  await source(page, text);
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  const live = page.locator(".editor-mount:visible");
  await expect(live.getByLabel("File title", { exact: true })).toHaveValue("Lecture");
  await expect(live.locator("h1")).toHaveCount(1);
  await expect(live.locator("pre code")).toHaveText("const value = 1;\n");
  await expect(live.locator("ol li")).toHaveText(["First", "Second"]);
  await expect(live.locator("blockquote")).toContainText("A quotation.");
  const html = await live
    .locator(".live-block")
    .evaluateAll((blocks) => blocks.map((block) => block.innerHTML).join(""));
  const blockPositions = await live
    .locator(".live-block > .markdown-block")
    .evaluateAll((blocks) => blocks.map((block) => block.getBoundingClientRect().y));
  const layout = await live.locator("h1").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width };
  });
  await page.screenshot({ path: "artifacts/live-preview-layout.png" });
  await page.getByLabel("File title", { exact: true }).fill("Study session");
  await page.getByLabel("File title", { exact: true }).press("Enter");
  await expect.poll(async () => (await latest(page))?.title).toBe("Study session");
  await expect
    .poll(async () => (await latest(page))?.content)
    .toBe(text.replace("# Lecture", "# Study session"));
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  expect(await page.locator(".reading-prose > div:last-child").innerHTML()).toBe(html);
  const readingPositions = await page
    .locator(".reading-prose > div:last-child > .markdown-block")
    .evaluateAll((blocks) => blocks.map((block) => block.getBoundingClientRect().y));
  expect(readingPositions).toHaveLength(blockPositions.length);
  readingPositions.forEach((y, index) =>
    expect(
      Math.abs(y - blockPositions[index]),
      JSON.stringify({ readingPositions, blockPositions }),
    ).toBeLessThan(2),
  );
  const readingLayout = await page.locator(".reading-prose h1").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width };
  });
  expect(readingLayout.x).toBeCloseTo(layout.x, 0);
  expect(readingLayout.y).toBeCloseTo(layout.y, 0);
  expect(readingLayout.width).toBeCloseTo(layout.width, 0);
  await page.screenshot({ path: "artifacts/reading-preview-layout.png" });
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await live
    .locator(".live-block p")
    .filter({ hasText: "End." })
    .click({ position: { x: 1, y: 8 } });
  await page.keyboard.type("Edited ");
  await expect.poll(async () => (await latest(page))?.content).toContain("Edited End.");
  await source(page, "- [ ] Review\n\n[Reference][ref]\n\n[ref]: https://example.com\n");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page.getByRole("checkbox", { name: "Complete task", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.content).toContain("- [x] Review");
  await expect(live.getByRole("link", { name: "Reference", exact: true })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  for (const theme of ["Dark", "Light"]) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: theme, exact: true }).click();
    await page.keyboard.press("Escape");
    await source(page, "[[Lin");
    await page.keyboard.press("Control+Space");
    await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
    const contrast = await page
      .locator(".cm-tooltip-autocomplete li")
      .first()
      .evaluate((element) => {
        const selected = getComputedStyle(element),
          tooltip = getComputedStyle(element.closest(".cm-tooltip")!);
        const rgb = (value: string) =>
          value
            .match(/\d+/g)!
            .slice(0, 3)
            .map(Number)
            .map((channel) => {
              const v = channel / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
        const luminance = (value: string) =>
          rgb(value).reduce(
            (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
            0,
          );
        const fg = luminance(selected.color),
          bg = luminance(
            selected.backgroundColor === "rgba(0, 0, 0, 0)"
              ? tooltip.backgroundColor
              : selected.backgroundColor,
          );
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `artifacts/editor-completion-${theme.toLowerCase()}.png` });
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("sidebar resize persists; folders offer note types and restore their deleted subtree", async ({
  page,
}) => {
  await ready(page);
  const resize = page.getByRole("separator", { name: "Resize library sidebar" });
  await resize.focus();
  await resize.press("ArrowRight");
  await expect(page.locator(".sidebar")).toHaveCSS("width", "244px");
  await page.reload();
  await expect(page.locator(".sidebar")).toHaveCSS("width", "244px");
  await page.getByRole("button", { name: "New folder", exact: true }).first().click();
  await page.getByLabel("Folder name").fill("Course");
  await page.getByRole("button", { name: "Create folder", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Folders", exact: true });
  await navigation.getByRole("button", { name: "Course", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New note", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "New note" })
      .getByRole("button", { name: "Markdown", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "New note" })
    .getByRole("button", { name: "Notebook", exact: true })
    .click();
  await nameNewDocument(page);
  await expect.poll(async () => (await latest(page))?.kind).toBe("notebook");
  const note = await latest(page);
  await navigation.getByRole("button", { name: "Course", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete folder", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "Course", exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === note.id)?.trashedAt)
    .toBeTruthy();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("button", { name: "Restore folder", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "Course", exact: true })).toBeVisible();
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === note.id)?.trashedAt)
    .toBeNull();
});

test("drag files and folders between sidebar, grid and breadcrumbs without allowing cycles", async ({
  page,
}) => {
  await ready(page);
  for (const name of ["Course", "Archive"]) {
    await page.getByRole("button", { name: "New folder", exact: true }).first().click();
    await page.getByLabel("Folder name").fill(name);
    await page.getByRole("button", { name: "Create folder", exact: true }).click();
  }
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page.keyboard.press("Control+n");
  await nameNewDocument(page);
  await expect(page.getByLabel("Document title", { exact: true })).toBeVisible();
  const note = await latest(page);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page
    .locator(".document-row")
    .filter({ hasText: note.title })
    .dragTo(page.getByRole("button", { name: "Open folder Course", exact: true }));
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === note.id)?.folderId)
    .toBeTruthy();
  const navigation = page.getByRole("navigation", { name: "Folders", exact: true });
  await navigation.getByRole("button", { name: "Course", exact: true }).click();
  await navigation
    .getByRole("button", { name: note.title, exact: true })
    .dragTo(
      page
        .getByRole("navigation", { name: "Workspace" })
        .getByRole("button", { name: "Library", exact: true }),
    );
  await expect
    .poll(async () => (await documents(page)).find((doc) => doc.id === note.id)?.folderId)
    .toBeNull();
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open folder Course", exact: true })
    .dragTo(page.getByRole("button", { name: "Open folder Archive", exact: true }));
  await navigation.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open folder Course", exact: true })).toBeVisible();
  await navigation
    .getByRole("button", { name: "Archive", exact: true })
    .dragTo(navigation.getByRole("button", { name: "Course", exact: true }));
  await expect(page.getByRole("alert")).toContainText("descendants");
  await page
    .getByRole("button", { name: "Open folder Course", exact: true })
    .dragTo(
      page
        .getByRole("navigation", { name: "Folder path" })
        .getByRole("button", { name: "Library", exact: true }),
    );
  await expect(navigation.getByRole("button", { name: "Course", exact: true })).toBeVisible();
});
