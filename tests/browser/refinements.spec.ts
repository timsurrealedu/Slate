import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest, draw, source } from "./helpers";

async function vim(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Vim keybindings", { exact: true }).check();
  await page.keyboard.press("Escape");
}
async function ex(page: Page, command: string) {
  await page.keyboard.type(":" + command);
  await page.keyboard.press("Enter");
}

test("Creation has two choices; line numbers, dark gutters and column layout are shared", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator(".quick-banner")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New Notebook", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Markdown", "Notebook"]);
  await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
  await source(page, "# Lecture\n\nA paragraph.\n\nAnother paragraph.\n");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show line numbers", exact: true }).click();
  await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  const gutter = await page.locator(".cm-gutters:visible").evaluate((element) => {
    const css = getComputedStyle(element);
    const panel = document.createElement("span");
    panel.style.backgroundColor = "var(--panel)";
    panel.style.color = "var(--muted)";
    element.append(panel);
    const expected = getComputedStyle(panel);
    const result = {
      background: css.backgroundColor,
      color: css.color,
      panel: expected.backgroundColor,
      muted: expected.color,
    };
    panel.remove();
    return result;
  });
  expect(gutter.background).toBe(gutter.panel);
  expect(gutter.color).toBe(gutter.muted);
  const y = await page.evaluate(() => {
    const line = document.querySelector(".cm-line")!.getBoundingClientRect();
    const number = [...document.querySelectorAll(".cm-lineNumbers .cm-gutterElement")]
      .find((element) => element.textContent === "1")!
      .getBoundingClientRect();
    return Math.abs(line.y - number.y);
  });
  expect(y).toBeLessThan(3);
  await page.getByRole("button", { name: "Note layout", exact: true }).click();
  await page.getByRole("slider", { name: /Column width/ }).fill("600");
  await page.getByRole("slider", { name: /Left margin/ }).fill("24");
  await page.getByRole("slider", { name: /Right margin/ }).fill("72");
  await page.getByLabel("Column position").selectOption("left");
  await page.keyboard.press("Escape");
  for (const mode of ["Live preview", "Source", "Reading"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    const target = mode === "Reading" ? ".reading-prose" : ".cm-content:visible";
    expect(
      await page.locator(target).evaluate((element) => {
        const css = getComputedStyle(element);
        return [css.maxWidth, css.paddingLeft, css.paddingRight];
      }),
    ).toEqual(["600px", "24px", "72px"]);
    if (mode === "Reading")
      await expect(page.locator(".reading-block").first()).toHaveAttribute("data-line-number", "3");
    else await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  }
  await page.getByRole("button", { name: "Show line numbers", exact: true }).click();
  await expect(page.locator(".reading-block[data-line-number]")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".markdown-surface")).toHaveCSS("--editor-width", "600px");
  await page.screenshot({ path: "artifacts/refinements-dark.jpg", type: "jpeg", quality: 85 });
});

test("Vim edits Markdown, toggles universal numbers and navigates reading mode", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("Control+n");
  await source(page, "Alpha\nBeta\n");
  await vim(page);
  await page.locator(".cm-content:visible").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg0i");
  await page.keyboard.type("Study ");
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await latest(page))?.content).toBe("Study Alpha\nBeta\n");
  await ex(page, "set number");
  await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  await ex(page, "set nonumber");
  await expect(page.locator(".cm-lineNumbers:visible")).toHaveCount(0);
  await ex(page, "set number!");
  await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  await ex(page, "w");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page.locator(".reading-scroll").focus();
  await ex(page, "set nonumber");
  await expect(page.locator(".reading-block[data-line-number]")).toHaveCount(0);
  await ex(page, "set nu");
  await expect(page.locator(".reading-block").first()).toHaveAttribute("data-line-number", "1");
  await page.reload();
  await expect(page.getByRole("button", { name: "Show line numbers" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Visual tables update cells and equations compose offline without raw LaTeX", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.keyboard.press("Control+n");
  await source(page, "# Physics\n\n");
  await page.getByRole("button", { name: "Insert or edit table", exact: true }).click();
  await page.getByLabel("Table rows").fill("2");
  await page.getByLabel("Table columns").fill("2");
  for (const [name, value] of [
    ["Row 1, column 1", "Quantity"],
    ["Row 1, column 2", "Value"],
    ["Row 2, column 1", "Mass"],
    ["Row 2, column 2", "5"],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.content).toContain("| Mass | 5 |");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page.locator(".live-block table").getByRole("cell", { name: "5", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit table", exact: true })).toBeVisible();
  await page.getByLabel("Row 2, column 2", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Update table", exact: true }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.locator(".cm-content:visible").click();
  await page.keyboard.press("Control+End");
  if (process.env.SLATE_PRODUCTION_TEST) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
  }
  await page.getByRole("button", { name: "Insert equation", exact: true }).click();
  await expect(page.locator("math-field")).toBeVisible();
  await page.locator("math-field").click();
  await page.keyboard.type("1/2");
  await expect
    .poll(() => page.locator("math-field").evaluate((element: any) => element.value))
    .toMatch(/frac/);
  await page.screenshot({ path: "artifacts/equation-composer.jpg", type: "jpeg", quality: 85 });
  await page.getByRole("button", { name: "Insert equation", exact: true }).last().click();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose .katex")).toBeVisible();
  await expect(page.locator(".reading-prose .katex-error")).toHaveCount(0);
  await expect(
    page.locator(".reading-prose table").getByRole("cell", { name: "10", exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("Selection scales and rotates with reversible saved geometry", async ({ page }) => {
  await ready(page);
  await page.keyboard.press("Control+Shift+n");
  await draw(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  const before = (await latest(page)).pages[0].strokes[0];
  await page.getByRole("button", { name: "Select ink (V)", exact: true }).click();
  await draw(page, { x: 80, y: 80 }, { x: 380, y: 220 });
  await page.getByRole("button", { name: "Transform selected ink", exact: true }).click();
  await page.getByRole("button", { name: "Make larger", exact: true }).click();
  await expect
    .poll(async () => (await latest(page))?.pages[0].strokes[0].width)
    .toBeCloseTo(before.width * 1.1);
  await page.getByRole("button", { name: /Rotate right/ }).click();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await latest(page))?.pages[0].strokes[0].points[0].y)
    .not.toBe(before.points[0].y);
  await page.getByRole("button", { name: "Undo ink", exact: true }).click();
  await page.getByRole("button", { name: "Undo ink", exact: true }).click();
  await expect
    .poll(async () => (await latest(page))?.pages[0].strokes[0].points)
    .toEqual(before.points);
  await page.getByRole("button", { name: "Redo ink", exact: true }).click();
  await page.reload();
  await expect
    .poll(async () => (await latest(page))?.pages[0].strokes[0].width)
    .toBeCloseTo(before.width * 1.1);
});

test("Two fingers pan while finger ink is on; double two-finger tap undoes without stray ink", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).tap();
  await draw(page, { x: 40, y: 120 }, { x: 220, y: 170 });
  await page
    .getByRole("button", { name: "Touch pans. Switch to touch drawing", exact: true })
    .tap();
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
  const session = await context.newCDPSession(page);
  const b = (await page.locator(".ink-canvas:visible").boundingBox())!;
  const x = Math.max(80, b.x + 65),
    y = Math.max(330, b.y + 190);
  const points = (offset: number) => [
    { x, y: y - offset, id: 1 },
    { x: x + 100, y: y - offset, id: 2 },
  ];
  const scroll = page.locator(".page-viewport");
  const original = await scroll.evaluate((element) => element.scrollTop);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
  for (let i = 1; i <= 6; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(i * 12),
    });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(original + 20);
  expect((await latest(page)).pages[0].strokes).toHaveLength(1);
  for (let i = 0; i < 2; i++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(0);
  await context.close();
});

test("Android keyboard detection leaves soft input ordinary and activates Vim on the first hardware key", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Tablet) AppleWebKit/537.36 Chrome/134.0 Safari/537.36",
  });
  const page = await context.newPage();
  await ready(page);
  await page.keyboard.press("Control+n");
  await source(page, "Alpha\n");
  await vim(page);
  await page.reload();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.locator(".cm-content:visible").click();
  await page.keyboard.insertText("soft");
  await expect(page.locator(".cm-vim-panel:visible")).toHaveCount(0);
  const before = (await latest(page)).content;
  await page.keyboard.press("i");
  await expect(page.locator(".cm-vim-panel:visible")).toContainText("INSERT");
  await page.keyboard.type("keyboard");
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await latest(page))?.content.length)
    .toBe(before.length + "keyboard".length);
  await ex(page, "set number");
  await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  await context.close();
});
