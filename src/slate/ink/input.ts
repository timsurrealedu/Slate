// Turns a pointer's samples into stroke points.
// - Replayed samples (raw and coalesced batches overlap) are dropped by time and position.
// - The newest sample is shown as a provisional tip. Once the next one arrives, the gap before it
//   is filled along a centripetal Catmull-Rom curve, so sparse fast input bends instead of
//   drawing chords, and the stabilizer sees evenly spaced samples.
// - The lift drains the stabilizer's lag along its own path and lands on the lift position.
// Only the newest stroke point is ever replaced, which BrushPlan's settled segments rely on.
import type { Point } from "../core/model";
import { straighten } from "./flexcil";

const MAX_FILL = 32;

// Centripetal Catmull-Rom (Barry-Goldman) between b and c at u in [0, 1].
function curve(a: Point, b: Point, c: Point, d: Point, u: number) {
  const knot = (p: Point, q: Point) => Math.max(1e-3, Math.hypot(q.x - p.x, q.y - p.y)) ** 0.5;
  const t1 = knot(a, b),
    t2 = t1 + knot(b, c),
    t3 = t2 + knot(c, d),
    t = t1 + (t2 - t1) * u;
  const lerp = (p: Point, q: Point, from: number, to: number) => {
    const k = (t - from) / (to - from);
    return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
  };
  const a1 = lerp(a, b, 0, t1),
    a2 = lerp(b, c, t1, t2),
    a3 = lerp(c, d, t2, t3);
  const b1 = { x: a1.x + (a2.x - a1.x) * (t / t2), y: a1.y + (a2.y - a1.y) * (t / t2) },
    b2k = (t - t1) / (t3 - t1),
    b2 = { x: a2.x + (a3.x - a2.x) * b2k, y: a2.y + (a3.y - a2.y) * b2k };
  return { x: b1.x + (b2.x - b1.x) * u, y: b1.y + (b2.y - b1.y) * u };
}
const reflect = (p: Point, about: Point): Point => ({
  ...p,
  x: about.x * 2 - p.x,
  y: about.y * 2 - p.y,
});

export class StrokeInput {
  // Accepted raw samples: up to three before the tip, then the tip.
  private raw: Point[];
  private tip = false;
  // The newest point fed to the stabilizer, to measure its lag.
  private fed: Point;
  private ended = false;
  constructor(
    private points: Point[],
    first: Point,
    private options: {
      stabilize?: (point: Point) => Point;
      straight?: boolean;
      // Largest gap, in page units, left between filled samples.
      spacing: number;
    },
  ) {
    this.raw = [first];
    this.fed = first;
  }
  get last() {
    return this.raw[this.raw.length - 1];
  }
  // Adds a sample. Returns whether the stroke changed.
  add(next: Point) {
    const last = this.last;
    if (this.ended || next.t < last.t) return false;
    if (next.x === last.x && next.y === last.y && next.p === last.p) return false;
    if (this.options.straight) {
      this.raw = [this.raw[0], next];
      this.points.splice(1, this.points.length, straighten(this.points[0], next));
      return true;
    }
    if (this.tip) {
      this.points.pop();
      this.settle(next);
    }
    this.raw.push(next);
    if (this.raw.length > 4) this.raw.shift();
    this.points.push(next);
    this.tip = true;
    return true;
  }
  // Ends the stroke at the lift sample, when it has one.
  end(lift?: Point) {
    if (this.ended) return;
    // Lift-off reports zero pressure; the contact keeps its last pressure.
    if (lift) this.add(lift.p ? lift : { ...lift, p: this.last.p });
    this.ended = true;
    if (!this.tip || this.options.straight) return;
    this.points.pop();
    this.settle(undefined, true);
    const end = this.last,
      stabilize = this.options.stabilize,
      settled = this.points[this.points.length - 1];
    // A visible filter lag is drained along the filter's own path; a small one lands on the lift.
    if (
      stabilize &&
      Math.hypot(this.fed.x - settled.x, this.fed.y - settled.y) > this.options.spacing
    ) {
      // Hold the pen at its lift position until the filter catches up, as a pause would.
      const before = this.raw[this.raw.length - 2];
      const direction = { x: end.x - before.x, y: end.y - before.y };
      for (let i = 1; i <= 50; i++) {
        // Held samples arrive at a digitizer's 240 Hz, so velocity-driven widths see a pause.
        const out = stabilize({ ...end, t: end.t + i * 4 }),
          previous = this.points[this.points.length - 1];
        // The low-lag kernel extrapolates; it must never carry ink past the lift.
        if ((out.x - end.x) * direction.x + (out.y - end.y) * direction.y >= 0) break;
        if (Math.hypot(out.x - end.x, out.y - end.y) < 0.01) break;
        if (out.x !== previous.x || out.y !== previous.y) this.points.push(out);
      }
    }
    const previous = this.points[this.points.length - 1];
    if (previous.x !== end.x || previous.y !== end.y || previous.p !== end.p)
      this.points.push(previous.t > end.t ? { ...end, t: previous.t } : end);
  }
  // Commits the curve from the second-newest raw sample to the newest, now that the sample after
  // it (or the lift) fixes the tangent there.
  private settle(after?: Point, final = false) {
    const raw = this.raw,
      c = raw[raw.length - 1],
      b = raw[raw.length - 2];
    if (!b) return;
    const a = raw[raw.length - 3] ?? reflect(c, b),
      d = after ?? reflect(b, c);
    const gap = Math.hypot(c.x - b.x, c.y - b.y);
    // Chords up to three spacings sag less than a pixel on handwriting curves; dense input is kept.
    const fill =
      gap > this.options.spacing * 3
        ? Math.min(MAX_FILL, Math.ceil(gap / this.options.spacing) - 1)
        : 0;
    for (let i = 1; i <= fill; i++) {
      const u = i / (fill + 1),
        at = curve(a, b, c, d, u);
      this.push({ ...at, p: b.p + (c.p - b.p) * u, t: b.t + (c.t - b.t) * u });
    }
    // The lift sample is placed exactly by end().
    if (!final) this.push(c);
  }
  private push(point: Point) {
    this.fed = point;
    const sample = this.options.stabilize ? this.options.stabilize(point) : point,
      last = this.points[this.points.length - 1];
    if (sample.x !== last.x || sample.y !== last.y || sample.p !== last.p) this.points.push(sample);
  }
}
