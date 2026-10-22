import { getStroke } from "perfect-freehand";
import type { Page, Stroke } from "../core/model";
import { drawBrush } from "./flexcil";
import { drawFlexcilPaper } from "./paper";
const paths = new WeakMap<
  Stroke,
  { count: number; width: number; chunks: string[]; d?: string; pressure?: number }
>();
const canvasPaths = new WeakMap<Stroke, { count: number; width: number; path: Path2D }>();
const CHUNK_POINTS = 64;
function radius(stroke: Stroke, pressure: number) {
  if (stroke.tool === "highlighter") return stroke.width / 2;
  return (
    stroke.width *
    (stroke.rendering === "precise" && stroke.pressureSensitive === false
      ? 1
      : 0.65 + 0.7 * pressure)
  );
}
function directPath(
  stroke: Stroke,
  start: number,
  end: number,
  d: string,
  pressure = stroke.points[0].p,
) {
  // Rounded segments follow recorded samples exactly. Appending ink never moves earlier ink.
  let before = radius(stroke, pressure);
  for (let i = start; i < end; i++) {
    const point = stroke.points[i];
    // Filtering width never changes coordinates or already rendered segments.
    pressure = stroke.rendering === "precise" ? pressure + (point.p - pressure) * 0.4 : point.p;
    const r = radius(stroke, pressure),
      previous = stroke.points[i - 1];
    d += `M${point.x - r},${point.y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`;
    if (previous) {
      const dx = point.x - previous.x,
        dy = point.y - previous.y,
        distance = Math.hypot(dx, dy);
      if (distance) {
        const nx = -dy / distance,
          ny = dx / distance;
        d +=
          `M${previous.x + nx * before},${previous.y + ny * before}` +
          `L${point.x + nx * r},${point.y + ny * r}` +
          `L${point.x - nx * r},${point.y - ny * r}` +
          `L${previous.x - nx * before},${previous.y - ny * before}Z`;
      }
    }
    before = r;
  }
  return { d, pressure };
}
function appendCanvasStroke(
  ctx: CanvasPath,
  stroke: Stroke,
  start: number,
  pressure = stroke.points[0].p,
) {
  let before = radius(stroke, pressure);
  for (let i = start; i < stroke.points.length; i++) {
    const point = stroke.points[i],
      previous = stroke.points[i - 1];
    pressure += (point.p - pressure) * 0.4;
    const r = radius(stroke, pressure);
    ctx.moveTo(point.x - r, point.y);
    ctx.arc(point.x, point.y, r, Math.PI, -Math.PI, true);
    ctx.closePath();
    if (previous) {
      const dx = point.x - previous.x,
        dy = point.y - previous.y,
        distance = Math.hypot(dx, dy);
      if (distance) {
        const nx = -dy / distance,
          ny = dx / distance;
        ctx.moveTo(previous.x + nx * before, previous.y + ny * before);
        ctx.lineTo(point.x + nx * r, point.y + ny * r);
        ctx.lineTo(point.x - nx * r, point.y - ny * r);
        ctx.lineTo(previous.x - nx * before, previous.y - ny * before);
        ctx.closePath();
      }
    }
    before = r;
  }
  return pressure;
}
export function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  start: number,
  pressure = stroke.points[0].p,
) {
  ctx.beginPath();
  const next = appendCanvasStroke(ctx, stroke, start, pressure);
  ctx.fillStyle = stroke.color;
  ctx.fill();
  return next;
}
export function strokePathChunks(stroke: Stroke): readonly string[] {
  if (!stroke.points.length) return [];
  let cached = paths.get(stroke);
  if (!cached || cached.count !== stroke.points.length || cached.width !== stroke.width) {
    if (stroke.rendering === "direct" || stroke.rendering === "precise") {
      const append = cached && cached.width === stroke.width && cached.count < stroke.points.length;
      const chunks = append ? cached!.chunks : [];
      let pressure = append ? cached!.pressure : undefined;
      for (let start = append ? cached!.count : 0; start < stroke.points.length;) {
        const index = Math.floor(start / CHUNK_POINTS);
        const end = Math.min(stroke.points.length, (index + 1) * CHUNK_POINTS);
        const next = directPath(stroke, start, end, chunks[index] || "", pressure);
        chunks[index] = next.d;
        pressure = next.pressure;
        start = end;
      }
      cached = {
        count: stroke.points.length,
        width: stroke.width,
        chunks,
        pressure,
      };
      paths.set(stroke, cached);
      return chunks;
    }
    const smooth = stroke.rendering === "smooth";
    let pressure = stroke.points[0].p;
    const outline = getStroke(
      stroke.points.map((p) => {
        // Keep raw input intact; soften pressure jumps only in the new renderer.
        pressure += (p.p - pressure) * 0.4;
        return [p.x, p.y, smooth ? pressure : p.p];
      }),
      {
        size: stroke.width * (stroke.tool === "highlighter" ? 1 : 2),
        thinning:
          stroke.tool === "pen" && (!smooth || stroke.pressureSensitive !== false)
            ? smooth
              ? 0.35
              : 0.55
            : 0,
        smoothing: 0.65,
        streamline: 0.35,
        simulatePressure: false,
        last: true,
      },
    );
    if (!outline.length) return [];
    let d = `M${outline[0][0]},${outline[0][1]}`;
    for (let i = 0; i < outline.length; i++) {
      const next = outline[(i + 1) % outline.length];
      const p = outline[i];
      d += `Q${p[0]},${p[1]} ${(p[0] + next[0]) / 2},${(p[1] + next[1]) / 2}`;
    }
    cached = { count: stroke.points.length, width: stroke.width, chunks: [d + "Z"], d: d + "Z" };
    paths.set(stroke, cached);
  }
  return cached.chunks;
}
export function strokePath(stroke: Stroke) {
  const chunks = strokePathChunks(stroke);
  if (!chunks.length) return "";
  const cached = paths.get(stroke)!;
  return (cached.d ??= chunks.join(""));
}
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.brush) return drawBrush(ctx, stroke);
  let cached = canvasPaths.get(stroke);
  if (!cached || cached.count !== stroke.points.length || cached.width !== stroke.width) {
    if (!stroke.points.length) return;
    let path: Path2D;
    if (stroke.rendering === "precise") {
      path = new Path2D();
      appendCanvasStroke(path, stroke, 0);
    } else path = new Path2D(strokePath(stroke));
    cached = { count: stroke.points.length, width: stroke.width, path };
    canvasPaths.set(stroke, cached);
  }
  ctx.save();
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.3 : 1;
  ctx.fillStyle = stroke.color;
  ctx.fill(cached.path);
  ctx.restore();
}
export function releaseStrokeGeometry(stroke: Stroke) {
  // Completed SVG and native paths already own their geometry; retain raw samples once.
  paths.delete(stroke);
}
export function drawPaper(ctx: CanvasRenderingContext2D, page: Page) {
  if (page.paper.template === "flexcil") return drawFlexcilPaper(ctx, page);
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
