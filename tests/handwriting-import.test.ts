import { describe, expect, it } from "vitest";
import {
  extractHandwriting,
  INK_COLORS,
  penColor,
  traceSize,
  type Raster,
} from "../src/slate/import/handwriting";

type Mark = { color: [number, number, number]; width: number; segments: number[][] };
// A phone photo: a sheet on a desk, lit unevenly, with faint blue rules and pen marks.
function photo(marks: Mark[], width = 800, height = 600): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let c = [92, 74, 58];
      if (x >= 80 && x < 720 && y >= 40 && y < 560) {
        const light = 236 - ((x - 80) / 640) * 46;
        c = [light, light * 0.97, light * 0.9];
        if ((y - 40) % 30 === 0) c = [c[0] * 0.88, c[1] * 0.92, c[2] * 1.0];
        for (const mark of marks)
          for (const [ax, ay, bx, by] of mark.segments) {
            const dx = bx - ax,
              dy = by - ay,
              l = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l));
            const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
            const cover = Math.max(0, Math.min(1, mark.width / 2 + 0.5 - d));
            if (cover > 0) c = c.map((v, k) => v * (1 - cover) + mark.color[k] * cover);
          }
      }
      data.set([c[0], c[1], c[2], 255], i);
    }
  return { data, width, height };
}
const circle = (cx: number, cy: number, r: number) =>
  Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2,
      b = ((i + 1) / 48) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)];
  });
const marks: Mark[] = [
  { color: [30, 30, 36], width: 3, segments: [[150, 150, 600, 170]] },
  { color: [28, 62, 176], width: 3, segments: circle(300, 360, 60) },
  { color: [196, 30, 34], width: 3, segments: [[480, 420, 650, 470]] },
  { color: [30, 30, 36], width: 5, segments: [[660, 220, 660, 220]] },
];
// The sheet minus its edge cell (10 px) is the page.
const toPage = (x: number, y: number) => ({ x: ((x - 90) * 794) / 620, y: ((y - 50) * 794) / 620 });

describe("handwriting photo import", () => {
  const { page } = extractHandwriting(photo(marks));
  const near = (x: number, y: number, color?: string) =>
    page.strokes.filter(
      (s) =>
        (!color || s.color === color) &&
        s.points.some((p) => Math.hypot(p.x - toPage(x, y).x, p.y - toPage(x, y).y) < 8),
    );

  it("maps the sheet to a page and ignores the desk, rules and lighting", () => {
    expect(page.width).toBe(794);
    expect(page.height).toBeCloseTo((500 / 620) * 794, -1);
    // Only the four marks are ink; rules and the sheet's edge are not.
    expect(page.strokes.length).toBeGreaterThanOrEqual(4);
    expect(page.strokes.length).toBeLessThan(12);
    for (const s of page.strokes)
      for (const p of s.points) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(page.width);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(page.height);
      }
  });

  it("traces a straight stroke end to end with its width", () => {
    const line = near(150, 150, INK_COLORS.black).concat(near(600, 170, INK_COLORS.black));
    expect(line.length).toBeGreaterThan(0);
    const xs = line.flatMap((s) => s.points.map((p) => p.x));
    expect(Math.min(...xs)).toBeLessThan(toPage(150, 0).x + 6);
    expect(Math.max(...xs)).toBeGreaterThan(toPage(600, 0).x - 6);
    for (const s of line) expect(s.width).toBeCloseTo((3 * 794) / 620, 0);
  });

  it("keeps a closed loop on its circle and snaps ink colors", () => {
    const loop = page.strokes.filter((s) => s.color === INK_COLORS.blue);
    expect(loop.length).toBeGreaterThan(0);
    const c = toPage(300, 360),
      r = (60 * 794) / 620;
    for (const s of loop)
      for (const p of s.points)
        expect(Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - r)).toBeLessThan(3);
    expect(near(480, 420, INK_COLORS.red)).toEqual(near(650, 470, INK_COLORS.red));
    expect(near(480, 420, INK_COLORS.red)).toHaveLength(1);
    expect(near(660, 220, INK_COLORS.black).length).toBeGreaterThan(0);
  });

  it("writes everything in black when colors are off, and keeps faint ink only when asked", () => {
    const plain = extractHandwriting(photo(marks), { sensitivity: 0.5, colors: false }).page;
    expect(new Set(plain.strokes.map((s) => s.color))).toEqual(new Set([INK_COLORS.black]));
    const faint: Mark[] = [{ color: [178, 178, 182], width: 2, segments: [[150, 300, 400, 300]] }];
    expect(
      extractHandwriting(photo(faint), { sensitivity: 0, colors: true }).page.strokes,
    ).toHaveLength(0);
    expect(
      extractHandwriting(photo(faint), { sensitivity: 1, colors: true }).page.strokes.length,
    ).toBeGreaterThan(0);
  });

  it("snaps colors and bounds the trace size", () => {
    expect(penColor(60, 60, 64)).toBe(INK_COLORS.black);
    expect(penColor(70, 110, 210)).toBe(INK_COLORS.blue);
    expect(penColor(200, 50, 50)).toBe(INK_COLORS.red);
    expect(penColor(40, 150, 80)).toBe(INK_COLORS.green);
    expect(traceSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(traceSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
