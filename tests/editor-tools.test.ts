import { it, expect } from "vitest";
import { tableAt, tableMarkdown } from "../src/slate/markdown/tables";
import { transform } from "../src/slate/ink/geometry";
it("roundtrips a visual table with escaped pipes and finds its exact source range", () => {
  const cells = [
    ["A | B", "Value"],
    ["x", "42"],
  ];
  const table = tableMarkdown(cells),
    note = "# Heading\n\n" + table + "\n\nAfter";
  const found = tableAt(note, note.indexOf("42"))!;
  expect(found.cells).toEqual(cells);
  expect(note.slice(found.from, found.to)).toBe(table);
  expect(tableAt("# No table\nText", 4)).toBeNull();
});
it("rotates and scales actual ink points while preserving pressure, timing and source", () => {
  const stroke = {
    id: "ink",
    tool: "pen" as const,
    color: "#385775",
    width: 2,
    points: [{ x: 20, y: 10, p: 0.7, t: 123 }],
  };
  const next = transform(stroke, { x: 10, y: 10 }, 2, Math.PI / 2);
  expect(next.points[0].x).toBeCloseTo(10);
  expect(next.points[0].y).toBeCloseTo(30);
  expect(next.points[0]).toMatchObject({ p: 0.7, t: 123 });
  expect(next.width).toBe(4);
  expect(stroke.points[0]).toMatchObject({ x: 20, y: 10 });
});
