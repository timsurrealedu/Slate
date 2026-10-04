import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { ready, latest, draw } from "./helpers";

async function notebook(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await expect(page.locator(".workspace-topbar-slot")).toBeHidden();
  await page.getByRole("button", { name: "Hide pages", exact: true }).click();
}

async function anchor(page: Page, x: number, y: number) {
  return page.locator(".paper-page:visible").evaluate(
    (element, { x, y }) => {
      const rect = element.getBoundingClientRect();
      return { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
    },
    { x, y },
  );
}

test("phone pinch and two-finger pan retain the paper point under the moving midpoint", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await notebook(page);
  const before = await anchor(page, 245, 450);
  const session = await context.newCDPSession(page);
  const send = (type: string, x: number, y: number, distance: number) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd" || type === "touchCancel"
          ? []
          : [
              { x: x - distance / 2, y, id: 1 },
              { x: x + distance / 2, y, id: 2 },
            ],
    });
  await send("touchStart", 245, 450, 60);
  for (let i = 1; i <= 6; i++) await send("touchMove", 245 + i * 2, 450 - i * 3, 60 + i * 12);
  await expect(page.locator(".zoom-control")).toContainText("220%");
  const after = await anchor(page, 257, 432);
  expect(after.x).toBeCloseTo(before.x, 2);
  expect(after.y).toBeCloseTo(before.y, 2);
  await send("touchMove", 267, 442, 132);
  await expect.poll(async () => (await anchor(page, 267, 442)).x).toBeCloseTo(before.x, 2);
  const panned = await anchor(page, 267, 442);
  expect(panned.x).toBeCloseTo(before.x, 2);
  expect(panned.y).toBeCloseTo(before.y, 2);
  await send("touchEnd", 0, 0, 0);
  expect((await latest(page)).pages[0].strokes).toHaveLength(0);
  await page.screenshot({ path: "artifacts/final-pinch-phone.png" });
});

test("desktop wheel zoom keeps an off-centre paper point under the pointer", async ({ page }) => {
  await notebook(page);
  const box = (await page.locator(".paper-page:visible").boundingBox())!;
  const x = box.x + box.width * 0.7,
    y = box.y + 260;
  const before = await anchor(page, x, y);
  await page
    .locator(".page-viewport:visible")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -312, clientX: x, clientY: y });
  await expect(page.locator(".zoom-control")).toContainText("200%");
  const after = await anchor(page, x, y);
  expect(after.x).toBeCloseTo(before.x, 2);
  expect(after.y).toBeCloseTo(before.y, 2);
});

test("pinch in and out keeps the drawing buffer stable until release and settles without jumping", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await notebook(page);
  await draw(page);
  const saved = (await latest(page)).pages[0].strokes;
  const session = await context.newCDPSession(page);
  const frame = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  const send = (type: string, distance: number) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd" || type === "touchCancel"
          ? []
          : [
              { x: 245 - distance / 2, y: 450, id: 1 },
              { x: 245 + distance / 2, y: 450, id: 2 },
            ],
    });
  const canvas = page.locator(".ink-canvas:visible");
  await send("touchStart", 40);
  await frame();
  const original = await canvas.evaluate((element) => {
    const metrics = {
      resizes: 0,
      observer: new MutationObserver((mutations) => {
        metrics.resizes += mutations.length;
      }),
    };
    metrics.observer.observe(element, { attributes: true, attributeFilter: ["width", "height"] });
    (window as any).__pinchMetrics = metrics;
    return { width: element.offsetWidth, height: element.offsetHeight };
  });
  const layouts: number[] = [];
  for (const scale of [1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8, 3.6, 3.4, 3.2, 3, 2.8, 2.6]) {
    await send("touchMove", 40 * scale);
    await frame();
    layouts.push(await canvas.evaluate((element) => element.offsetWidth));
  }
  const during = await page.evaluate(() => (window as any).__pinchMetrics.resizes);
  const preview = (await page.locator(".paper-page:visible").boundingBox())!;
  await send("touchEnd", 0);
  await frame();
  const settled = (await page.locator(".paper-page:visible").boundingBox())!;
  const after = await page.evaluate(() => {
    const metrics = (window as any).__pinchMetrics;
    metrics.observer.disconnect();
    return metrics.resizes;
  });
  await writeFile(
    "artifacts/pinch-rendering.json",
    JSON.stringify(
      {
        frames: layouts.length,
        canvasDimensionWritesDuringGesture: during,
        canvasDimensionWritesAfterRelease: after,
        originalLayout: original,
        preview,
        settled,
      },
      null,
      2,
    ),
  );
  expect(layouts.every((width) => width === original.width)).toBe(true);
  expect(during).toBe(0);
  expect(after).toBeLessThanOrEqual(2);
  expect(after).toBeGreaterThan(0);
  expect(settled.x).toBeCloseTo(preview.x, 0);
  expect(settled.y).toBeCloseTo(preview.y, 0);
  expect(settled.width).toBeCloseTo(preview.width, 0);
  expect((await latest(page)).pages[0].strokes).toEqual(saved);
  await expect(page.locator(".zoom-control")).toContainText("260%");
  await expect(page.locator(".paper-page:visible")).not.toHaveClass(/pinching/);
  for (const [initial, distance, end, label] of [
    [120, 240, "touchEnd", "500%"],
    [160, 14, "touchCancel", "50%"],
  ] as const) {
    await send("touchStart", initial);
    await send("touchMove", distance);
    await frame();
    const beforeRelease = (await page.locator(".paper-page:visible").boundingBox())!;
    await send(end, 0);
    await frame();
    const afterRelease = (await page.locator(".paper-page:visible").boundingBox())!;
    expect(afterRelease.x).toBeCloseTo(beforeRelease.x, 0);
    expect(afterRelease.y).toBeCloseTo(beforeRelease.y, 0);
    await expect(page.locator(".zoom-control")).toContainText(label);
    await expect(page.locator(".paper-page:visible")).not.toHaveClass(/pinching/);
  }
  expect((await latest(page)).pages[0].strokes).toEqual(saved);
});

for (const width of [390, 1440]) {
  test(`open notebook title renames in place and preserves ink at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await notebook(page);
    await draw(page);
    await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
    const before = await latest(page);
    const titlebar = (await page.locator(".document-titlebar").boundingBox())!;
    const title = page.getByRole("textbox", { name: "Document title", exact: true });
    await title.fill("Final study notebook");
    await title.press("Enter");
    await expect.poll(async () => (await latest(page)).title).toBe("Final study notebook");
    expect((await latest(page)).id).toBe(before.id);
    expect((await latest(page)).pages).toEqual(before.pages);
    expect((await page.locator(".document-titlebar").boundingBox())!.height).toBe(titlebar.height);
    await title.fill("Cancelled title");
    await title.press("Escape");
    await expect(title).toHaveValue("Final study notebook");
    await page.reload();
    await expect(title).toHaveValue("Final study notebook");
    expect((await latest(page)).pages).toEqual(before.pages);
  });
}

test("mobile Markdown uses one compact toolbar and floating reading statistics in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await expect(page.locator(".workspace-topbar-slot")).toBeHidden();
  const toolbar = (await page.locator(".markdown-toolbar").boundingBox())!;
  expect(toolbar.height).toBeLessThanOrEqual(45);
  for (const name of ["Live preview", "Source", "Reading"]) {
    const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  const mode = page.getByRole("button", { name: "Reading", exact: true });
  await page.getByRole("button", { name: "Note layout", exact: true }).click();
  for (const button of [mode, page.getByRole("button", { name: "Note layout", exact: true })]) {
    const mark = await button.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      const border = style.boxSizing === "border-box" ? 0 : 2 * parseFloat(style.borderLeftWidth);
      return { width: parseFloat(style.width) + border, height: parseFloat(style.height) + border };
    });
    expect(mark.width).toBe(32);
    expect(mark.height).toBe(32);
  }
  await expect(page.locator(".floating-surface")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "artifacts/final-markdown-phone-layout.png" });
  await page.keyboard.press("Escape");
  const stats = page.locator(".note-footnote");
  await expect(stats).toContainText("words");
  const box = (await stats.boundingBox())!;
  expect(box.width).toBeLessThan(250);
  expect(await stats.evaluate((element) => getComputedStyle(element).position)).toBe("absolute");
  const surface = (await page.locator(".markdown-surface").boundingBox())!;
  expect(surface.y + surface.height).toBe(844);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const scan = await new AxeBuilder({ page }).analyze();
    expect(
      scan.violations.filter((issue) => ["serious", "critical"].includes(issue.impact || "")),
    ).toEqual([]);
    await page.screenshot({ path: `artifacts/final-markdown-phone-${theme}.png` });
  }
});

test("predictive Back previews the library, cancels safely and animates a committed return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await expect(page.locator(".workspace-topbar-slot")).toBeHidden();
  const id = (await latest(page)).id;
  const dispatch = (phase: string, progress: number, edge = 0) =>
    page.evaluate(
      (detail) => {
        window.dispatchEvent(new CustomEvent("slate-native-back", { detail }));
      },
      { phase, progress, edge },
    );
  const stack = page.locator(".navigation-stack");
  const shell = page.locator(".document-shell");
  for (const edge of [0, 1]) {
    await dispatch("start", 0, edge);
    await dispatch("progress", 0.65, edge);
    await expect(stack).toHaveClass(/back-preview/);
    await expect(page.locator(".library-pane")).toBeVisible();
    const transform = await shell.evaluate((element) => getComputedStyle(element).transform);
    expect(transform).not.toBe("none");
    expect((await latest(page)).id).toBe(id);
    await page.screenshot({ path: `artifacts/final-back-preview-${edge}.png` });
    await dispatch("cancel", 0, edge);
    await expect(stack).not.toHaveClass(/back-preview/);
    expect(await shell.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  }
  await dispatch("start", 0);
  await dispatch("progress", 0.5);
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-topbar")).toBeVisible();
  await expect(stack).not.toHaveClass(/back-preview/);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await expect.poll(async () => (await latest(page))?.id).toBe(id);
});

test("mobile library and notes have no persistent side handles; menus and header swipes open either panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator(".drawer-edge,[data-drawer-edge]")).toHaveCount(0);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await expect(page.locator(".workspace-topbar-slot")).toBeHidden();
  await expect(page.locator(".drawer-edge,[data-drawer-edge]")).toHaveCount(0);
  for (const side of ["left", "right"]) {
    await page.getByRole("button", { name: "Document actions", exact: true }).click();
    await page
      .getByRole("menuitem", {
        name: side === "left" ? "Browse folders and files" : "View links and outline",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("dialog", {
        name: side === "left" ? "Library" : "Document context",
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const header = page.locator(".document-name");
  for (const direction of [1, -1]) {
    await header.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 195, clientY: 24 }],
    });
    await header.dispatchEvent("touchmove", {
      touches: [{ identifier: 1, clientX: 195 + direction * 140, clientY: 25 }],
    });
    await header.dispatchEvent("touchend", { touches: [] });
    await expect(
      page.getByRole("dialog", {
        name: direction === 1 ? "Library" : "Document context",
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("reduced motion returns immediately and suppresses predictive spatial transforms", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("slate-native-back", { detail: { phase: "start", progress: 0.8, edge: 0 } }),
    );
  });
  await expect(page.locator(".navigation-stack")).not.toHaveClass(/back-preview/);
  expect(
    await page
      .locator(".document-shell")
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe("none");
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
});
