import { describe, expect, it } from "vitest";
import {
  extractLinks,
  newPage,
  duplicatePage,
  DEFAULT_PAPER,
  headings,
  type Stroke,
} from "../src/slate/core/model";
import { hitStroke, bounds, translate } from "../src/slate/ink/geometry";
import { strokePath, strokePathChunks } from "../src/slate/ink/render";
describe("knowledge and notebook model", () => {
  it.each(["pen", "highlighter"] as const)(
    "retains exact %s geometry and pressure across live rendering batches",
    (tool) => {
      const stroke: Stroke = {
        id: "fast-writing",
        rendering: "precise",
        pressureSensitive: true,
        tool,
        color: "#385775",
        width: tool === "pen" ? 0.6 : 14,
        points: [],
      };
      const points = Array.from({ length: 1025 }, (_, i) => ({
        x: 100 + i / 200 + Math.sin(i / 9) * 2,
        y: 100 + Math.cos(i / 9) * 3,
        p: (i % 17) / 16,
        t: i / 240,
      }));
      let previous = "";
      for (let start = 0; start < points.length; start += 127) {
        stroke.points.push(...points.slice(start, start + 127));
        const chunks = strokePathChunks(stroke);
        const current = chunks.join("");
        expect(current.startsWith(previous)).toBe(true);
        expect(current).toBe(strokePath(structuredClone(stroke)));
        expect(strokePath(stroke)).toBe(current);
        previous = current;
      }
      expect(stroke.points).toEqual(points);
    },
  );
  it.each(["smooth", "precise"] as const)(
    "renders constant-width %s ink independently of recorded pressure without changing input",
    (rendering) => {
      const stroke: Stroke = {
        id: "smooth",
        rendering,
        pressureSensitive: false,
        tool: "pen",
        color: "#385775",
        width: 1.2,
        points: Array.from({ length: 40 }, (_, i) => ({ x: i * 4, y: 20, p: i / 39, t: i })),
      };
      const original = structuredClone(stroke);
      const steady = { ...stroke, points: stroke.points.map((p) => ({ ...p, p: 0.5 })) };
      expect(strokePath(stroke)).toBe(strokePath(steady));
      expect(strokePath({ ...stroke, pressureSensitive: true })).not.toBe(strokePath(steady));
      expect(stroke).toEqual(original);
      expect(translate(stroke, 5, 10)).toMatchObject({
        rendering,
        pressureSensitive: false,
      });
    },
  );
  it("keeps precise ink fixed through sharp turns, pressure jumps and retracing", () => {
    const stroke: Stroke = {
      id: "precise",
      rendering: "precise",
      pressureSensitive: true,
      tool: "pen",
      color: "#385775",
      width: 1.2,
      points: [
        { x: 10, y: 10, p: 0.1, t: 0 },
        { x: 100, y: 10, p: 0.9, t: 1 },
      ],
    };
    const original = structuredClone(stroke.points);
    const first = strokePath(stroke);
    for (const point of [
      { x: 100, y: 80, p: 0.1, t: 2 },
      { x: 100, y: 10, p: 0.7, t: 3 },
      { x: 20, y: 10, p: 0.2, t: 4 },
      { x: 20, y: 10, p: 0.8, t: 5 },
    ]) {
      const before = strokePath(stroke);
      stroke.points.push(point);
      expect(strokePath(stroke).startsWith(before)).toBe(true);
      expect(strokePath({ ...stroke, points: structuredClone(stroke.points) })).toBe(
        strokePath(stroke),
      );
    }
    expect(strokePath(stroke).startsWith(first)).toBe(true);
    expect(stroke.points.slice(0, 2)).toEqual(original);
  });
  it("keeps completed direct ink fixed as sharp turns and pressure samples arrive", () => {
    const stroke: Stroke = {
      id: "direct",
      rendering: "direct",
      tool: "pen",
      color: "#385775",
      width: 1.2,
      points: [
        { x: 10, y: 10, p: 0.2, t: 0 },
        { x: 100, y: 10, p: 0.8, t: 1 },
      ],
    };
    const initial = strokePath(stroke);
    stroke.points.push({ x: 100, y: 80, p: 0.4, t: 2 }, { x: 20, y: 80, p: 0.6, t: 3 });
    expect(strokePath(stroke).startsWith(initial)).toBe(true);
    expect(strokePath({ ...stroke, points: [...stroke.points] })).toBe(strokePath(stroke));
    expect(strokePath(translate(stroke, 5, 10))).not.toBe(strokePath(stroke));
    expect(translate(stroke, 5, 10).rendering).toBe("direct");
  });
  it("finds real wiki links while ignoring source examples", () => {
    const text =
      "[[Physics|alias]] [[Physics#Energy]]\n\x60[[Not a link]]\x60\n\x60\x60\x60md\n[[Code sample]]\n\x60\x60\x60\n[[Algebra]]";
    expect(extractLinks(text)).toEqual(["Physics", "Algebra"]);
    expect(
      headings("# Main\n\x60\x60\x60\n## Code\n\x60\x60\x60\n## Real").map((h) => h.text),
    ).toEqual(["Main", "Real"]);
  });
  it("duplicates paper and ink without sharing IDs or mutable points", () => {
    const page = newPage({ ...DEFAULT_PAPER, color: "#253041", style: "lined" });
    page.strokes = [
      { id: "s", tool: "pen", color: "#ffffff", width: 2, points: [{ x: 1, y: 2, p: 0.7, t: 5 }] },
    ];
    const copy = duplicatePage(page);
    copy.strokes[0].points[0].x = 50;
    expect(copy.id).not.toBe(page.id);
    expect(copy.strokes[0].id).not.toBe("s");
    expect(page.strokes[0].points[0].x).toBe(1);
    expect(copy.paper).toEqual(page.paper);
  });
  it("erases continuous segments and moves ink without losing pressure or timing", () => {
    const stroke: Stroke = {
      id: "s",
      tool: "pen",
      color: "#385775",
      width: 2,
      points: [
        { x: 0, y: 0, p: 0.3, t: 0 },
        { x: 100, y: 0, p: 0.9, t: 50 },
      ],
    };
    expect(hitStroke(stroke, 50, 2, 3)).toBe(true);
    expect(hitStroke(stroke, 50, 20, 3)).toBe(false);
    const moved = translate(stroke, 20, 30);
    expect(moved.points[1]).toEqual({ x: 120, y: 30, p: 0.9, t: 50 });
    expect(stroke.points[1].x).toBe(100);
    expect(bounds([moved])?.x).toBe(18);
  });
});
