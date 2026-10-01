import { getStroke } from "perfect-freehand";
import type { Page, Stroke } from "../core/model";
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
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
  if (!outline.length) return;
  ctx.save();
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.3 : 1;
  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < outline.length; i++) {
    const next = outline[(i + 1) % outline.length];
    const p = outline[i];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + next[0]) / 2, (p[1] + next[1]) / 2);
  }
  ctx.closePath();
  ctx.fill();
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
