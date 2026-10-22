import { describe, expect, it } from "vitest";
import { makeDocument, type Point, type Stroke } from "../src/slate/core/model";
import { docSchema } from "../src/slate/core/storage";
import {
  brushGeometry,
  brushPlan,
  samples,
  stabilizer,
  straighten,
  UNIT,
} from "../src/slate/ink/flexcil";

const line = (count: number, step = 2, dt = 8, p = 0.6): Point[] =>
  Array.from({ length: count }, (_, i) => ({
    x: 100 + i * step,
    y: 200 + Math.sin(i / 4) * 6,
    p,
    t: i * dt,
  }));
const pen = (brush: Stroke["brush"], points: Point[], width = 1.5): Stroke => ({
  id: brush!,
  tool: brush === "highlighter" || brush === "marker" ? "highlighter" : "pen",
  color: "#333333",
  width: width * UNIT,
  points,
  brush,
});

describe("Flexcil stroke stabilizer", () => {
  it("passes the first sample through and converges on a held position", () => {
    const smooth = stabilizer(0.2);
    expect(smooth({ x: 5, y: 6, p: 0.4, t: 0 })).toEqual({ x: 5, y: 6, p: 0.4, t: 0 });
    let out = { x: 0, y: 0, p: 0, t: 0 };
    for (let i = 1; i <= 12; i++) out = smooth({ x: 50, y: 60, p: 0.9, t: i });
    expect(out.x).toBeCloseTo(50, 3);
    expect(out.y).toBeCloseTo(60, 3);
    expect(out.p).toBeCloseTo(0.9, 3);
  });

  it("follows a moving nib with low lag and never overshoots pressure bounds", () => {
    const smooth = stabilizer(0.2);
    let out = smooth({ x: 0, y: 0, p: 0.2, t: 0 });
    for (let i = 1; i <= 30; i++) out = smooth({ x: i * 3, y: 0, p: i % 2 ? 0.2 : 0.8, t: i * 8 });
    // The newest-weighted kernel trails a steady line by under one sample.
    expect(90 - out.x).toBeGreaterThan(0.5);
    expect(90 - out.x).toBeLessThan(3);
    expect(out.p).toBeGreaterThanOrEqual(0.2);
    expect(out.p).toBeLessThanOrEqual(0.8);
  });

  it("is disabled at smooth level zero", () => {
    const smooth = stabilizer(0);
    const point = { x: 1, y: 2, p: 0.5, t: 3 };
    expect(smooth(point)).toBe(point);
  });
});

describe("Flexcil pen widths", () => {
  it("keeps ballpoint and highlighters at a constant width", () => {
    for (const brush of ["ballpoint", "highlighter", "marker"] as const)
      expect(new Set(samples(pen(brush, line(20))).map((s) => s.w)).size).toBe(1);
  });

  it("thins the fountain pen under light pressure and widens it under firm pressure", () => {
    const light = samples({ ...pen("fountain", line(40, 2, 8, 0.15)), pressureSensitive: true });
    const firm = samples({ ...pen("fountain", line(40, 2, 8, 0.95)), pressureSensitive: true });
    const avg = (s: { w: number }[]) => s.reduce((a, b) => a + b.w, 0) / s.length;
    expect(avg(light)).toBeLessThan(avg(firm));
    expect(Math.max(...firm.map((s) => s.w))).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(Math.min(...light.map((s) => s.w))).toBeGreaterThanOrEqual(1.5 / 12 - 1e-6);
  });

  it("narrows calligraphy on fast strokes and keeps it inside the resolver clamp", () => {
    const slow = samples({
      ...pen("calligraphy", line(40, 0.5, 8, 0.6)),
      pressureSensitive: false,
    });
    const fast = samples({ ...pen("calligraphy", line(40, 6, 2, 0.6)), pressureSensitive: false });
    const tail = (s: { w: number }[]) => s[s.length - 2].w;
    expect(tail(fast)).toBeLessThan(tail(slow));
    for (const s of [...slow, ...fast]) {
      expect(s.w).toBeGreaterThanOrEqual(0.75 - 1e-6);
      expect(s.w).toBeLessThanOrEqual(1.5 + 1e-6);
    }
  });

  it("offsets pencil samples on curves but never by more than 40% of the width", () => {
    const curve = Array.from({ length: 30 }, (_, i) => ({
      x: 100 + Math.cos(i / 3) * 30,
      y: 100 + Math.sin(i / 3) * 30,
      p: 0.5,
      t: i * 4,
    }));
    const stroke = pen("pencil", curve, 2);
    const out = samples(stroke);
    const shift = out.map((s, i) => Math.hypot(s.x - curve[i].x / UNIT, s.y - curve[i].y / UNIT));
    expect(Math.max(...shift)).toBeGreaterThan(0);
    expect(Math.max(...shift)).toBeLessThanOrEqual(2 * 0.4 + 1e-6);
  });
});

describe("Flexcil geometry", () => {
  it("is deterministic after reopening and caches by sample count", () => {
    for (const brush of [
      "ballpoint",
      "fountain",
      "calligraphy",
      "pencil",
      "highlighter",
      "marker",
    ] as const) {
      const stroke = pen(brush, line(25));
      expect(brushGeometry(stroke)).toBe(brushGeometry(stroke));
      expect(brushGeometry(structuredClone(stroke))).toEqual(brushGeometry(stroke));
    }
  });

  it("uses Flexcil caps, translucency and darken blending", () => {
    expect(brushGeometry(pen("marker", line(5))).layers[0].cap).toBe("square");
    const marker = brushGeometry({ ...pen("highlighter", line(5)), opacity: 0.47 });
    expect(marker.opacity).toBe(0.47);
    expect(marker.blend).toBe("darken");
    expect(brushGeometry({ ...pen("highlighter", line(5)), color: "#ffffff" }).blend).toBe(
      "lighten",
    );
    expect(brushGeometry(pen("pencil", line(5))).layers.map((l) => l.grain)).toEqual([
      "fringe",
      "core",
    ]);
  });

  it("renders a single tap as a dot for every pen", () => {
    for (const brush of ["ballpoint", "fountain", "calligraphy", "pencil", "highlighter"] as const)
      expect(brushGeometry(pen(brush, [{ x: 10, y: 10, p: 0.5, t: 0 }])).layers[0].d).not.toBe("");
  });

  it("never changes settled segments as input arrives, so live ink can append them", () => {
    const curve = Array.from({ length: 60 }, (_, i) => ({
      x: 100 + Math.cos(i / 5) * 40 + i,
      y: 100 + Math.sin(i / 5) * 40,
      p: 0.3 + (i % 7) / 10,
      t: i * 4,
    }));
    for (const brush of [
      "ballpoint",
      "fountain",
      "calligraphy",
      "pencil",
      "highlighter",
      "marker",
    ] as const) {
      const full = brushPlan({ ...pen(brush, curve), pressureSensitive: true });
      for (const count of [3, 10, 33, 59]) {
        const part = brushPlan({ ...pen(brush, curve.slice(0, count)), pressureSensitive: true });
        expect(part.stable).toBeGreaterThan(0);
        expect(part.draw(0, part.stable)).toBe(full.draw(0, part.stable));
      }
    }
  });

  it("draws fountain ink as smooth ribbons and gives dots non-empty bounds", () => {
    expect(brushGeometry(pen("fountain", line(25))).layers[0].d).toMatch(/Q/);
    const dot = brushGeometry(pen("ballpoint", [{ x: 10, y: 10, p: 0.5, t: 0 }])).layers[0].d;
    expect(dot).toMatch(/^M[\d.]+,[\d.]+L/);
    expect(dot.split(/[ML]/)[1]).not.toBe(dot.split(/[ML]/)[2]);
    const held = [0.2, 0.6, 0.9].map((p, t) => ({ x: 10, y: 10, p, t }));
    expect(brushPlan(pen("fountain", held)).segments).toBe(0);
  });

  it("reaches the final sample of a two-sample stroke", () => {
    const d = brushGeometry(
      pen("ballpoint", [
        { x: 100, y: 200, p: 0.5, t: 0 },
        { x: 120, y: 200, p: 0.5, t: 8 },
      ]),
    ).layers[0].d;
    expect(d.endsWith("120,200")).toBe(true);
  });

  it("snaps straight strokes within five degrees", () => {
    const start = { x: 0, y: 0, p: 0.5, t: 0 };
    expect(straighten(start, { x: 100, y: 4, p: 0.5, t: 1 }).y).toBe(0);
    expect(straighten(start, { x: 3, y: 100, p: 0.5, t: 1 }).x).toBe(0);
    expect(straighten(start, { x: 100, y: 40, p: 0.5, t: 1 }).y).toBe(40);
  });
});

describe("Flexcil strokes in backups", () => {
  it("retains the brush and opacity through schema validation", () => {
    const doc = makeDocument("notebook", "Pens", null);
    doc.pages[0].strokes = [
      { ...pen("calligraphy", line(3)) },
      { ...pen("highlighter", line(3)), opacity: 0.47 },
    ];
    const parsed = docSchema.parse(doc);
    expect(parsed.pages[0].strokes.map((s) => [s.brush, s.opacity])).toEqual([
      ["calligraphy", undefined],
      ["highlighter", 0.47],
    ]);
  });
});
