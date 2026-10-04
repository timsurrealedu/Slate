import { getStroke } from "perfect-freehand";
import type { Page, Point, Stroke } from "../core/model";
const paths = new WeakMap<Stroke, { count: number; width: number; d: string; path?: Path2D }>();
function radius(stroke: Stroke, point: Point) {
  return stroke.tool === "highlighter" ? stroke.width / 2 : stroke.width * (0.65 + 0.7 * point.p);
}
function directPath(stroke: Stroke, start: number, d: string) {
  // Rounded segments follow recorded samples exactly. Appending ink never moves earlier ink.
  for (let i = start; i < stroke.points.length; i++) {
    const point = stroke.points[i],
      r = radius(stroke, point),
      previous = stroke.points[i - 1];
    d += `M${point.x - r},${point.y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`;
    if (!previous) continue;
    const dx = point.x - previous.x,
      dy = point.y - previous.y,
      distance = Math.hypot(dx, dy);
    if (!distance) continue;
    const nx = -dy / distance,
      ny = dx / distance,
      before = radius(stroke, previous);
    d +=
      `M${previous.x + nx * before},${previous.y + ny * before}` +
      `L${point.x + nx * r},${point.y + ny * r}` +
      `L${point.x - nx * r},${point.y - ny * r}` +
      `L${previous.x - nx * before},${previous.y - ny * before}Z`;
  }
  return d;
}
export function strokePath(stroke: Stroke) {
  if (!stroke.points.length) return "";
  let cached = paths.get(stroke);
  if (!cached || cached.count !== stroke.points.length || cached.width !== stroke.width) {
    if (stroke.rendering === "direct") {
      const append = cached && cached.width === stroke.width && cached.count < stroke.points.length;
      cached = {
        count: stroke.points.length,
        width: stroke.width,
        d: directPath(stroke, append ? cached!.count : 0, append ? cached!.d : ""),
      };
      paths.set(stroke, cached);
      return cached.d;
    }
    const outline = getStroke(
      stroke.points.map((p) => [p.x, p.y, p.p]),
      {
        size: stroke.width * (stroke.tool === "highlighter" ? 1 : 2),
        thinning: stroke.tool === "pen" ? 0.55 : 0,
        smoothing: 0.65,
        streamline: 0.35,
        simulatePressure: false,
        last: true,
      },
    );
    if (!outline.length) return "";
    let d = `M${outline[0][0]},${outline[0][1]}`;
    for (let i = 0; i < outline.length; i++) {
      const next = outline[(i + 1) % outline.length];
      const p = outline[i];
      d += `Q${p[0]},${p[1]} ${(p[0] + next[0]) / 2},${(p[1] + next[1]) / 2}`;
    }
    cached = { count: stroke.points.length, width: stroke.width, d: d + "Z" };
    paths.set(stroke, cached);
  }
  return cached.d;
}
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const d = strokePath(stroke);
  if (!d) return;
  const cached = paths.get(stroke)!;
  cached.path ??= new Path2D(d);
  ctx.save();
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.3 : 1;
  ctx.fillStyle = stroke.color;
  ctx.fill(cached.path);
  ctx.restore();
}
export function drawPaper(ctx: CanvasRenderingContext2D, page: Page) {
  const { width, height, paper } = page;
  ctx.fillStyle = paper.color;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = paper.lineColor;
  ctx.fillStyle = paper.lineColor;
  ctx.lineWidth = 0.65;
  const spacing = paper.spacing;
  if (paper.style === "lined" || paper.style === "grid") {
    ctx.beginPath();
    for (let y = paper.style === "lined" ? 74 : spacing; y < height; y += spacing) {
      ctx.moveTo(paper.style === "lined" ? 52 : 0, y);
      ctx.lineTo(paper.style === "lined" ? width - 52 : width, y);
    }
    if (paper.style === "grid")
      for (let x = spacing; x < width; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
    ctx.stroke();
  } else if (paper.style === "dot")
    for (let y = spacing; y < height; y += spacing)
      for (let x = spacing; x < width; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
}
export function pageCanvas(page: Page, transparent = false, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(page.width * scale);
  canvas.height = Math.ceil(page.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (!transparent) drawPaper(ctx, page);
  page.strokes.forEach((s) => drawStroke(ctx, s));
  return canvas;
}
