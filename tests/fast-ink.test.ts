import { describe, expect, it } from "vitest";
import type { Point, Stroke } from "../src/slate/core/model";
import { brushPlan, stabilizer, UNIT } from "../src/slate/ink/flexcil";
import { StrokeInput } from "../src/slate/ink/input";

const BRUSHES = [
  "ballpoint",
  "fountain",
  "calligraphy",
  "pencil",
  "highlighter",
  "marker",
] as const;

// Drives StrokeInput like InkSurface: the first sample is stabilized, the rest go through add().
function write(raw: Point[], brush: Stroke["brush"] = "ballpoint", smooth = 0.2, lift = true) {
  const stabilize = smooth > 0 ? stabilizer(smooth) : undefined;
  const stroke: Stroke = {
    id: "s",
    tool: "pen",
    color: "#000000",
    width: 1.5 * UNIT,
    points: [stabilize ? stabilize(raw[0]) : raw[0]],
    brush,
  };
  const input = new StrokeInput(stroke.points, raw[0], { stabilize, spacing: 2 });
  const live: number[] = [];
  for (const point of raw.slice(1, lift ? -1 : undefined)) {
    input.add(point);
    live.push(brushPlan(stroke).stable);
  }
  if (lift) input.end(raw[raw.length - 1]);
  return { stroke, input };
}
// The spline's centerline, flattened.
function centerline(stroke: Stroke) {
  const plan = brushPlan(stroke),
    out: { x: number; y: number }[] = [];
  let last = { x: 0, y: 0 };
  const path = {
    moveTo(x: number, y: number) {
      last = { x, y };
      out.push(last);
    },
    lineTo(x: number, y: number) {
      last = { x, y };
      out.push(last);
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      for (let i = 1; i <= 8; i++) {
        const t = i / 8,
          u = 1 - t;
        out.push({
          x: u * u * last.x + 2 * u * t * cx + t * t * x,
          y: u * u * last.y + 2 * u * t * cy + t * t * y,
        });
      }
      last = { x, y };
    },
    arc() {},
    closePath() {},
  } as unknown as CanvasPath;
  plan.draw(0, plan.segments, path);
  return out;
}
const circle = (count: number, radius = 120, dt = 16): Point[] =>
  Array.from({ length: count + 1 }, (_, i) => ({
    x: 400 + radius * Math.cos((i / count) * Math.PI * 2),
    y: 500 + radius * Math.sin((i / count) * Math.PI * 2),
    p: 0.5,
    t: i * dt,
  }));
// Largest turn between consecutive flattened steps, in degrees.
function sharpest(line: { x: number; y: number }[]) {
  let worst = 0;
  for (let i = 2; i < line.length; i++) {
    const a = Math.atan2(line[i - 1].y - line[i - 2].y, line[i - 1].x - line[i - 2].x),
      b = Math.atan2(line[i].y - line[i - 1].y, line[i].x - line[i - 1].x);
    if (Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y) < 0.05) continue;
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    worst = Math.max(worst, (turn * 180) / Math.PI);
  }
  return worst;
}

describe("fast handwriting input", () => {
  it("draws a fast long line to its full length", () => {
    // Six samples across 600 units: a flick delivered at 60 Hz.
    const raw = Array.from({ length: 6 }, (_, i) => ({
      x: 100 + i * 120,
      y: 300,
      p: 0.5,
      t: i * 16,
    }));
    for (const brush of BRUSHES)
      for (const smooth of [0, 0.2, 0.5, 1]) {
        const { stroke } = write(raw, brush, smooth);
        const end = stroke.points[stroke.points.length - 1];
        expect(end.x).toBe(700);
        expect(end.y).toBe(300);
        // Ribbon and nib outlines extend past the centerline by design.
        if (brush !== "fountain" && brush !== "calligraphy")
          expect(Math.max(...centerline(stroke).map((p) => p.x))).toBeCloseTo(700, 5);
        // No sample is ever carried past the lift.
        expect(stroke.points.every((p) => p.x <= 700 + 1e-9)).toBe(true);
      }
  });

  it("bends sparse fast curves instead of drawing chords", () => {
    // Twelve samples around a 120-unit circle: chords would leave 30 degree corners.
    const { stroke } = write(circle(12));
    const line = centerline(stroke);
    expect(sharpest(line)).toBeLessThan(6);
    const off = (p: { x: number; y: number }) => Math.abs(Math.hypot(p.x - 400, p.y - 500) - 120);
    // Chords would sag 4.1 units. An open stroke's first and last spans have no outer neighbour.
    for (const p of line.slice(line.length / 12, -line.length / 12))
      expect(off(p)).toBeLessThan(0.5);
    for (const p of line) expect(off(p)).toBeLessThan(3);
  });

  it("passes through every sample of sharp sparse turns without overshooting", () => {
    // An "N" with 100-unit strokes, one sample per corner.
    const raw = [
      [0, 100],
      [0, 0],
      [60, 100],
      [60, 0],
    ].map(([x, y], i) => ({ x, y, p: 0.5, t: i * 16 }));
    const { stroke } = write(raw, "ballpoint", 0);
    for (const corner of raw) expect(stroke.points).toContainEqual(corner);
    const near = (p: Point, a: Point, b: Point) => {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    for (const p of stroke.points)
      expect(Math.min(...raw.slice(1).map((b, i) => near(p, raw[i], b)))).toBeLessThan(5);
  });

  it("keeps dense input on its received samples", () => {
    const raw = circle(400, 120, 4);
    const { stroke } = write(raw, "ballpoint", 0);
    expect(stroke.points).toEqual(raw);
  });

  it("drops samples replayed by overlapping raw and move batches", () => {
    const raw = circle(24);
    const clean = write(raw).stroke.points;
    const stabilize = stabilizer(0.2);
    const points = [stabilize(raw[0])];
    const input = new StrokeInput(points, raw[0], { stabilize, spacing: 2 });
    // Raw updates arrive first; the frame-aligned move then repeats them, sometimes late.
    for (let i = 1; i < raw.length - 1; i += 3) {
      for (const p of raw.slice(i, i + 3)) input.add(p);
      for (const p of raw.slice(Math.max(1, i - 2), i + 3)) input.add({ ...p });
    }
    input.end(raw[raw.length - 1]);
    expect(points).toEqual(clean);
  });

  it("only ever changes the newest point, so live ink can append settled segments", () => {
    const raw = circle(30, 120, 12);
    for (const brush of BRUSHES) {
      const stabilize = stabilizer(0.2);
      const stroke: Stroke = {
        id: brush,
        tool: "pen",
        color: "#000000",
        width: 2 * UNIT,
        points: [stabilize(raw[0])],
        brush,
        pressureSensitive: true,
      };
      const input = new StrokeInput(stroke.points, raw[0], { stabilize, spacing: 2 });
      const drawn: string[] = [];
      for (const p of raw.slice(1)) {
        input.add({ ...p, p: 0.3 + (p.t % 7) / 10 });
        const plan = brushPlan(stroke);
        drawn.push(plan.draw(0, plan.stable));
      }
      input.end();
      const final = brushPlan(stroke);
      for (const settled of drawn)
        expect(final.draw(0, final.segments).startsWith(settled)).toBe(true);
    }
  });

  it("keeps lift pressure and ends a pressure-only tap as a dot", () => {
    const { stroke } = write([
      { x: 10, y: 10, p: 0.4, t: 0 },
      { x: 10, y: 10, p: 0.9, t: 4 },
      { x: 10, y: 10, p: 0, t: 8 },
    ]);
    expect(brushPlan(stroke).segments).toBe(0);
    expect(stroke.points.at(-1)!.p).toBe(0.9);
  });

  it("resolves each new sample without recomputing the stroke", () => {
    const raw = Array.from({ length: 4000 }, (_, i) => ({
      x: 100 + i * 0.5,
      y: 300 + Math.sin(i / 20) * 40,
      p: 0.5,
      t: i * 4,
    }));
    const stroke: Stroke = {
      id: "f",
      tool: "pen",
      color: "#000",
      width: 2,
      points: [raw[0]],
      brush: "fountain",
    };
    const input = new StrokeInput(stroke.points, raw[0], { spacing: 2 });
    const time = (from: number, to: number) => {
      const start = performance.now();
      for (const p of raw.slice(from, to)) {
        input.add(p);
        brushPlan(stroke);
      }
      return performance.now() - start;
    };
    time(1, 200);
    const early = time(200, 600),
      late = time(3600, 4000);
    // Quadratic work would make the last samples ~10x slower than the early ones.
    expect(late).toBeLessThan(early * 4 + 20);
  });
});
