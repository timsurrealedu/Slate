import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ready, latest } from "./helpers";

for (const stream of [
  "missing-down",
  "missing-up",
  "repeated-down",
  "capture-failure",
  "barrel-held",
] as const) {
  test(`pen contact survives ${stream} without losing or joining letters`, async ({ page }) => {
    await loadedNotebook(page, 0);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const expected = await page.locator(".ink-canvas:visible").evaluate((element, stream) => {
      const canvas = element as HTMLCanvasElement,
        b = canvas.getBoundingClientRect();
      if (stream !== "capture-failure") canvas.setPointerCapture = () => {};
      let time = performance.now();
      const make = (type: string, x: number, y: number, buttons = 1, pressure = 0.5) => {
        const e = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: "pen",
          pointerId: 9876,
          clientX: b.left + x,
          clientY: b.top + y,
          buttons,
          pressure,
        });
        Object.defineProperty(e, "timeStamp", { value: ++time });
        return e;
      };
      if (stream !== "missing-down")
        canvas.dispatchEvent(
          make(
            "pointerdown",
            160,
            160,
            stream === "barrel-held" ? 2 : 1,
            stream === "barrel-held" ? 0 : 0.5,
          ),
        );
      const first = [
        make("pointermove", 160, 160),
        make("pointermove", 165, 150),
        make("pointermove", 175, 155),
      ];
      const parent = make("pointerrawupdate", 500, 500);
      Object.defineProperty(parent, "getCoalescedEvents", { value: () => first });
      canvas.dispatchEvent(parent);
      if (stream === "missing-up" || stream === "barrel-held")
        canvas.dispatchEvent(make("pointermove", 400, 400, stream === "barrel-held" ? 2 : 0, 0));
      else if (stream !== "repeated-down")
        document.body.dispatchEvent(make("pointerup", 175, 155, 0, 0));
      if (stream !== "missing-down" && stream !== "capture-failure") {
        canvas.dispatchEvent(
          make(stream === "repeated-down" ? "pointerdown" : "pointermove", 220, 160),
        );
        document.body.dispatchEvent(make("pointermove", 230, 170));
        document.body.dispatchEvent(make("pointerup", 230, 170, 0, 0));
      }
      return {
        count: stream === "missing-down" || stream === "capture-failure" ? 1 : 2,
        scaleX: 794 / b.width,
        scaleY: 1123 / b.height,
      };
    }, stream);
    await expect
      .poll(async () => (await latest(page)).pages[0].strokes.length)
      .toBe(expected.count);
    const strokes = (await latest(page)).pages[0].strokes;
    for (const [i, positions] of [
      [
        [160, 160],
        [165, 150],
        [175, 155],
      ],
      [
        [220, 160],
        [230, 170],
      ],
    ]
      .slice(0, expected.count)
      .entries()) {
      expect(strokes[i].points).toHaveLength(positions.length);
      positions.forEach(([x, y], j) => {
        expect(strokes[i].points[j].x / expected.scaleX).toBeCloseTo(x, 7);
        expect(strokes[i].points[j].y / expected.scaleY).toBeCloseTo(y, 7);
      });
    }
    expect(errors).toEqual([]);
    await page.reload();
    expect((await latest(page)).pages[0].strokes).toEqual(strokes);
  });
}

test("active canvas inking avoids hidden SVG work and publishes vectors after settling", async ({
  page,
}) => {
  await loadedNotebook(page, 0);
  const session = await page.context().newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const report = await canvas.evaluate(async (element) => {
    const set = SVGElement.prototype.setAttribute;
    let paths = 0;
    SVGElement.prototype.setAttribute = function (name, value) {
      if (name === "d" && this.closest(".ink-vector, .ink-live-vector")) paths++;
      return set.call(this, name, value);
    };
    const id = Number((element as HTMLElement).dataset.pointer),
      b = element.getBoundingClientRect();
    const times: number[] = [];
    let previous = performance.now();
    for (let frame = 0; frame < 40; frame++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      times.push(now - previous);
      previous = now;
      for (let j = 0; j < 16; j++)
        element.dispatchEvent(
          new PointerEvent("pointerrawupdate", {
            bubbles: true,
            pointerType: "pen",
            pointerId: id,
            buttons: 1,
            pressure: 0.5,
            clientX: b.left + 160 + frame * 2 + j / 8,
            clientY: b.top + 160 + Math.sin((frame * 16 + j) / 9) * 10,
          }),
        );
    }
    SVGElement.prototype.setAttribute = set;
    times.sort((a, b) => a - b);
    return { paths, p95: times[Math.floor(times.length * 0.95)] };
  });
  await writeFile("artifacts/ink-contact-hot-path.json", JSON.stringify(report, null, 2));
  expect(report.paths).toBe(0);
  await lift(session, box.x + 241, box.y + 165);
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  await expect(page.locator(".ink-vector > g:not(.ink-live) path").first()).toBeAttached();
  await session.detach();
});

test("losing pointer capture during contact keeps one continuous stroke", async ({ page }) => {
  await loadedNotebook(page, 0);
  const session = await page.context().newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  await canvas.evaluate((element) => {
    const b = element.getBoundingClientRect(),
      id = Number((element as HTMLElement).dataset.pointer);
    for (const [type, x, y] of [
      ["pointermove", 170, 150],
      ["lostpointercapture", 170, 150],
      ["pointermove", 180, 160],
    ] as const)
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: id,
          pointerType: "pen",
          clientX: b.left + x,
          clientY: b.top + y,
          pressure: 0.5,
          buttons: 1,
        }),
      );
  });
  await lift(session, box.x + 180, box.y + 160);
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  expect((await latest(page)).pages[0].strokes[0].points).toHaveLength(3);
  await session.detach();
});

test("distinct coordinates sharing a hardware timestamp survive raw overlap", async ({ page }) => {
  await loadedNotebook(page, 0);
  const session = await page.context().newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  await canvas.evaluate((element) => {
    const b = element.getBoundingClientRect(),
      id = Number((element as HTMLElement).dataset.pointer);
    const time = performance.now() + 1;
    const make = (type: string, x: number, y: number) => {
      const e = new PointerEvent(type, {
        bubbles: true,
        pointerType: "pen",
        pointerId: id,
        buttons: 1,
        pressure: 0.5,
        clientX: b.left + x,
        clientY: b.top + y,
      });
      Object.defineProperty(e, "timeStamp", { value: time });
      return e;
    };
    const points = [
      make("pointerrawupdate", 160, 160),
      make("pointerrawupdate", 165, 150),
      make("pointerrawupdate", 175, 155),
    ];
    const raw = make("pointerrawupdate", 175, 155);
    Object.defineProperty(raw, "getCoalescedEvents", { value: () => points });
    element.dispatchEvent(raw);
    const replay = make("pointermove", 175, 155);
    Object.defineProperty(replay, "getCoalescedEvents", { value: () => points.slice(1) });
    element.dispatchEvent(replay);
    element.dispatchEvent(make("pointermove", 178, 160));
  });
  await lift(session, box.x + 178, box.y + 160);
  await expect.poll(async () => (await latest(page)).pages[0].strokes.length).toBe(1);
  const doc = await latest(page),
    points = doc.pages[0].strokes[0].points;
  expect(points).toHaveLength(4);
  expect(points[1].t).toBe(points[3].t);
  expect(points[3].x).toBeCloseTo((178 * doc.pages[0].width) / box.width, 7);
  await session.detach();
});

test("pen contact after pauses keeps long-stroke notebook layout within the empty-page budget", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    baseURL: process.env.SLATE_TEST_URL || "http://localhost:3000",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  const results: { count: number; layouts: number[] }[] = [];
  try {
    for (const count of [0, 200]) {
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await loadedNotebook(page, count, 512, true);
      const original = await storedInkPrefix(page, count);
      await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const layouts: number[] = [];
      for (let contact = 0; contact < 2; contact++) {
        const before = (await session.send("Performance.getMetrics")).metrics;
        const { canvas, box } = await startPen(page, session);
        const after = (await session.send("Performance.getMetrics")).metrics;
        layouts.push(
          1000 *
            (after.find((m) => m.name === "LayoutDuration")!.value -
              before.find((m) => m.name === "LayoutDuration")!.value),
        );
        await canvas.evaluate((element) => {
          const b = element.getBoundingClientRect();
          for (let i = 0; i < 16; i++)
            element.dispatchEvent(
              new PointerEvent("pointermove", {
                bubbles: true,
                pointerType: "pen",
                pointerId: Number((element as HTMLElement).dataset.pointer),
                buttons: 1,
                pressure: 0.5,
                clientX: b.x + 165 + i,
                clientY: b.y + 160 + Math.sin(i / 3) * 4,
              }),
            );
        });
        await lift(session, box.x + 180, box.y + 160 + Math.sin(5) * 4);
        // Wait for the idle handoff, then resume against the settled completed ink.
        await expect(
          page.locator(".document-pane:not([hidden]) .ink-raster:not(.ink-live-raster)"),
        ).toHaveCSS("visibility", "hidden");
        await expect(page.locator(".ink-vector:visible > g:not(.ink-live) path")).toHaveCount(
          count + contact + 1,
        );
      }
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      // Preserve pen-down, all 16 moves, and the pen-up sample.
      await expect.poll(() => storedInkSummary(page)).toEqual({ count: count + 2, points: 18 });
      expect(await storedInkPrefix(page, count)).toBe(original);
      results.push({ count, layouts });
      await page.getByRole("button", { name: "Back to library", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
    }
    await writeFile(
      "artifacts/ink-growth-contact-layout.json",
      JSON.stringify({ cpuSlowdown: 4, samplesPerStroke: 512, results }, null, 2),
    );
    for (let i = 0; i < 2; i++)
      expect(results[1].layouts[i]).toBeLessThan(Math.max(5, results[0].layouts[i] * 3));
  } finally {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await context.close();
  }
});

test("inactive notebooks do not expand another page's hardware input batches", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  await page.getByRole("button", { name: "Library", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
  await loadedNotebook(page, 0);
  await expect(page.locator(".ink-canvas")).toHaveCount(2);
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const reads = await canvas.evaluate((element) => {
    const b = element.getBoundingClientRect(),
      id = Number((element as HTMLElement).dataset.pointer);
    const sample = (x: number, y: number) =>
      new PointerEvent("pointermove", {
        pointerId: id,
        pointerType: "pen",
        buttons: 1,
        pressure: 0.5,
        clientX: b.x + x,
        clientY: b.y + y,
      });
    const samples = [sample(170.125, 165.25), sample(190.25, 180.375)];
    let reads = 0;
    for (const type of ["pointerrawupdate", "pointermove"]) {
      const event = new PointerEvent(type, {
        bubbles: true,
        pointerId: id,
        pointerType: "pen",
        buttons: 1,
        pressure: 0.5,
        clientX: b.x + 190.25,
        clientY: b.y + 180.375,
      });
      Object.defineProperty(event, "getCoalescedEvents", {
        value: () => {
          reads++;
          return samples;
        },
      });
      element.dispatchEvent(event);
    }
    return reads;
  });
  await lift(session, box.x + 200, box.y + 185);
  await expect.poll(() => storedInkSummary(page)).toEqual({ count: 1, points: 4 });
  const doc = await latest(page);
  expect(doc.pages[0].strokes[0].points[1].x).toBeCloseTo(
    (170.125 * doc.pages[0].width) / box.width,
    7,
  );
  expect(doc.pages[0].strokes[0].points[2].y).toBeCloseTo(
    (180.375 * doc.pages[0].height) / box.height,
    7,
  );
  expect(reads).toBe(2);
  await session.detach();
});

async function loadedNotebook(page: Page, count: number, pointsPerStroke = 48, precise = false) {
  await ready(page);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("menuitem", { name: "Notebook", exact: true }).click();
  await expect(page.locator(".ink-canvas:visible")).toBeVisible();
  await expect.poll(async () => (await latest(page)).revision).toBeGreaterThan(1);
  await page.evaluate(
    async ({ count, pointsPerStroke, precise }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const open = indexedDB.open("slate-workspace");
        open.onsuccess = () => resolve(open.result);
      });
      const doc = await new Promise<any>((resolve) => {
        const r = db.transaction("documents").objectStore("documents").get(location.hash.slice(5));
        r.onsuccess = () => resolve(r.result);
      });
      doc.pages[0].strokes = Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        tool: i % 20 ? "pen" : "highlighter",
        color: "#385775",
        width: i % 20 ? 0.6 : 14,
        rendering: precise ? "precise" : ["precise", "direct", "smooth"][i % 3],
        pressureSensitive: true,
        points: Array.from({ length: pointsPerStroke }, (_, j) => ({
          x: 45 + (i % 24) * 28 + Math.sin(j / 7) * 8,
          y: 80 + Math.floor(i / 24) * 7 + j / 8,
          p: 0.35 + (j % 10) / 30,
          t: j,
        })),
      }));
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["documents", "meta"], "readwrite");
        tx.objectStore("documents").put(doc);
        const prefs = tx.objectStore("meta").get("preferences");
        prefs.onsuccess = () =>
          tx
            .objectStore("meta")
            .put({ ...prefs.result, inkWidth: 0.6, notebookPages: true }, "preferences");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { count, pointsPerStroke, precise },
  );
  await page.reload();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(count);
  await expect(page.locator(".paper-thumbnail:visible")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".document-shell")
        .evaluate(
          (element) => element.getAnimations().filter((a) => a.playState === "running").length,
        ),
    )
    .toBe(0);
}

async function startPen(page: Page, session: CDPSession, x = 160, y = 160) {
  const canvas = page.locator(".ink-canvas:visible");
  const box = (await canvas.boundingBox())!;
  await canvas.evaluate((element) =>
    element.addEventListener(
      "pointerdown",
      (e) => {
        element.dataset.pointer = String(e.pointerId);
      },
      { once: true },
    ),
  );
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x + x,
    y: box.y + y,
    pointerType: "pen",
    button: "left",
    buttons: 1,
    force: 0.5,
  });
  return { canvas, box };
}

async function lift(session: CDPSession, x: number, y: number) {
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    pointerType: "pen",
    button: "left",
    buttons: 0,
    force: 0,
  });
}

async function storedInkSummary(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ count: number; points: number }>((resolve, reject) => {
        const open = indexedDB.open("slate-workspace");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("documents");
          const r = tx.objectStore("documents").get(location.hash.slice(5));
          r.onsuccess = () =>
            resolve({
              count: r.result.pages[0].strokes.length,
              points: r.result.pages[0].strokes.at(-1)?.points.length || 0,
            });
          r.onerror = () => reject(r.error);
          tx.oncomplete = () => db.close();
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

async function storedInkPrefix(page: Page, count: number) {
  return page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("slate-workspace");
      r.onsuccess = () => resolve(r.result);
    });
    const doc = await new Promise<any>((resolve) => {
      const r = db.transaction("documents").objectStore("documents").get(location.hash.slice(5));
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    // Keep large integrity comparisons in the page, outside the timed contact and test trace.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(doc.pages[0].strokes.slice(0, count))),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }, count);
}

test("continuous letters stay responsive while dense notebooks autosave", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const session = await context.newCDPSession(page);
  const results = [];
  for (const count of [0, 5000]) {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await loadedNotebook(page, count);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const { canvas, box } = await startPen(page, session);
    const result = await canvas.evaluate(async (element) => {
      const rect = element.getBoundingClientRect(),
        id = Number(element.dataset.pointer);
      const frames: number[] = [],
        handlers: number[] = [],
        saves: number[] = [];
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
        const started = performance.now();
        const result = put.apply(this, args);
        if (this.name === "documents") saves.push(performance.now() - started);
        return result;
      };
      const make = (type: string, x: number, y: number) =>
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "pen",
          buttons: type === "pointerup" ? 0 : 1,
          pressure: type === "pointerup" ? 0 : 0.5,
          clientX: rect.x + x,
          clientY: rect.y + y,
          bubbles: true,
          cancelable: true,
        });
      let previous = performance.now();
      for (let i = 0; i < 200; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
        const started = performance.now();
        for (let j = 0; j < 16; j++) {
          const t = (i % 2) * 16 + j;
          element.dispatchEvent(
            make(
              "pointermove",
              160 + (i % 40) * 2 + Math.sin(t / 4) * 4,
              160 + Math.cos(t / 4) * 5,
            ),
          );
        }
        if (i % 2) {
          element.dispatchEvent(make("pointerup", 160 + (i % 40) * 2, 160));
          if (i < 199) element.dispatchEvent(make("pointerdown", 160 + ((i + 1) % 40) * 2, 160));
        }
        handlers.push(performance.now() - started);
      }
      IDBObjectStore.prototype.put = put;
      const summary = (a: number[]) => {
        const sorted = a.slice(5).sort((a, b) => a - b);
        return {
          p50: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          max: sorted.at(-1),
        };
      };
      return {
        frames: summary(frames),
        handlers: summary(handlers),
        mainThreadDocumentWrites: saves.length,
        largestMainThreadWriteMs: Math.max(0, ...saves),
      };
    });
    await lift(session, box.x + 238, box.y + 160);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await expect.poll(async () => (await storedInkSummary(page)).count).toBe(count + 100);
    results.push({ strokes: count, ...result });
    await page.getByRole("button", { name: "Library", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
  }
  await writeFile(
    "artifacts/ink-continuous-writing.json",
    JSON.stringify({ cpuSlowdown: 4, addedStrokes: 100, results }, null, 2),
  );
  expect(results[1].frames.p95).toBeLessThan(Math.max(40, results[0].frames.p95 * 1.6));
});

test("dense notebooks keep live drawing within the empty-page frame budget", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const session = await context.newCDPSession(page);
  const results = [];
  for (const count of [0, 2500]) {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await loadedNotebook(page, count);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const { canvas, box } = await startPen(page, session);
    const result = await canvas.evaluate(async (element) => {
      const rect = element.getBoundingClientRect();
      const original = element.getBoundingClientRect.bind(element);
      let reads = 0,
        mutations = 0;
      element.getBoundingClientRect = () => {
        reads++;
        return original();
      };
      const observer = new MutationObserver((entries) => (mutations += entries.length));
      observer.observe(document.querySelector(".document-pane:not([hidden]) .ink-vector g")!, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      const intervals: number[] = [];
      let previous = performance.now();
      for (let i = 0; i < 100; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        intervals.push(now - previous);
        previous = now;
        for (let j = 0; j < 6; j++) {
          const t = i * 6 + j;
          element.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerId: Number(element.dataset.pointer),
              pointerType: "pen",
              buttons: 1,
              pressure: 0.5,
              clientX: rect.x + 160 + t / 12 + Math.sin(t / 6) * 3,
              clientY: rect.y + 160 + Math.cos(t / 6) * 5,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      }
      observer.disconnect();
      element.getBoundingClientRect = original;
      intervals.splice(0, 5);
      intervals.sort((a, b) => a - b);
      return {
        p50: intervals[Math.floor(intervals.length / 2)],
        p95: intervals[Math.floor(intervals.length * 0.95)],
        max: intervals.at(-1),
        reads,
        mutations,
      };
    });
    expect(result.mutations).toBe(0);
    expect(result.reads).toBeLessThan(5);
    await lift(session, box.x + 210, box.y + 160);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    // Keep large document serialization in the page, outside the measured input path.
    await expect.poll(async () => (await storedInkSummary(page)).count).toBe(count + 1);
    expect((await storedInkSummary(page)).points).toBe(602);
    results.push({ strokes: count, ...result });
    await page.getByRole("button", { name: "Library", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Your library", exact: true })).toBeVisible();
  }
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await writeFile(
    "artifacts/notebook-frame-budget.json",
    JSON.stringify({ cpuSlowdown: 4, samples: 600, results }, null, 2),
  );
  expect(results[1].p95).toBeLessThan(Math.max(30, results[0].p95 * 1.6));
});

test("fast tiny loops retain every raw and coalesced sample without replaying overlap", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await loadedNotebook(page, 2500);
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const samples = await canvas.evaluate(async (element) => {
    const rect = element.getBoundingClientRect();
    const make = (type: string, x: number, y: number, pressure: number) =>
      new PointerEvent(type, {
        pointerId: Number(element.dataset.pointer),
        pointerType: "pen",
        buttons: 1,
        pressure,
        clientX: rect.x + x,
        clientY: rect.y + y,
        bubbles: true,
      });
    const stale = make("pointermove", 600, 600, 0.9);
    const expected = [];
    for (let batch = 0; batch < 16; batch++) {
      const coalesced = Array.from({ length: 128 }, (_, j) => {
        const i = batch * 128 + j;
        const point = {
          x: 160 + i / 200 + Math.sin(i / 9) * 2,
          y: 160 + Math.cos(i / 9) * 3,
          p: (i % 17) / 16,
        };
        expected.push(point);
        return make("pointerrawupdate", point.x, point.y, point.p);
      });
      const last = expected.at(-1)!;
      const raw = make("pointerrawupdate", last.x, last.y, last.p);
      Object.defineProperty(raw, "getCoalescedEvents", { value: () => coalesced });
      element.dispatchEvent(raw);
      const replay = make("pointermove", last.x, last.y, last.p);
      Object.defineProperty(replay, "timeStamp", { value: raw.timeStamp });
      Object.defineProperty(replay, "getCoalescedEvents", { value: () => coalesced });
      element.dispatchEvent(replay);
      await new Promise(requestAnimationFrame);
    }
    element.dispatchEvent(stale);
    // A browser without raw updates continues through the pointermove path.
    const fallback = { x: 171.5, y: 160.5, p: 0.45 };
    element.dispatchEvent(make("pointermove", fallback.x, fallback.y, fallback.p));
    expected.push(fallback);
    return expected;
  });
  const alpha = await canvas.evaluate((element) => {
    const raster = element.parentElement!.querySelector(".ink-live-raster") as HTMLCanvasElement;
    const ctx = raster.getContext("2d")!,
      matrix = ctx.getTransform();
    const vector = element.parentElement!.querySelector(".ink-vector") as SVGSVGElement;
    const b = element.getBoundingClientRect();
    const x = (171.5 * vector.viewBox.baseVal.width) / b.width;
    const y = (160.5 * vector.viewBox.baseVal.height) / b.height;
    return ctx.getImageData(
      Math.floor(x * matrix.a + matrix.e),
      Math.floor(y * matrix.d + matrix.f),
      1,
      1,
    ).data[3];
  });
  expect(alpha).toBeGreaterThan(0);
  await lift(session, box.x + 171.7, box.y + 160.7);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(2501);
  const doc = await latest(page),
    stroke = doc.pages[0].strokes.at(-1);
  expect(stroke.points).toHaveLength(samples.length + 2);
  for (const [i, sample] of samples.entries()) {
    expect(stroke.points[i + 1].x).toBeCloseTo((sample.x * doc.pages[0].width) / box.width, 4);
    expect(stroke.points[i + 1].y).toBeCloseTo((sample.y * doc.pages[0].height) / box.height, 4);
    expect(stroke.points[i + 1].p).toBeCloseTo(sample.p, 5);
  }
  expect(stroke.points.every((p: any, i: number, a: any[]) => !i || p.t >= a[i - 1].t)).toBe(true);
  expect(stroke.points.at(-1).p).toBeCloseTo(0.45);
  const path = page.locator(".ink-vector:visible g path").last();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(2501);
  const completed = (await path.getAttribute("d"))!;
  expect(completed.length).toBeGreaterThan(50_000);
  await page.reload();
  await expect(path).toHaveAttribute("d", completed);
});

test("coalesced turns ignore a processed parent and preserve minute pressure changes", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const expected = await canvas.evaluate((element) => {
    const b = element.getBoundingClientRect(),
      id = Number(element.dataset.pointer);
    const points = [
      { x: 160.001, y: 160.002, p: 0.501 },
      { x: 160.001, y: 160.002, p: 0.506 },
      { x: 161.125, y: 157.875, p: 0.511 },
      { x: 163.125, y: 163.875, p: 0.516 },
      { x: 165.125, y: 157.875, p: 0.521 },
    ];
    const make = (point: (typeof points)[number]) =>
      new PointerEvent("pointermove", {
        pointerId: id,
        pointerType: "pen",
        buttons: 1,
        pressure: point.p,
        clientX: b.x + point.x,
        clientY: b.y + point.y,
        bubbles: true,
      });
    const samples = points.map(make);
    const parent = make({ x: 600, y: 600, p: 0.9 });
    Object.defineProperty(parent, "getCoalescedEvents", { value: () => samples });
    element.dispatchEvent(parent);
    return points;
  });
  const end = expected.at(-1)!;
  await lift(session, box.x + end.x, box.y + end.y);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(1);
  const doc = await latest(page),
    stroke = doc.pages[0].strokes[0];
  expect(stroke.points).toHaveLength(expected.length + 1);
  for (const [i, p] of expected.entries()) {
    expect(stroke.points[i + 1].x).toBeCloseTo((p.x * doc.pages[0].width) / box.width, 7);
    expect(stroke.points[i + 1].y).toBeCloseTo((p.y * doc.pages[0].height) / box.height, 7);
    expect(stroke.points[i + 1].p).toBeCloseTo(p.p, 5);
  }
});

test("the thousandth consecutive stroke stays responsive and all ink survives reload", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await loadedNotebook(page, 0);
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  await session.send("HeapProfiler.collectGarbage");
  const before = (await session.send("Performance.getMetrics")).metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  )!.value;
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const { canvas, box } = await startPen(page, session);
  const timings = await canvas.evaluate(async (element) => {
    const b = element.getBoundingClientRect(),
      id = Number(element.dataset.pointer);
    const handlers: number[] = [],
      frames: number[] = [];
    const make = (type: string, x: number, y: number) =>
      new PointerEvent(type, {
        pointerId: id,
        pointerType: "pen",
        buttons: type === "pointerup" ? 0 : 1,
        pressure: type === "pointerup" ? 0 : 0.5,
        clientX: b.x + x,
        clientY: b.y + y,
        bubbles: true,
        cancelable: true,
      });
    let previous = performance.now();
    for (let i = 0; i < 1000; i++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
      const start = performance.now();
      if (i)
        element.dispatchEvent(
          make("pointerdown", 160 + (i % 40) * 5, 160 + Math.floor(i / 40) * 8),
        );
      const samples = Array.from({ length: 12 }, (_, j) =>
        make(
          "pointermove",
          160 + (i % 40) * 5 + j / 2,
          160 + Math.floor(i / 40) * 8 + Math.sin(j / 2) * 3,
        ),
      );
      const parent = make("pointermove", 600, 600);
      Object.defineProperty(parent, "getCoalescedEvents", { value: () => samples });
      element.dispatchEvent(parent);
      element.dispatchEvent(
        make("pointerup", 165.5 + (i % 40) * 5, 160 + Math.floor(i / 40) * 8 + Math.sin(5.5) * 3),
      );
      handlers.push(performance.now() - start);
    }
    const summary = (a: number[]) => {
      const sorted = a.slice().sort((a, b) => a - b);
      return {
        p50: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        max: sorted.at(-1),
      };
    };
    const raster = element.parentElement!.querySelector(".ink-raster") as HTMLCanvasElement;
    return {
      first: summary(handlers.slice(5, 55)),
      last: summary(handlers.slice(-50)),
      frames: summary(frames.slice(5)),
      buffer: { width: raster.width, height: raster.height },
    };
  });
  await lift(session, box.x + 360.5, box.y + 350);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(1000);
  const doc = await latest(page);
  expect(new Set(doc.pages[0].strokes.map((s: any) => s.id)).size).toBe(1000);
  expect(
    doc.pages[0].strokes.every((s: any) => s.points.length >= 12 && s.points.length <= 13),
  ).toBe(true);
  await session.send("HeapProfiler.collectGarbage");
  const after = (await session.send("Performance.getMetrics")).metrics.find(
    (m) => m.name === "JSHeapUsedSize",
  )!.value;
  await writeFile(
    "artifacts/ink-thousand-strokes.json",
    JSON.stringify(
      { cpuSlowdown: 4, strokes: 1000, ...timings, retainedHeapGrowthBytes: after - before },
      null,
      2,
    ),
  );
  expect(timings.last.p95).toBeLessThan(Math.max(12, timings.first.p95 * 1.8));
  expect(timings.buffer.width * timings.buffer.height).toBeLessThan(4_010_000);
  expect(after - before).toBeLessThan(120_000_000);
  await page.reload();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(1000);
  expect((await latest(page)).pages[0].strokes).toEqual(doc.pages[0].strokes);
});

test("ink saves through the normal local fallback when a save worker cannot load", async ({
  page,
  context,
}) => {
  await page.route("**/ink-save.worker-*", (route) => route.abort());
  await loadedNotebook(page, 0);
  const session = await context.newCDPSession(page);
  const { box } = await startPen(page, session);
  await lift(session, box.x + 165, box.y + 165);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(1);
  await expect(page.locator(".save-error-banner")).toHaveCount(0);
  const doc = await latest(page);
  await page.reload();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(1);
  expect((await latest(page)).pages[0].strokes).toEqual(doc.pages[0].strokes);
});

test("rapid consecutive pen lifts preserve dense-page ink, history and incremental thumbnails", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await loadedNotebook(page, 2500);
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const initial = await page.locator(".ink-vector:visible g path").first().getAttribute("d");
  const durations = [];
  for (let i = 0; i < 20; i++) {
    const { canvas, box } = await startPen(page, session, 160 + i * 5, 160);
    await canvas.evaluate((element, i) => {
      const rect = element.getBoundingClientRect();
      for (let j = 0; j < 80; j++)
        element.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: Number(element.dataset.pointer),
            pointerType: "pen",
            buttons: 1,
            pressure: 0.5,
            clientX: rect.x + 160 + i * 5 + Math.sin(j / 8) * 2,
            clientY: rect.y + 160 + Math.cos(j / 8) * 3,
            bubbles: true,
          }),
        );
    }, i);
    const start = performance.now();
    await lift(session, box.x + 160 + i * 5, box.y + 160);
    durations.push(performance.now() - start);
  }
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(2520);
  const doc = await latest(page);
  expect(doc.pages[0].strokes.slice(2500).every((s: any) => s.points.length === 82)).toBe(true);
  await expect(page.locator(".ink-vector:visible g path").first()).toHaveAttribute("d", initial!);
  const thumbnail = await page.locator(".paper-thumbnail:visible").evaluate((e) => e.toDataURL());
  await page.getByRole("button", { name: "Undo ink", exact: true }).click();
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(2519);
  await page.getByRole("button", { name: "Redo ink", exact: true }).click();
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(2520);
  await page.reload();
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(2520);
  await expect
    .poll(() => page.locator(".paper-thumbnail:visible").evaluate((e) => e.toDataURL()))
    .toBe(thumbnail);
  expect((await latest(page)).pages[0].strokes).toEqual(doc.pages[0].strokes);
  await writeFile(
    "artifacts/notebook-rapid-writing.json",
    JSON.stringify(
      { strokes: 2500, added: 20, cpuSlowdown: 4, penLiftRoundTripsMs: durations },
      null,
      2,
    ),
  );
});

test("long live highlighter strokes retain uniform transparency across rendering batches", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  await page.getByRole("button", { name: "Highlighter (H)", exact: true }).click();
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const last = await canvas.evaluate(async (element) => {
    const rect = element.getBoundingClientRect();
    let last = { x: 160, y: 160 };
    for (let i = 0; i < 512; i++) {
      last = { x: 160 + i / 4, y: 160 + Math.sin(i / 8) * 5 };
      element.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: Number(element.dataset.pointer),
          pointerType: "pen",
          buttons: 1,
          pressure: 0.5,
          clientX: rect.x + last.x,
          clientY: rect.y + last.y,
          bubbles: true,
        }),
      );
      if (!(i % 64)) await new Promise(requestAnimationFrame);
    }
    await new Promise(requestAnimationFrame);
    return last;
  });
  const raster = async (live: boolean) =>
    page.evaluate(async (live) => {
      if (live) {
        const source = document.querySelector(".ink-live-raster") as HTMLCanvasElement;
        const paper = document.querySelector(".ink-canvas")!.getBoundingClientRect();
        const canvas = document.createElement("canvas");
        canvas.width = 794;
        canvas.height = 1123;
        const ctx = canvas.getContext("2d")!;
        ctx.globalAlpha = Number(getComputedStyle(source).opacity);
        ctx.drawImage(
          source,
          (parseFloat(source.style.left) * 794) / paper.width,
          (parseFloat(source.style.top) * 1123) / paper.height,
          (parseFloat(source.style.width) * 794) / paper.width,
          (parseFloat(source.style.height) * 1123) / paper.height,
        );
        const data = ctx.getImageData(0, 0, 794, 1123).data;
        let max = 0,
          covered = 0;
        for (let i = 3; i < data.length; i += 4) {
          max = Math.max(max, data[i]);
          if (data[i] >= 70) covered++;
        }
        return { max, covered };
      }
      const original = document.querySelector(
        live
          ? ".document-pane:not([hidden]) .ink-live-vector"
          : ".document-pane:not([hidden]) .ink-vector",
      )!;
      const svg = original.cloneNode(true) as SVGSVGElement;
      for (const group of svg.querySelectorAll("g")) group.style.display = "";
      if (!live) for (const child of [...svg.children]) if (child.tagName !== "g") child.remove();
      svg.setAttribute("width", "794");
      svg.setAttribute("height", "1123");
      svg.removeAttribute("class");
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 794;
        canvas.height = 1123;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 794, 1123).data;
        let max = 0,
          covered = 0;
        for (let i = 3; i < data.length; i += 4) {
          max = Math.max(max, data[i]);
          if (data[i] >= 70) covered++;
        }
        return { max, covered };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, live);
  const live = await raster(true);
  expect(live.max).toBeLessThanOrEqual(78);
  expect(live.covered).toBeGreaterThan(1000);
  const immediate = await page.locator(".ink-live-raster:visible").evaluate((element) => {
    const canvas = element as HTMLCanvasElement,
      ctx = canvas.getContext("2d")!;
    const opacity = Number(getComputedStyle(canvas).opacity);
    const cssWidth = parseFloat(canvas.style.width),
      cssHeight = parseFloat(canvas.style.height);
    const x = parseFloat(canvas.style.left),
      y = parseFloat(canvas.style.top);
    const centres = Array.from({ length: 32 }, (_, i) => {
      const sample = i * 16;
      return ctx.getImageData(
        Math.round(((160 + sample / 4 - x) * canvas.width) / cssWidth),
        Math.round(((160 + Math.sin(sample / 8) * 5 - y) * canvas.height) / cssHeight),
        1,
        1,
      ).data[3];
    });
    return {
      opacity,
      centres,
      pixels: canvas.width * canvas.height,
      side: Math.max(canvas.width, canvas.height),
    };
  });
  expect(immediate.opacity).toBe(0.3);
  expect(Math.min(...immediate.centres)).toBeGreaterThan(250);
  expect(immediate.pixels).toBeLessThan(4_010_000);
  expect(immediate.side).toBeLessThanOrEqual(4096);
  await lift(session, box.x + last.x, box.y + last.y);
  await expect(page.locator(".ink-vector:visible g path")).toHaveCount(1);
  const completed = await raster(false);
  expect(completed.max).toBeLessThanOrEqual(78);
  expect(Math.abs(completed.covered - live.covered)).toBeLessThan(live.covered * 0.03);
});

test("live ink updates within the input event and keeps new coalesced samples after raw input", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const result = await canvas.evaluate((element) => {
    const b = element.getBoundingClientRect(),
      id = Number(element.dataset.pointer);
    const time = performance.now() + 1;
    const make = (type: string, x: number, y: number, t: number) => {
      const event = new PointerEvent(type, {
        pointerId: id,
        pointerType: "pen",
        buttons: 1,
        pressure: 0.5,
        clientX: b.x + x,
        clientY: b.y + y,
        bubbles: true,
      });
      Object.defineProperty(event, "timeStamp", { value: time + t });
      return event;
    };
    const live = element.parentElement!.querySelector(".ink-live-raster") as HTMLCanvasElement;
    const coverage = () => {
      const pixels = live.getContext("2d")!.getImageData(0, 0, live.width, live.height).data;
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++;
      return count;
    };
    const before = coverage();
    const samples = [make("pointerrawupdate", 165, 155, 1), make("pointerrawupdate", 170, 165, 2)];
    const raw = make("pointerrawupdate", 170, 165, 10);
    Object.defineProperty(raw, "getCoalescedEvents", { value: () => samples });
    element.dispatchEvent(raw);
    const immediate = coverage();
    const newer = [make("pointermove", 175, 155, 3), make("pointermove", 180, 150, 4)];
    const move = make("pointermove", 400, 400, 8);
    Object.defineProperty(move, "getCoalescedEvents", { value: () => [...samples, ...newer] });
    element.dispatchEvent(move);
    const after = coverage();
    element.dispatchEvent(make("pointerup", 180, 150, 12));
    return { before, immediate, after };
  });
  await lift(session, box.x + 180, box.y + 150);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(1);
  const points = (await latest(page)).pages[0].strokes[0].points;
  expect(points).toHaveLength(5);
  expect(points.map((p: any) => Math.round((p.x * box.width) / 794))).toEqual([
    160, 165, 170, 175, 180,
  ]);
  expect(result.before).toBeGreaterThan(0);
  expect(result.immediate).toBeGreaterThan(result.before);
  expect(result.after).toBeGreaterThan(result.immediate);
});

test("palms stay rejected between pen strokes and an unrelated touch cancellation keeps ink continuous", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  const result = await canvas.evaluate(async (element) => {
    const b = element.getBoundingClientRect(),
      id = Number(element.dataset.pointer);
    const viewport = element.closest(".page-viewport")!;
    const paper = element.parentElement!;
    const make = (type: string, pointerId: number, pointerType: string, x: number, y: number) =>
      new PointerEvent(type, {
        pointerId,
        pointerType,
        buttons: type === "pointerup" ? 0 : 1,
        pressure: 0.5,
        width: pointerType === "touch" ? 16 : 1,
        height: 16,
        clientX: b.x + x,
        clientY: b.y + y,
        bubbles: true,
        cancelable: true,
      });
    element.dispatchEvent(make("pointermove", id, "pen", 180, 170));
    element.dispatchEvent(make("pointerdown", 91, "touch", 220, 260));
    element.dispatchEvent(make("pointerup", id, "pen", 180, 170));
    element.dispatchEvent(make("pointerdown", 92, "touch", 270, 260));
    element.dispatchEvent(make("pointerdown", 93, "touch", 330, 260));
    element.dispatchEvent(make("pointermove", 92, "touch", 270, 160));
    element.dispatchEvent(make("pointermove", 93, "touch", 330, 120));
    await new Promise(requestAnimationFrame);
    const moved = {
      scroll: viewport.scrollTop,
      transform: paper.style.transform,
      pinching: paper.classList.contains("pinching"),
    };
    element.dispatchEvent(make("pointerdown", id, "pen", 200, 180));
    element.dispatchEvent(make("pointermove", id, "pen", 210, 175));
    element.dispatchEvent(make("pointercancel", 91, "touch", 220, 260));
    element.dispatchEvent(make("pointermove", id, "pen", 220, 190));
    element.dispatchEvent(make("pointerup", id, "pen", 220, 190));
    for (const touch of [92, 93])
      element.dispatchEvent(make("pointerup", touch, "touch", 300, 200));
    return moved;
  });
  await lift(session, box.x + 220, box.y + 190);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(2);
  expect(result).toEqual({ scroll: 0, transform: "", pinching: false });
  expect((await latest(page)).pages[0].strokes[1].points).toHaveLength(3);
});

test("a canceled pen preserves received ink without inventing a cancellation endpoint", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  const session = await context.newCDPSession(page);
  const { canvas, box } = await startPen(page, session);
  await canvas.evaluate((element) => {
    const b = element.getBoundingClientRect(),
      id = Number(element.dataset.pointer);
    for (const [type, x, y] of [
      ["pointermove", 180, 170],
      ["pointermove", 200, 155],
      ["pointercancel", 600, 600],
    ] as const)
      element.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "pen",
          buttons: 1,
          pressure: 0.5,
          clientX: b.x + x,
          clientY: b.y + y,
          bubbles: true,
        }),
      );
  });
  await lift(session, box.x + 200, box.y + 155);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(1);
  const stroke = (await latest(page)).pages[0].strokes[0];
  expect(stroke.points).toHaveLength(3);
  await page.reload();
  expect((await latest(page)).pages[0].strokes[0]).toEqual(stroke);
});

test("dense page panning reuses completed ink and handles touch on the paper margins", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await loadedNotebook(page, 5000);
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const results = await page.locator(".page-viewport:visible").evaluate(async (viewport) => {
    const canvas = viewport.querySelector(".ink-canvas") as HTMLCanvasElement;
    const paper = canvas.parentElement!,
      b = canvas.getBoundingClientRect();
    const raster = paper.querySelector(".ink-raster") as HTMLCanvasElement;
    const context = raster.getContext("2d")!;
    let fills = 0;
    const fill = context.fill.bind(context);
    context.fill = (...args: any[]) => {
      fills++;
      (fill as any)(...args);
    };
    const capture = canvas.setPointerCapture.bind(canvas);
    canvas.setPointerCapture = () => {};
    const make = (type: string, y: number, margin: boolean) =>
      new PointerEvent(type, {
        pointerId: 95,
        pointerType: "touch",
        buttons: type === "pointerup" ? 0 : 1,
        clientX: b.x + (margin ? -10 : 100),
        clientY: b.y + y,
        bubbles: true,
        cancelable: true,
      });
    const results = [];
    for (const margin of [false, true]) {
      viewport.scrollTop = 0;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const target = margin ? viewport : canvas;
      const previousFills = fills;
      target.dispatchEvent(make("pointerdown", 450, margin));
      const frames: number[] = [],
        handlers: number[] = [];
      let previous = performance.now();
      for (let i = 1; i <= 30; i++) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        frames.push(now - previous);
        previous = now;
        const start = performance.now();
        target.dispatchEvent(make("pointermove", 450 - i * 5, margin));
        handlers.push(performance.now() - start);
      }
      target.dispatchEvent(make("pointerup", 300, margin));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const sorted = frames.slice(5).sort((a, b) => a - b);
      results.push({
        target: margin ? "margin" : "paper",
        scroll: viewport.scrollTop,
        fills: fills - previousFills,
        p95: sorted[Math.floor(sorted.length * 0.95)],
        maxHandler: Math.max(...handlers),
      });
    }
    context.fill = fill;
    canvas.setPointerCapture = capture;
    return results;
  });
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await writeFile(
    "artifacts/ink-pan-budget.json",
    JSON.stringify({ cpuSlowdown: 4, strokes: 5000, results }, null, 2),
  );
  for (const result of results) {
    expect(result.scroll).toBeCloseTo(150, 0);
    expect(result.fills).toBe(0);
    expect(result.p95).toBeLessThan(50);
  }
});

test("pen contact settles a moving pinch before sampling and prevents wheel movement mid-stroke", async ({
  page,
  context,
}) => {
  await loadedNotebook(page, 0);
  const canvas = page.locator(".ink-canvas:visible");
  await canvas.evaluate(async (element) => {
    const b = element.getBoundingClientRect();
    const capture = (element as HTMLCanvasElement).setPointerCapture;
    (element as HTMLCanvasElement).setPointerCapture = () => {};
    const make = (type: string, id: number, x: number, y: number) =>
      new PointerEvent(type, {
        pointerId: id,
        pointerType: "touch",
        clientX: b.x + x,
        clientY: b.y + y,
        bubbles: true,
        cancelable: true,
      });
    element.dispatchEvent(make("pointerdown", 90, 160, 250));
    element.dispatchEvent(make("pointerdown", 91, 260, 250));
    element.dispatchEvent(make("pointermove", 91, 320, 200));
    await new Promise(requestAnimationFrame);
    (element as HTMLCanvasElement).setPointerCapture = capture;
  });
  await expect(page.locator(".paper-page")).toHaveClass(/pinching/);
  const session = await context.newCDPSession(page);
  const pinched = (await canvas.boundingBox())!,
    visible = (await page.locator(".page-viewport:visible").boundingBox())!;
  const x = Math.max(160, visible.x - pinched.x + 80),
    y = Math.max(160, visible.y - pinched.y + 80);
  const { box } = await startPen(page, session, x, y);
  await expect(page.locator(".paper-page")).not.toHaveClass(/pinching/);
  const settled = (await canvas.boundingBox())!;
  expect(settled.x).toBeCloseTo(box.x, 0);
  expect(settled.y).toBeCloseTo(box.y, 0);
  const wheel = await canvas.evaluate((element) => {
    const viewport = element.closest(".page-viewport")!;
    const zoom = document.querySelector(".zoom-control")!.textContent;
    const event = new WheelEvent("wheel", {
      deltaY: 200,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return {
      blocked: event.defaultPrevented,
      zoomUnchanged: zoom === document.querySelector(".zoom-control")!.textContent,
      scroll: viewport.scrollTop,
    };
  });
  expect(wheel.blocked).toBe(true);
  expect(wheel.zoomUnchanged).toBe(true);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: box.x + x + 20,
    y: box.y + y + 20,
    pointerType: "pen",
    button: "left",
    buttons: 1,
    force: 0.5,
  });
  await lift(session, box.x + x + 20, box.y + y + 20);
  await expect.poll(async () => (await storedInkSummary(page)).count).toBe(1);
  const points = (await latest(page)).pages[0].strokes[0].points;
  expect(points.at(-1).x - points[0].x).toBeCloseTo((20 * 794) / settled.width, 5);
  expect(points.at(-1).y - points[0].y).toBeCloseTo((20 * 1123) / settled.height, 5);
});
