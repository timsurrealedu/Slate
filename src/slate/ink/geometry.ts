import type { Stroke } from "../core/model";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function distanceToSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax,
    dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
export function hitStroke(stroke: Stroke, x: number, y: number, radius: number) {
  const p = stroke.points;
  if (p.length === 1) return Math.hypot(p[0].x - x, p[0].y - y) <= radius + stroke.width;
  for (let i = 1; i < p.length; i++)
    if (
      distanceToSegment(x, y, p[i - 1].x, p[i - 1].y, p[i].x, p[i].y) <=
      radius + stroke.width / 2
    )
      return true;
  return false;
}
export function bounds(strokes: Stroke[]): Rect | null {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const s of strokes)
    for (const p of s.points) {
      left = Math.min(left, p.x - s.width);
      top = Math.min(top, p.y - s.width);
      right = Math.max(right, p.x + s.width);
      bottom = Math.max(bottom, p.y + s.width);
    }
  return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
}
export function contains(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
export function intersects(a: Rect, b: Rect) {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
export function translate(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) };
}
export function transform(
  stroke: Stroke,
  center: { x: number; y: number },
  scale = 1,
  angle = 0,
): Stroke {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return {
    ...stroke,
    width: Math.min(100, Math.max(0.1, stroke.width * scale)),
    points: stroke.points.map((point) => {
      const x = (point.x - center.x) * scale,
        y = (point.y - center.y) * scale;
      return { ...point, x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
    }),
  };
}
