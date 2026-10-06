import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest, source, draw } from "./helpers";

async function openNote(page: Page) {
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
}

test("Obsidian HTML, highlights, comments, callouts and tags render safely in both previews", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openNote(page);
  await source(
    page,
    '# Compatibility\n\nAlpha<br />Beta <u>underlined</u> H<sub>2</sub>O.\n\n==Highlighted **idea**==\n\n#2026/study #123_ #cafe\u0301 #日本語 #📚 \\#escaped #123 `#code`\n\n%% Hidden #comment %%\n\n%%\nSecond hidden paragraph\n\nHidden long #comment\n%%\n\n> [!note] Remember\n> Callout body.\n\n> [!tip]- Folded\n> Hidden until opened.\n\n| A | B |\n| - | - |\n| One<br />Two | Value |\n\n<script>window.bad = true</script><a href="javascript:alert(1)">Unsafe</a>\n',
  );
  for (const mode of ["Reading", "Live preview"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    const content =
      mode === "Reading"
        ? page.locator(".reading-prose:visible")
        : page.locator(".editor-mount:visible");
    await expect(content.locator("br")).toHaveCount(2);
    await expect(content.locator("u")).toHaveText("underlined");
    await expect(content.locator("mark")).toHaveText("Highlighted idea");
    await expect(content.locator(".tag-link")).toHaveText([
      "#2026/study",
      "#123_",
      "#cafe\u0301",
      "#日本語",
      "#📚",
    ]);
    await expect(content).not.toContainText("Hidden #comment");
    await expect(content).not.toContainText("Second hidden paragraph");
    await expect(content.locator(".prose-callout").first()).toContainText("Callout body.");
    const folded = content.locator("details");
    await expect(folded).not.toHaveAttribute("open");
    await folded.locator("summary").click();
    await expect(folded).toHaveAttribute("open", "");
    await expect(content.locator("script,a[href^='javascript:']")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`live preview retains the viewport and edits the clicked paragraph at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openNote(page);
    const content =
      "# Long note\n\n" +
      Array.from(
        { length: 65 },
        (_, i) =>
          `## Section ${i}\n\nParagraph ${i} has a unique cursor target and enough text to wrap across several lines on a small screen. Keep reading and editing here.\n\n`,
      ).join("");
    await source(page, content);
    await page.getByRole("button", { name: "Live preview", exact: true }).click();
    const scroller = page.locator(".cm-scroller:visible");
    const paragraph = page.locator(".live-block:visible").filter({ hasText: /^Paragraph 40 / });
    await paragraph.scrollIntoViewIfNeeded();
    const before = await scroller.evaluate((element) => element.scrollTop);
    expect(before).toBeGreaterThan(1000);
    const box = (await paragraph.boundingBox())!;
    await page.mouse.click(box.x + 80, box.y + Math.min(24, box.height / 2));
    await expect(
      page.locator(".cm-line:visible").filter({ hasText: /^Paragraph 40 / }),
    ).toBeVisible();
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before - 200);
    await page.keyboard.insertText("CLICKED ");
    await expect.poll(async () => (await latest(page)).content).toContain("CLICKED ");
    const edited = (await latest(page)).content;
    expect(edited.indexOf("CLICKED ")).toBeGreaterThan(edited.indexOf("## Section 40"));
    expect(edited.indexOf("CLICKED ")).toBeLessThan(edited.indexOf("## Section 41"));
    await page.getByRole("button", { name: "Reading", exact: true }).click();
    await page.getByRole("button", { name: "Live preview", exact: true }).click();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000);
    await page.screenshot({ path: `artifacts/behavior-scroll-${width}.png` });
  });
}

test("mobile note chrome recedes and both drawers track touch position before release", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNote(page);
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  await expect(page.locator(".mobile-navigation")).toBeHidden();
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  expect(await page.getByRole("menuitem").allTextContents()).toEqual([
    "Browse folders and files",
    "View links and outline",
    "Remove from Starred",
    "Rename file",
    "Export Markdown",
    "Move to folder",
    "Version history",
    "Move to Trash",
  ]);
  await page.keyboard.press("Escape");
  const touch = await context.newCDPSession(page);
  const send = (type: string, x?: number, y = 72) =>
    touch.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: x === undefined ? [] : [{ x, y }],
    });
  const frame = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  await send("touchStart", 50);
  await send("touchMove", 130);
  await frame();
  const library = page.getByRole("dialog", { name: "Library", exact: true });
  const first = (await library.boundingBox())!;
  expect(first.x).toBeLessThan(-100);
  expect(first.x + first.width).toBeGreaterThan(40);
  await send("touchMove", 210);
  await frame();
  const second = (await library.boundingBox())!;
  expect(second.x - first.x).toBeCloseTo(80, 0);
  await page.screenshot({ path: "artifacts/behavior-drawer-drag.png" });
  await send("touchEnd");
  await expect.poll(async () => (await library.boundingBox())?.x).toBe(0);
  await send("touchStart", 230);
  await send("touchMove", 30);
  await send("touchEnd");
  await expect(library).toHaveCount(0);
  await send("touchStart", 340);
  await send("touchMove", 235);
  await frame();
  const documentContext = page.getByRole("dialog", { name: "Document context", exact: true });
  const right = (await documentContext.boundingBox())!;
  expect(right.x).toBeGreaterThan(90);
  expect(right.x).toBeLessThan(390);
  await send("touchMove", 180);
  await send("touchEnd");
  await expect(
    page.getByRole("navigation", { name: "Document outline", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/behavior-mobile-context.png" });
  await page.getByRole("button", { name: "Close document context", exact: true }).click();
  await expect(documentContext).toHaveCount(0);
  await send("touchStart", 50);
  await send("touchMove", 115);
  await send("touchCancel");
  await expect(library).toHaveCount(0);
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.locator(".mobile-navigation")).toBeVisible();
});

test("desktop tabs reorder under the pointer and retain order, active note and content after reload", async ({
  page,
}) => {
  await openNote(page);
  for (const title of ["Second tab", "Third tab"]) {
    const previous = (await latest(page)).id;
    await page.keyboard.press("Control+n");
    await expect.poll(async () => (await latest(page))?.id).not.toBe(previous);
    const heading = page
      .locator(".document-pane:visible")
      .getByLabel("File title", { exact: true });
    await heading.fill(title);
    await heading.press("Enter");
    await expect.poll(async () => (await latest(page)).title).toBe(title);
  }
  const ids = await page
    .locator(".document-tab")
    .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.tabId!));
  const active = (await latest(page)).id;
  const first = (await page.locator(".document-tab").first().boundingBox())!;
  const last = (await page.locator(".document-tab").last().boundingBox())!;
  await page.mouse.move(first.x + 35, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 10, last.y + last.height / 2, { steps: 12 });
  await expect(page.locator(".document-tab.dragging")).toHaveCount(1);
  await page.mouse.up();
  const reordered = [ids[1], ids[2], ids[0]];
  await expect
    .poll(() =>
      page
        .locator(".document-tab")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLElement).dataset.tabId!),
        ),
    )
    .toEqual(reordered);
  expect((await latest(page)).id).toBe(active);
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".document-tab")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLElement).dataset.tabId!),
        ),
    )
    .toEqual(reordered);
  expect((await latest(page)).id).toBe(active);
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  await page.locator(".document-tab").last().locator("button").first().focus();
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expect
    .poll(() =>
      page
        .locator(".document-tab")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLElement).dataset.tabId!),
        ),
    )
    .toEqual([ids[1], ids[0], ids[2]]);
  await page.screenshot({ path: "artifacts/behavior-desktop-tabs.png" });
});

test("pen levels use even increments and vector paper and ink remain present at 1000 percent", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  for (const [index, level] of ["Fine", "Medium", "Bold", "Heavy"].entries()) {
    await page.getByRole("button", { name: "Pen (P)", exact: true }).click();
    await page.getByRole("button", { name: level, exact: true }).click();
    await page.keyboard.press("Escape");
    await draw(page, { x: 120, y: 110 + index * 45 }, { x: 240, y: 130 + index * 45 });
  }
  const widths = (await latest(page)).pages[0].strokes.map(
    (stroke: { width: number }) => stroke.width,
  );
  expect(widths[0]).toBe(0.6);
  for (let i = 1; i < widths.length; i++) expect(widths[i] - widths[i - 1]).toBeCloseTo(0.6);
  await page
    .locator(".page-viewport:visible")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -4000 });
  await expect(page.locator(".zoom-control")).toContainText("1000%");
  const vector = page.locator(".ink-vector:visible");
  await expect(vector.locator("g path")).toHaveCount(4);
  await expect(vector.locator(":scope > path").first()).not.toHaveAttribute("d", "");
  await page.getByRole("button", { name: "Undo ink", exact: true }).click();
  await expect(vector.locator("g path")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo ink", exact: true }).click();
  await expect(vector.locator("g path")).toHaveCount(4);
  await page.screenshot({ path: "artifacts/behavior-vector-1000.png" });
});

test("mobile settings fit small portrait and landscape viewports in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const theme of ["Light", "Dark"]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    for (const size of [
      { width: 375, height: 812 },
      { width: 812, height: 375 },
    ]) {
      await page.setViewportSize(size);
      const dialog = page.getByRole("dialog", { name: "Make Slate yours", exact: true });
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width - 8);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height - 8);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await expect(
        dialog.getByRole("heading", { name: "Make Slate yours", exact: true }),
      ).toBeInViewport();
      const footer = (await dialog.locator(".settings-footer").boundingBox())!;
      expect(Math.abs(footer.y + footer.height - box.y - box.height)).toBeLessThan(2);
      await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
      await page.screenshot({ path: `artifacts/behavior-settings-${theme}-${size.width}.png` });
    }
  }
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((issue) => ["serious", "critical"].includes(issue.impact || "")),
  ).toEqual([]);
});
