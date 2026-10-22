// Flexcil's LowLatencySurfaceView front-buffers ink: each input batch appends only the spline
// segments that can no longer change, and redraws just the provisional tail. Settled segments
// accumulate per layer in an offscreen buffer, so a frame touches the newest few segments
// however long the stroke grows.
import type { Stroke } from "../core/model";
import { brushPlan, grainPaint, paintLayer, type BrushPlan, type PageRect } from "./flexcil";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
function union(a: Box | null, b: Box | null): Box | null {
  if (!a || !b) return a || b;
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
// Page units to whole device pixels under a scale-and-translate canvas transform.
function device(r: PageRect, m: DOMMatrix): Box | null {
  if (!r.width && !r.height) return null;
  const x = Math.floor(r.x * m.a + m.e) - 1,
    y = Math.floor(r.y * m.d + m.f) - 1;
  return {
    x,
    y,
    width: Math.ceil((r.x + r.width) * m.a + m.e) + 1 - x,
    height: Math.ceil((r.y + r.height) * m.d + m.f) + 1 - y,
  };
}
export class LiveBrush {
  private buffers: HTMLCanvasElement[] = [];
  private scratch: HTMLCanvasElement | null = null;
  private stroke: Stroke | null = null;
  private settled = 0;
  private tail: Box | null = null;
  // Forget the stroke; the next draw repaints it whole onto a cleared canvas.
  reset() {
    this.stroke = null;
  }
  draw(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    const view = ctx.canvas as HTMLCanvasElement,
      plan = brushPlan(stroke),
      m = ctx.getTransform();
    let dirty: Box | null = null;
    if (stroke !== this.stroke) {
      this.stroke = stroke;
      this.settled = 0;
      this.tail = null;
      ctx.save();
      ctx.resetTransform();
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.restore();
      plan.layers.forEach((_, i) => {
        const buffer = (this.buffers[i] ??= document.createElement("canvas"));
        if (buffer.width !== view.width || buffer.height !== view.height) {
          buffer.width = view.width;
          buffer.height = view.height;
        } else buffer.getContext("2d")!.clearRect(0, 0, buffer.width, buffer.height);
      });
    }
    if (plan.stable > this.settled) {
      const path = new Path2D();
      plan.draw(this.settled, plan.stable, path);
      plan.layers.forEach((layer, i) => {
        const buffer = this.buffers[i].getContext("2d")!;
        buffer.setTransform(m);
        // Inner joins stay round; only the stroke's first end takes the layer's cap.
        paintLayer(buffer, layer, path, stroke.color, this.settled ? "round" : layer.cap);
      });
      dirty = device(plan.bounds(this.settled, plan.stable), m);
      this.settled = plan.stable;
    }
    const tail = device(plan.bounds(this.settled, plan.segments), m);
    dirty = union(union(dirty, this.tail), tail);
    this.tail = tail;
    if (!dirty) return;
    const x = Math.max(0, dirty.x),
      y = Math.max(0, dirty.y),
      width = Math.min(view.width, dirty.x + dirty.width) - x,
      height = Math.min(view.height, dirty.y + dirty.height) - y;
    if (width <= 0 || height <= 0) return;
    this.compose(ctx, plan, stroke, m, x, y, width, height);
  }
  private compose(
    ctx: CanvasRenderingContext2D,
    plan: BrushPlan,
    stroke: Stroke,
    m: DOMMatrix,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const tail = new Path2D();
    plan.draw(this.settled, plan.segments, tail);
    ctx.save();
    ctx.resetTransform();
    ctx.clearRect(x, y, width, height);
    ctx.restore();
    plan.layers.forEach((layer, i) => {
      const buffer = this.buffers[i];
      if (!layer.grain) {
        ctx.save();
        ctx.resetTransform();
        ctx.drawImage(buffer, x, y, width, height, x, y, width, height);
        ctx.restore();
        paintLayer(ctx, layer, tail, stroke.color);
        return;
      }
      // Graphite grain is translucent: tint the merged coverage once so joins never darken.
      const scratch = (this.scratch ??= document.createElement("canvas"));
      if (scratch.width < width) scratch.width = width;
      if (scratch.height < height) scratch.height = height;
      const s = scratch.getContext("2d")!;
      s.resetTransform();
      s.globalCompositeOperation = "source-over";
      s.clearRect(0, 0, width, height);
      s.drawImage(buffer, x, y, width, height, 0, 0, width, height);
      s.setTransform(m.a, m.b, m.c, m.d, m.e - x, m.f - y);
      paintLayer(s, layer, tail, stroke.color);
      s.globalCompositeOperation = "source-in";
      s.fillStyle = grainPaint(s, stroke.color, layer.grain);
      s.fillRect((x - m.e) / m.a, (y - m.f) / m.d, width / m.a, height / m.d);
      s.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.resetTransform();
      ctx.drawImage(scratch, 0, 0, width, height, x, y, width, height);
      ctx.restore();
    });
  }
}
