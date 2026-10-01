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
describe("knowledge and notebook model", () => {
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
