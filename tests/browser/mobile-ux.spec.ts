import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ready, latest, draw, source, nameNewDocument } from "./helpers";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

test("mobile vault controls are icons and import works through the vault menu", async ({
  page,
}) => {
  await ready(page);
  await expect(
    page.locator(".workspace-topbar").getByRole("button", { name: "Show library", exact: true }),
  ).toHaveCount(0);
  for (const name of ["Vault options", "New note", "Search workspace"]) {
    const button = page.getByRole("button", { name, exact: true });
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect((await button.innerText()).trim()).toBe("");
  }
  await page.getByRole("button", { name: "Vault options", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Open vault folder", exact: true }),
  ).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import documents", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "Mobile import.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Mobile import\n\nPreserved body.\n"),
  });
  await expect(page.getByLabel("File title", { exact: true })).toHaveValue("Mobile import");
  expect((await latest(page)).content).toContain("Preserved body.");
  await expect(page.locator(".workspace-topbar")).toBeHidden();
});

test("one heading renames Markdown, source changes persist, and mobile tools stay compact", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  await expect(page.locator(".document-tabs")).toBeHidden();
  await expect(page.locator(".editor-mount:visible h1")).toHaveCount(1);
  await expect(page.locator(".live-block h1")).toHaveCount(0);
  expect((await page.locator(".markdown-toolbar").boundingBox())!.height).toBeLessThanOrEqual(60);
  await page.getByRole("button", { name: "Document actions", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Rename file", exact: true })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Remove from Starred", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("File title", { exact: true }).fill("Semester reading");
  await page.getByLabel("File title", { exact: true }).press("Enter");
  await expect.poll(async () => (await latest(page))?.title).toBe("Semester reading");
  await expect.poll(async () => (await latest(page))?.content).toMatch(/^# Semester reading\n/);
  await source(
    page,
    "---\ntags: [study]\n---\n# Course reading\n\nKeep this paragraph.\n\n## This week\n",
  );
  await expect.poll(async () => (await latest(page))?.title).toBe("Course reading");
  await expect(page.getByLabel("File title", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page.getByRole("button", { name: "Formatting", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Insert or edit table", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Insert local image", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Note layout", exact: true }).click();
  await page.getByRole("button", { name: "Show line numbers", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-prose h1")).toHaveCount(1);
  await expect(page.locator(".reading-prose")).toContainText("Keep this paragraph.");
  await page.screenshot({ path: "artifacts/mobile-ux-reading.png" });
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((issue) => ["serious", "critical"].includes(issue.impact || "")),
  ).toEqual([]);
  await page.reload();
  await expect(page.getByLabel("File title", { exact: true })).toHaveValue("Course reading");
  expect((await latest(page)).content).toContain("Keep this paragraph.");
  await expect(page.locator(".cm-lineNumbers:visible")).toBeVisible();
  await page.screenshot({ path: "artifacts/mobile-ux-live.png" });
  expect(errors).toEqual([]);
});

test("library swipes open and close navigation with a bottom-button alternative", async ({
  page,
}) => {
  await ready(page);
  const library = page.locator(".library-pane");
  await library.dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: 170, clientY: 300 }],
  });
  await library.dispatchEvent("touchmove", {
    touches: [{ identifier: 1, clientX: 172, clientY: 360 }],
  });
  await expect(page.getByRole("dialog", { name: "Library", exact: true })).toHaveCount(0);
  await library.dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: 170, clientY: 300 }],
  });
  await library.dispatchEvent("touchmove", {
    touches: [{ identifier: 1, clientX: 270, clientY: 302 }],
  });
  await library.dispatchEvent("touchend", { touches: [] });
  const drawer = page.getByRole("dialog", { name: "Library", exact: true });
  await expect(drawer).toBeVisible();
  await drawer.dispatchEvent("touchstart", {
    touches: [{ identifier: 1, clientX: 200, clientY: 300 }],
  });
  await drawer.dispatchEvent("touchmove", {
    touches: [{ identifier: 1, clientX: 90, clientY: 302 }],
  });
  await drawer.dispatchEvent("touchend", { touches: [] });
  await expect(drawer).toHaveCount(0);
  await page
    .locator(".mobile-navigation")
    .getByRole("button", { name: "Library", exact: true })
    .click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/mobile-ux-library.png" });
});

test("notebook zoom reaches 1000 percent without blank frames and Fine ink is thinner", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await nameNewDocument(page);
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  await page.getByRole("button", { name: "Hide pages", exact: true }).click();
  await page.getByRole("button", { name: "Pen (P)", exact: true }).click();
  await page.getByRole("button", { name: "Fine", exact: true }).click();
  await page.keyboard.press("Escape");
  await draw(page, { x: 35, y: 70 }, { x: 165, y: 100 });
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  expect((await latest(page)).pages[0].strokes[0].width).toBe(0.6);
  const canvas = page.locator(".ink-canvas:visible");
  const savedPoints = (await latest(page)).pages[0].strokes[0].points;
  await canvas.evaluate((element, points) => {
    const canvas = element as HTMLCanvasElement;
    (window as any).inkFrames = { blank: 0, frames: 0, stopped: false };
    const sample = () => {
      const state = (window as any).inkFrames;
      if (state.stopped) return;
      state.frames++;
      const vector = canvas.parentElement!.querySelector(".ink-vector") as SVGSVGElement;
      let ready = !!vector?.isConnected && !!vector.querySelector("g path")?.getAttribute("d");
      if (!ready) {
        const raster = canvas.parentElement!.querySelector(
          ".ink-raster:not(.ink-live-raster)",
        ) as HTMLCanvasElement;
        if (
          raster &&
          getComputedStyle(raster).visibility === "visible" &&
          raster.width &&
          raster.height
        ) {
          const ctx = raster.getContext("2d")!,
            matrix = ctx.getTransform();
          const samples = points
            .map((p) => ({ x: p.x * matrix.a + matrix.e, y: p.y * matrix.d + matrix.f }))
            .filter((p) => p.x >= 0 && p.y >= 0 && p.x < raster.width && p.y < raster.height);
          // At high zoom, saved ink may legitimately lie outside the visible cache slice.
          ready =
            samples.length === 0 ||
            samples.some((p) => {
              const data = ctx.getImageData(Math.floor(p.x) - 1, Math.floor(p.y) - 1, 3, 3).data;
              return data.some((value, i) => i % 4 === 3 && value > 0);
            });
        }
      }
      if (!ready) state.blank++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, savedPoints);
  const viewport = page.locator(".page-viewport:visible");
  await viewport.dispatchEvent("wheel", { ctrlKey: true, deltaY: -4000 });
  await expect(page.locator(".zoom-control")).toContainText("1000%");
  await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.locator(".zoom-control")).toContainText("990%");
  await viewport.dispatchEvent("wheel", { ctrlKey: true, deltaY: 4000 });
  await expect(page.locator(".zoom-control")).toContainText("50%");
  await page.getByTitle("Fit page width", { exact: true }).click();
  await viewport.evaluate((element) => element.scrollTo(0, 0));
  const box = (await canvas.boundingBox())!;
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: box.x + 30, y: box.y + 120 },
      { x: box.x + 90, y: box.y + 120 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: box.x + 30, y: box.y + 120 },
      { x: box.x + 170, y: box.y + 120 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.locator(".zoom-control").innerText()).not.toContain("100%");
  expect((await latest(page)).pages[0].strokes).toHaveLength(1);
  await expect(page.getByRole("dialog", { name: "Library", exact: true })).toHaveCount(0);
  await page.getByTitle("Fit page width", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).inkFrames.frames)).toBeGreaterThan(8);
  const frames = await page.evaluate(() => {
    (window as any).inkFrames.stopped = true;
    return (window as any).inkFrames;
  });
  expect(frames.blank).toBe(0);
  await page.screenshot({ path: "artifacts/mobile-ux-notebook.png" });
  expect(errors).toEqual([]);
});

test("compact notes fit landscape and tablet widths while desktop retains its vault menu", async ({
  page,
  browser,
}) => {
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  for (const size of [
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.locator(".workspace-topbar")).toBeHidden();
    expect((await page.locator(".markdown-toolbar").boundingBox())!.height).toBeLessThanOrEqual(60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
  }
  await page.screenshot({ path: "artifacts/mobile-ux-tablet.png" });
  const desktop = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: { width: 1440, height: 960 },
    baseURL: process.env.SLATE_TEST_URL || "http://localhost:3000",
  });
  page = await desktop.newPage();
  await ready(page);
  await page.getByLabel("Open Oscillations & waves", { exact: true }).first().click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.locator(".slate-app")).toHaveClass(/with-sidebar/);
  await expect(page.locator(".sidebar")).toHaveCSS("width", "228px");
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  await expect(page.locator(".format-tools")).toBeVisible();
  await page.locator(".library-tab").click();
  await expect(page.locator(".workspace-topbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import documents", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Vault options", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Import documents", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".document-tab").first().locator("button").first().click();
  await page.screenshot({ path: "artifacts/mobile-ux-desktop.png" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".workspace-topbar")).toBeHidden();
  const title = page.getByLabel("File title", { exact: true });
  await expect.poll(() => title.evaluate((element) => element.clientHeight)).toBeGreaterThan(60);
  expect(await title.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
    true,
  );
  await page.screenshot({ path: "artifacts/mobile-ux-dark.png" });
  await desktop.close();
});
