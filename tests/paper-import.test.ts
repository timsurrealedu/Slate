import { describe, expect, it } from "vitest";
import { extractHandwriting, type Raster } from "../src/slate/import/handwriting";
import {
  analyzePaper,
  removeRuling,
  ruleAt,
  ruledCoordinate,
} from "../src/slate/import/paperAnalysis";
import { docSchema } from "../src/slate/core/storage";
import { makeDocument } from "../src/slate/core/model";
import { paperGeometry } from "../src/slate/ink/paper";

// Independent raster fixtures: neutral printed rules are as dark as faint handwriting.
function scan(
  style: "blank" | "lined" | "grid" | "dot" | "vertical" | "legal" | "cornell",
  skew = false,
  holes = false,
  writing = true,
): Raster {
  const width = 480,
    height = 640,
    data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const shade = 240 - x / 20 - y / 50;
      const dy = skew ? 0.04 * (x - width / 2) + 3 * ((x - width / 2) / width) ** 2 : 0;
      const py = (((y - dy - 40) % 24) + 24) % 24,
        px = (((x - 30) % 24) + 24) % 24;
      const h = py < 1.2 || py > 23.4,
        v = px < 1.2 || px > 23.4;
      const rule =
        (["lined", "legal", "cornell"].includes(style) && h) ||
        (style === "grid" && (h || v)) ||
        (style === "vertical" && v) ||
        (style === "dot" && Math.hypot(Math.min(px, 24 - px), Math.min(py, 24 - py)) < 1.5);
      let c = rule
        ? [shade * 0.63, shade * 0.64, shade * 0.65]
        : [shade, shade * 0.98, shade * 0.95];
      if (
        (style === "legal" && Math.abs(x - 100) < 1.1 && y > 40 && y < 600) ||
        (style === "cornell" &&
          ((Math.abs(x - 135) < 1.1 && y >= 128 && y <= 512) ||
            ((Math.abs(y - 128) < 1.1 || Math.abs(y - 512) < 1.1) && x > 30 && x < 450)))
      )
        c = [196, 21, 29];
      // Blue handwritten circles, a vertical crossing, one long arrow and a fine full stop.
      const loop = Math.abs(Math.hypot(x - 180, y - 230) - 28) < 1.1;
      const cross = Math.abs(x - 300) < 1.2 && y >= 150 && y <= 345;
      const arrow = y >= 420 && y <= 422 && x >= 110 && x <= 370;
      const head = x >= 350 && x <= 370 && Math.abs(Math.abs(y - 421) - (370 - x) * 0.6) < 1.2;
      const dot = Math.hypot(x - 210, y - 370) < 2.2;
      if (writing && (loop || cross || arrow || head || dot)) c = [28, 42, 112];
      if (holes && [100, 280, 520].some((cy) => Math.hypot(x - 465, y - cy) < 9)) c = [12, 12, 12];
      data.set([...c, 255], (y * width + x) * 4);
    }
  return { data, width, height };
}
const inside = (r: ReturnType<typeof extractHandwriting>) => {
  for (const s of r.page.strokes)
    for (const p of s.points) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(r.page.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(r.page.height);
    }
  const doc = makeDocument("notebook", "Imported", null);
  doc.pages = [r.page];
  expect(docSchema.safeParse(doc).success).toBe(true);
};
describe("paper-aware notebook import", () => {
  it("continues a photographed rule's slope through both frame edges", () => {
    const rule = { position: 35, samples: [30, 40], strength: 0.1 };
    expect(ruleAt(rule, 0, 480)).toBe(25);
    expect(ruleAt(rule, 240, 480)).toBe(35);
    expect(ruleAt(rule, 480, 480)).toBe(45);
  });
  it("removes a concealed periodic rule while retaining ink drawn over it", () => {
    const width = 240,
      height = 240,
      dark = new Float32Array(width * height),
      chroma = new Float32Array(width * height);
    for (const y of [80, 104, 128, 152]) for (let x = 0; x < width; x++) dark[y * width + x] = 0.23;
    for (let x = 60; x <= 130; x++) {
      dark[128 * width + x] = 0.65;
      chroma[128 * width + x] = 0.3;
    }
    const mask = Uint8Array.from(dark, (d) => (d > 0.1 ? 1 : 0));
    const rules = [80, 104, 152].map((position, k) => ({
      position,
      samples: [position, position],
      strength: 0.1,
      ordinal: [0, 1, 3][k],
    }));
    removeRuling(mask, dark, chroma, width, height, {
      style: "lined",
      horizontal: { rules, spacing: 24 },
      vertical: { rules: [], spacing: 0 },
      dots: [],
    });
    expect(mask.reduce((sum, v) => sum + v, 0)).toBe(71);
    expect(mask[128 * width + 90]).toBe(1);
    expect(mask[128 * width + 160]).toBe(0);
  });
  it("matches writing size, nib width and baselines to the actual native ruler", () => {
    const raster = scan("lined", false, false, false);
    for (const [cx, cy] of [
      [200, 180],
      [200, 204],
      [224, 204],
    ])
      for (let y = cy - 3; y <= cy + 3; y++)
        for (let x = cx - 3; x <= cx + 3; x++)
          if (Math.hypot(x - cx, y - cy) < 2.2)
            raster.data.set([28, 42, 112, 255], (y * raster.width + x) * 4);
    const copy = raster.data.slice();
    const { page } = extractHandwriting(raster);
    expect(Buffer.from(raster.data).equals(Buffer.from(copy))).toBe(true);
    const points = page.strokes
      .filter((s) => s.color === "#0069db")
      .map((s) => s.points[0])
      .sort((a, b) => a.y - b.y || a.x - b.x);
    expect(points).toHaveLength(3);
    const native = paperGeometry(page);
    const rows = [...native.lines.matchAll(/M[\d.]+,([\d.]+)H/g)].map((m) => Number(m[1]));
    const pitch = rows[1] - rows[0];
    expect(points[1].y - points[0].y).toBeCloseTo(pitch, 0);
    expect(points[2].x - points[1].x).toBeCloseTo(pitch, 0);
    const scale = pitch / 24;
    const strongRows = [...native.strong.matchAll(/M[\d.]+,([\d.]+)H/g)].map((m) => Number(m[1]));
    for (const p of points)
      expect(
        Math.min(...[...rows, ...strongRows].map((y) => Math.abs(p.y + 3.5 * scale - y))),
      ).toBeLessThan(scale * 1.1);
    for (const s of page.strokes) expect(s.width * 2).toBeGreaterThan(2 * scale);
  });
  it("recognizes a faint rule family visible across only the lit part of the page", () => {
    const width = 480,
      height = 640,
      dark = new Float32Array(width * height);
    for (let y = 40; y < height; y += 24) for (let x = 50; x < 240; x++) dark[y * width + x] = 0.06;
    expect(analyzePaper(dark, width, height).style).toBe("lined");
  });
  it.each(["blank", "lined", "grid", "dot", "vertical", "legal", "cornell"] as const)(
    "replaces %s paper with its native template and keeps the drawing",
    (style) => {
      const result = extractHandwriting(scan(style));
      expect(result.detection.style).toBe(style);
      expect(result.page.paper).toMatchObject({ style, template: "flexcil" });
      expect(result.page.width).toBe(794);
      expect(result.page.height).toBe(1059);
      expect(result.page.strokes.length).toBeGreaterThanOrEqual(5);
      expect(result.page.strokes.length).toBeLessThan(40);
      expect(result.inkPixels).toBeGreaterThan(1300);
      expect(result.inkPixels).toBeLessThan(2300);
      // The long handwritten arrow survives even though it is horizontal.
      const ink = result.page.strokes.filter((s) => s.color === "#0069db").flatMap((s) => s.points);
      expect(Math.max(...ink.map((p) => p.x)) - Math.min(...ink.map((p) => p.x))).toBeGreaterThan(
        220,
      );
      // A small punctuation dot survives; the printed dot lattice does not become strokes.
      expect(result.page.strokes.some((s) => s.points.length <= 2)).toBe(true);
      inside(result);
    },
  );
  it("recognizes gently slanted/curved rules and excludes punch holes", () => {
    const result = extractHandwriting(scan("lined", true, true));
    expect(result.detection.style).toBe("lined");
    expect(result.detection.horizontalRules).toBeGreaterThan(18);
    expect(result.page.strokes.length).toBeLessThan(45);
    expect(result.inkPixels).toBeLessThan(2400);
    inside(result);
  });
  it("excludes pale torn binding material between repeated punch holes", () => {
    const raster = scan("lined", false, true);
    for (let y = 30; y < 610; y++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = 466 + Math.round(3 * Math.sin(y / 20)) + dx;
        if (raster.data[(y * raster.width + x) * 4] < 80) continue;
        raster.data.set([130, 130, 130, 255], (y * raster.width + x) * 4);
      }
    const result = extractHandwriting(raster),
      clean = extractHandwriting(scan("lined", false, true));
    expect(result.page.strokes.length).toBe(clean.page.strokes.length);
    expect(result.inkPixels).toBeLessThan(2400);
    inside(result);
  });
  it("fits ink to a chosen paper without importing the source squares", () => {
    const result = extractHandwriting(scan("grid"), {
      sensitivity: 0.5,
      colors: false,
      paper: "lined",
    });
    expect(result.detection.style).toBe("grid");
    expect(result.page.paper.style).toBe("lined");
    expect(result.page.strokes.length).toBeLessThan(40);
    expect(new Set(result.page.strokes.map((s) => s.color))).toEqual(new Set(["#000000"]));
    inside(result);
  });
  it("registers varying source pitches continuously, including a missing rule", () => {
    const rules = [30, 65, 99, 132, 196, 227, 257].map((position, i) => ({
      position,
      samples: [position - 3, position + 3],
      strength: 0.1,
      ordinal: [0, 1, 2, 3, 5, 6, 7][i],
    }));
    const ruling = { rules, spacing: 33 };
    for (let i = 0; i < rules.length; i++)
      expect(ruledCoordinate(ruling, 240, rules[i].position, 480)).toBeCloseTo(
        rules[i].ordinal * 33,
      );
    const before = ruledCoordinate(ruling, 240, 131.999, 480),
      after = ruledCoordinate(ruling, 240, 132.001, 480);
    expect(after - before).toBeLessThan(0.01);
  });
  it("does not treat isolated diagram edges as a paper grid", () => {
    const width = 240,
      height = 320,
      dark = new Float32Array(width * height);
    for (let x = 20; x < 220; x++) dark[160 * width + x] = 0.7;
    for (let y = 20; y < 300; y++) dark[y * width + 120] = 0.7;
    expect(analyzePaper(dark, width, height).style).toBe("blank");
  });
  it("handles an empty or transparent white sheet and rejects malformed raster sizes", () => {
    const raster = scan("blank");
    raster.data.fill(255);
    expect(extractHandwriting(raster).page.strokes).toHaveLength(0);
    expect(() => extractHandwriting({ ...raster, data: new Uint8ClampedArray(1) })).toThrow(
      /supported size/,
    );
  });
});
