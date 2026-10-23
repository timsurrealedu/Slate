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
  const colors = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      let c = [92, 74, 58];
      if (x >= 80 && x < 720 && y >= 40 && y < 560) {
        const light = 236 - ((x - 80) / 640) * 46;
        c = [light, light * 0.97, light * 0.9];
        if ((y - 40) % 30 === 0) c = [c[0] * 0.88, c[1] * 0.92, c[2] * 1.0];
      }
      colors.set(c, i);
    }
  // Paint each independent fixture segment inside its bounds, retaining floating-point
  // compositing until the final byte conversion. This avoids timing the fixture generator.
  for (const mark of marks)
    for (const [ax, ay, bx, by] of mark.segments) {
      const dx = bx - ax,
        dy = by - ay,
        l = dx * dx + dy * dy || 1,
        pad = mark.width / 2 + 0.5;
      for (
        let y = Math.max(40, Math.ceil(Math.min(ay, by) - pad));
        y <= Math.min(height - 1, 559, Math.floor(Math.max(ay, by) + pad));
        y++
      )
        for (
          let x = Math.max(80, Math.ceil(Math.min(ax, bx) - pad));
          x <= Math.min(width - 1, 719, Math.floor(Math.max(ax, bx) + pad));
          x++
        ) {
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l));
          const cover = Math.max(
            0,
            Math.min(1, pad - Math.hypot(x - ax - t * dx, y - ay - t * dy)),
          );
          const i = (y * width + x) * 3;
          for (let k = 0; k < 3; k++)
            colors[i + k] = colors[i + k] * (1 - cover) + mark.color[k] * cover;
        }
    }
  for (let i = 0; i < width * height; i++)
    data.set([colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2], 255], i * 4);
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
const scale = (26 * 794) / 768 / 30;
const fixture = photo(marks);

describe("handwriting photo import", () => {
  const { page } = extractHandwriting(fixture);

  it("maps the sheet to a page and ignores the desk, rules and lighting", () => {
    expect(page.width).toBe(794);
    expect(page.height).toBe(1059);
    expect(page.paper).toMatchObject({ style: "lined", template: "flexcil" });
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
    const line = page.strokes.filter((s) => s.color === INK_COLORS.black && s.points.length > 2);
    expect(line.length).toBeGreaterThan(0);
    const xs = line.flatMap((s) => s.points.map((p) => p.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(450 * scale, -1);
    // Precise ink stores its radius; compare the rendered diameter with the source nib.
    for (const s of line) expect(s.width * 2).toBeCloseTo(3 * scale, 0);
  });

  it("keeps a closed loop on its circle and snaps ink colors", () => {
    const loop = page.strokes.filter((s) => s.color === INK_COLORS.blue);
    expect(loop.length).toBeGreaterThan(0);
    const points = loop.flatMap((s) => s.points);
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const c = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      },
      r = 60 * scale;
    for (const s of loop)
      for (const p of s.points)
        expect(Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - r)).toBeLessThan(3);
    expect(page.strokes.filter((s) => s.color === INK_COLORS.red)).toHaveLength(1);
    expect(page.strokes.some((s) => s.color === INK_COLORS.black && s.points.length <= 2)).toBe(
      true,
    );
  });

  it("writes everything in black when colors are off, and keeps faint ink only when asked", () => {
    const plain = extractHandwriting(fixture, { sensitivity: 0.5, colors: false }).page;
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
  it("retains a genuinely broad pen instead of treating its width as a paper defect", () => {
    const { page: broad } = extractHandwriting(
      photo([{ color: [30, 30, 36], width: 12, segments: [[150, 150, 600, 170]] }]),
    );
    const ink = broad.strokes.filter((s) => s.color === INK_COLORS.black);
    const xs = ink.flatMap((s) => s.points.map((p) => p.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(440 * scale);
    expect(ink.some((s) => s.width * 2 > 10 * scale)).toBe(true);
  });
  it("keeps bold lettering among fine handwriting", () => {
    const { page: mixed } = extractHandwriting(
      photo([
        { color: [30, 30, 36], width: 3, segments: [[150, 150, 600, 170]] },
        {
          color: [30, 30, 36],
          width: 10,
          segments: [
            [300, 380, 300, 340],
            [300, 340, 320, 370],
            [320, 370, 340, 340],
            [340, 340, 340, 380],
          ],
        },
      ]),
    );
    const ink = mixed.strokes.filter((s) => s.color === INK_COLORS.black);
    const ys = ink.flatMap((s) => s.points.map((p) => p.y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(200 * scale);
    expect(ink.some((s) => s.width * 2 > 7 * scale)).toBe(true);
  });

  it("keeps one navy pen consistent across light, dark and intersecting fragments", () => {
    const { page: ink } = extractHandwriting(
      photo([
        { color: [55, 63, 84], width: 2, segments: circle(230, 240, 24) },
        {
          color: [70, 79, 103],
          width: 2,
          segments: [
            [200, 240, 260, 240],
            [230, 210, 230, 270],
          ],
        },
        { color: [90, 94, 113], width: 2, segments: circle(390, 350, 18) },
        {
          color: [55, 63, 84],
          width: 2,
          segments: [
            [500, 300, 530, 350],
            [530, 350, 570, 300],
            [570, 300, 600, 350],
          ],
        },
      ]),
    );
    expect(new Set(ink.strokes.map((s) => s.color))).toEqual(new Set([INK_COLORS.blue]));
    const lines = ink.strokes.filter((s) => s.points.length > 2);
    expect(lines.length).toBeGreaterThan(5);
    expect(new Set(lines.map((s) => s.width.toFixed(4))).size).toBe(1);
    expect(lines[0].width * 2).toBeGreaterThan(1.2 * scale);
    expect(ink.strokes.every((s) => s.width * 2 >= 1.2)).toBe(true);
    expect(lines[0].width * 2).toBeLessThan(3 * scale);
    expect(
      ink.strokes.every((s) => s.rendering === "precise" && !s.brush && !s.pressureSensitive),
    ).toBe(true);
  });

  it("preserves distinct pens, including black writing beside a dominant blue pen", () => {
    const colors: Mark["color"][] = [
      [28, 62, 176],
      [30, 30, 30],
      [196, 30, 34],
      [30, 156, 70],
      [140, 40, 180],
      [200, 110, 20],
    ];
    const widths = [3, 5, 2, 4, 3, 2];
    const { page: ink } = extractHandwriting(
      photo(
        colors.map((color, k) => ({
          color,
          width: widths[k],
          segments: [[180, 120 + k * 65, 600, 125 + k * 65]],
        })),
      ),
    );
    expect(new Set(ink.strokes.map((s) => s.color))).toEqual(new Set(Object.values(INK_COLORS)));
    const palette = [
      INK_COLORS.blue,
      INK_COLORS.black,
      INK_COLORS.red,
      INK_COLORS.green,
      INK_COLORS.purple,
      INK_COLORS.orange,
    ];
    palette.forEach((color, k) => {
      const pen = ink.strokes.filter((s) => s.color === color);
      expect(pen.length).toBeGreaterThan(0);
      pen.forEach((s) =>
        expect(Math.abs(s.width * 2 - widths[k] * scale)).toBeLessThan(1.1 * scale),
      );
    });
    const two = extractHandwriting(
      photo([
        { color: [28, 62, 176], width: 3, segments: circle(300, 260, 90) },
        { color: [30, 30, 30], width: 3, segments: [[460, 420, 600, 425]] },
      ]),
    ).page;
    expect(new Set(two.strokes.map((s) => s.color))).toEqual(
      new Set([INK_COLORS.blue, INK_COLORS.black]),
    );
  });

  it("preserves small closed counters, subscripts and punctuation without spline fitting", () => {
    const centers = [
      [220, 204, 12],
      [300, 307, 4],
      [420, 367, 5],
    ];
    const { page: ink } = extractHandwriting(
      photo([
        ...centers.map(([x, y, r]) => ({
          color: [55, 63, 84] as Mark["color"],
          width: 1.5,
          segments: circle(x, y, r),
        })),
        { color: [55, 63, 84], width: 1.5, segments: [[304, 307, 304, 320]] },
        {
          color: [55, 63, 84],
          width: 3.2,
          segments: [
            [500, 320, 500, 320],
            [500, 328, 500, 328],
          ],
        },
      ]),
    );
    const loops = ink.strokes.filter(
      (s) =>
        s.points.length > 5 &&
        Math.hypot(s.points[0].x - s.points.at(-1)!.x, s.points[0].y - s.points.at(-1)!.y) < 1,
    );
    expect(loops.length).toBeGreaterThanOrEqual(3);
    expect(ink.strokes.filter((s) => s.points.length === 1)).toHaveLength(2);
    const radii = loops
      .map((s) => Math.max(...s.points.map((p) => p.x)) - Math.min(...s.points.map((p) => p.x)))
      .sort((a, b) => a - b);
    expect(radii[0]).toBeGreaterThan(5 * scale);
    expect(radii[0]).toBeLessThan(10 * scale);
  });
});
