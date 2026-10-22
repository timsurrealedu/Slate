// Flexcil "Standard" templates, measured from its 768 × 1024 template PDFs.
import type { Page } from "../core/model";

export const FLEXCIL_PAPERS = [
  { name: "White", color: "#ffffff", line: "#d3d3d4", strong: "#969696" },
  { name: "Yellow", color: "#fef4c3", line: "#b4a36e", strong: "#8d8055" },
  { name: "Dark", color: "#2d2d2f", line: "#5d5955", strong: "#65605a" },
];
export const MARGIN_RED = "#c4151d";
const FRAME = 768,
  LATTICE = 26.4502,
  LEFT = 13.79,
  TOP = 9.5;
export interface PaperGeometry {
  lines: string;
  strong: string;
  red: string;
  dots: string;
  hairline: number;
  rule: number;
  strongColor: string;
}
const cache = new WeakMap<object, Map<string, PaperGeometry>>();
export function paperGeometry(page: Pick<Page, "width" | "height" | "paper">): PaperGeometry {
  const { paper, width, height } = page;
  const key = `${width}x${height}`;
  let byPaper = cache.get(paper);
  const hit = byPaper?.get(key);
  if (hit) return hit;
  const s = width / FRAME,
    H = height / s,
    f = (v: number) => Math.round(v * s * 100) / 100;
  let lines = "",
    strong = "",
    red = "",
    dots = "";
  const h = (y: number, x0 = 26, x1 = 742) => `M${f(x0)},${f(y)}H${f(x1)}`;
  const v = (x: number, y0: number, y1: number) => `M${f(x)},${f(y0)}V${f(y1)}`;
  const ruled = paper.style === "lined" || paper.style === "cornell" || paper.style === "legal";
  if (ruled) {
    strong += h(63.5) + h(H - 25.75);
    for (let y = 89.25; y <= H - 50.75; y += 26) lines += h(y);
  }
  const columnsX = Array.from({ length: 29 }, (_, i) => LEFT + i * LATTICE);
  const rowsY: number[] = [];
  for (let y = TOP; y <= H - TOP + 0.01; y += LATTICE) rowsY.push(y);
  if (paper.style === "grid") {
    for (const x of columnsX) lines += v(x, TOP, rowsY[rowsY.length - 1]);
    for (const y of rowsY) lines += h(y, LEFT, columnsX[columnsX.length - 1]);
  }
  if (paper.style === "vertical") for (const x of columnsX) lines += v(x, 0, H);
  if (paper.style === "dot")
    for (const y of rowsY)
      for (const x of columnsX)
        dots += `M${f(x + 1)},${f(y)}a${f(1)},${f(1)} 0 1,0 ${f(-2)},0a${f(1)},${f(1)} 0 1,0 ${f(2)},0Z`;
  if (paper.style === "cornell") {
    const summary = H - 232.5;
    red += h(193) + h(summary) + v(215.5, 193, summary);
  }
  if (paper.style === "legal") red += v(149.5, 63, H - 26);
  if (paper.columns) red += v(383.75, 63, H - 26);
  const palette = FLEXCIL_PAPERS.find((p) => p.color === paper.color.toLowerCase());
  const geometry = {
    lines,
    strong,
    red,
    dots,
    hairline: 0.5 * s,
    rule: s,
    strongColor: palette?.strong ?? paper.lineColor,
  };
  if (!byPaper) cache.set(paper, (byPaper = new Map()));
  byPaper.set(key, geometry);
  return geometry;
}
export function drawFlexcilPaper(ctx: CanvasRenderingContext2D, page: Page) {
  const g = paperGeometry(page);
  ctx.fillStyle = page.paper.color;
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.lineWidth = g.hairline;
  ctx.strokeStyle = page.paper.lineColor;
  if (g.lines) ctx.stroke(new Path2D(g.lines));
  ctx.strokeStyle = g.strongColor;
  if (g.strong) ctx.stroke(new Path2D(g.strong));
  ctx.lineWidth = g.rule;
  ctx.strokeStyle = MARGIN_RED;
  if (g.red) ctx.stroke(new Path2D(g.red));
  ctx.fillStyle = page.paper.lineColor;
  if (g.dots) ctx.fill(new Path2D(g.dots));
}
