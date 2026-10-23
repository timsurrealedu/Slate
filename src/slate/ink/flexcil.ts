// Port of Flexcil 1.5.0.13 handwriting mechanics (decompiled `xm.*`, `an.l`, `an.m`).
// Flexcil works in a 768-unit page frame; Slate pages are 794 units wide.
import type { Brush, Point, Stroke } from "../core/model";

export const UNIT = 794 / 768;
export const HIGHLIGHTER_OPACITY = 0.5;
interface Sample {
  x: number;
  y: number;
  w: number;
  t: number;
}

// ---------------------------------------------------------------- stabilizer
// StrokeStabilizer: a low-lag FIR over the latest samples; smoothLevel 0.2 gives 10 taps.
const KERNEL = [
  -1228319844, -1190018937, -1186857841, 970526244, 991590374, 995885341, -1152551790, -1128004441,
  -1120943783, -1131263247, 1036365542, 1048733437, 1051833196, 1049207159, 1038836222,
].map((bits) => new Float32Array(new Int32Array([bits]).buffer)[0]);
function kernel(taps: number) {
  if (taps < 2) return [1];
  if (taps === 15) return KERNEL;
  // Flexcil indexes the reference kernel with integer division.
  const weights = Array.from(
    { length: taps },
    (_, i) => KERNEL[Math.min(14, Math.floor((i * 14) / (taps - 1)))] * (15 / taps),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}
export function stabilizer(level: number, refreshRate = 60) {
  let taps = Math.max(1, Math.min(50, Math.floor(Math.max(0, Math.min(1, level)) * 50)));
  const limit = Math.min(50, Math.round(refreshRate / 3 + 10));
  if (limit < 50 && taps >= 2) {
    const cap = Math.max(2, Math.min(50, limit));
    taps = Math.max(2, Math.min(cap, Math.floor((taps * cap + 49) / 50)));
  }
  const weights = kernel(taps);
  const ring: Point[] = [];
  let next = 0;
  return (point: Point): Point => {
    if (taps < 2) return point;
    if (!ring.length) for (let i = 0; i < taps; i++) ring.push(point);
    else {
      ring[next] = point;
      next = (next + 1) % taps;
    }
    let x = 0,
      y = 0,
      p = 0,
      low = Infinity,
      high = -Infinity;
    // Weight 0 belongs to the oldest sample; the newest samples dominate.
    for (let i = 0; i < taps; i++) {
      const s = ring[(next + i) % taps];
      x += s.x * weights[i];
      y += s.y * weights[i];
      p += s.p * weights[i];
      low = Math.min(low, s.p);
      high = Math.max(high, s.p);
    }
    return { x, y, p: Math.max(low, Math.min(high, p)), t: point.t };
  };
}
// Straight pens snap to horizontal or vertical within 5 degrees.
export function straighten(start: Point, end: Point): Point {
  const dx = Math.abs(end.x - start.x),
    dy = Math.abs(end.y - start.y),
    tan = Math.tan((5 * Math.PI) / 180);
  if (dx > dy ? dy / dx < tan : dy && dx / dy < tan)
    return dx > dy ? { ...end, y: start.y } : { ...end, x: start.x };
  return end;
}

// ---------------------------------------------------------------- width models
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const elapsed = (a: Sample | Point, b: Sample | Point) => Math.max(1, a.t - b.t);
// TimedPoint.c: frame-units per millisecond, softened and capped.
const speed = (a: Sample | Point, b: Sample | Point) =>
  Math.min(4.5, (dist(a, b) / elapsed(a, b)) * 1.33);
interface Resolver {
  lo: number;
  hi: number;
  alpha: number;
  calm: number;
  fast: number;
  span: number;
  floor: number;
  ratio: number;
  extra: number;
}
// PressureVelocityStrokeWidthResolver defaults, and the pencil variant.
const INK: Resolver = {
  lo: 0.1,
  hi: 0.8,
  alpha: 0.3,
  calm: 1,
  fast: 2.5,
  span: 0.5,
  floor: 0.01,
  ratio: 0.5,
  extra: 0,
};
const GRAPHITE: Resolver = { ...INK, span: 1, floor: 0.08, ratio: 0.35, extra: 0.01 };
function range(c: Resolver, base: number) {
  const min = Math.max(c.floor, Math.max(0, base) * c.ratio),
    b = Math.max(0, base);
  return { min, max: c.extra > 0 ? Math.max(c.extra + min, b, min) : Math.max(min, b) };
}
// Width models run one point at a time so a growing stroke never recomputes its settled samples.
// `push` commits a point that newer input follows; `last` resolves the newest point as the lift
// would, without changing state, because the newest point is the only one that can still change.
interface Track {
  out: Sample[];
  push(point: Point): void;
  last(point: Point): Sample | null;
}
function track<S extends object>(
  out: Sample[],
  state: S,
  step: (s: S, cur: Point, final: boolean) => Sample | null,
): Track {
  return {
    out,
    push(point) {
      const sample = step(state, point, false);
      if (sample) out.push(sample);
    },
    last: (point) => step({ ...state }, point, true),
  };
}
interface ResolverState {
  smoothed: number;
  last: number;
}
function resolver(c: Resolver, base: number, pressure: boolean) {
  const { min, max } = range(c, base);
  return (st: ResolverState, prev: Point | null, p: number, cur: Point | null) => {
    let force = 1;
    if (pressure) {
      p = Math.max(0, p);
      force = p <= c.lo ? 0 : p >= c.hi ? 1 : clamp((p - c.lo) * (1 / (c.hi - c.lo)), 0, 1);
      force = prev ? clamp(force * c.alpha + (1 - c.alpha) * st.smoothed, 0, 1) : force;
      st.smoothed = force;
    }
    let pace = 1;
    if (prev && cur) {
      const v = speed(cur, prev),
        span = clamp(c.span, 0, 1);
      if (v >= c.fast) pace = span;
      else if (v > c.calm)
        pace = clamp(
          (span - 1) * clamp((v - c.calm) / Math.max(1e-4, c.fast - c.calm), 0, 1) + 1,
          span,
          1,
        );
    }
    let width = (clamp((max - min) * pace + min, min, max) - min) * force + min;
    if (st.last > 0 && prev && cur) {
      const ref = Math.max(st.last, min);
      const step =
        clamp(10 / (Math.max(0.01, base) * 0.38 + 10), 0.14, 1) *
        (clamp(dist(cur, prev) / (2.2 * ref + 0.001), 0, 1) * 0.48 + 0.02) *
        ref;
      if (width - st.last > 1.1 * step) width = st.last + 1.1 * step;
      else if (width - st.last < -step) width = st.last - step;
    }
    return (st.last = clamp(width, min, max));
  };
}
// VectorPenDrawer (fountain): its own pressure and velocity width ramp.
interface FountainState {
  B: number;
  A: number;
  H: number;
  I: number;
  K: number;
  J: boolean;
  prev: Point;
}
function fountain(first: Point, w: number, pressure: boolean): Track {
  const pressureMin = w / 8,
    speedMin = w / 12;
  const settle = (s: FountainState, next: number) => {
    if ((next - s.B > 0 && s.I < 0) || (next - s.B < 0 && s.I > 0)) next = s.B;
    return next;
  };
  const velocityWidth = (s: FountainState, v: number, travel: number) => {
    s.H++;
    if (s.B > 0.9 * w && travel < s.B) return s.B;
    const reach = w - speedMin,
      up = reach / 8;
    let down = up;
    if (s.H < 3) {
      v *= 0.2;
      down = reach / 32;
    } else if (s.H < 5) {
      v *= 0.6;
      down = reach / 16;
    }
    const next = settle(s, Math.min(w, s.B + up, Math.max(w / (v + 1), speedMin, s.B - down)));
    s.I = next - s.B;
    return (s.B = next);
  };
  const width = (s: FountainState, v: number, travel: number, p: number) => {
    if (!pressure || s.J) return velocityWidth(s, v, travel);
    s.H++;
    if (p === 1 && ++s.K > 3 && s.H > 4) s.J = true;
    let next = settle(s, Math.max(pressureMin, w * Math.min(p / clamp(v, 0.66, 1.33) + 0.1, 1)));
    if (s.H < 2) s.I = 0;
    else {
      const div = s.H < 4 ? 32 : s.H < 6 ? 16 : 12;
      next = Math.min(
        w,
        s.B + (w - pressureMin) / div,
        Math.max(next, speedMin, s.B - (w - speedMin) / div),
      );
      s.I = next - s.B;
    }
    return (s.B = next);
  };
  const state: FountainState = { B: w, A: 0, H: 0, I: 0, K: 0, J: false, prev: first };
  const out: Sample[] = [
    { x: first.x, y: first.y, t: first.t, w: pressure ? width(state, 1, 1, first.p) : w },
  ];
  return track(out, state, (s, cur, final) => {
    const last = out[out.length - 1],
      reach = last.w / 8;
    // Samples inside the nib's last eighth are ignored until the lift.
    if (!final && Math.abs(cur.x - last.x) < reach && Math.abs(cur.y - last.y) < reach) return null;
    s.B = last.w;
    const v = dist(cur, s.prev) / elapsed(cur, s.prev);
    s.A = 0.6 * s.A + 0.4 * v;
    const sample = { x: cur.x, y: cur.y, t: cur.t, w: width(s, s.A, dist(cur, s.prev), cur.p) };
    s.prev = cur;
    return sample;
  });
}
// SlantedFountainPenDrawer input: first width leans to the maximum; jitter is filtered.
function calligraphy(first: Point, w: number, pressure: boolean): Track {
  const resolve = resolver(INK, w, pressure),
    { min, max } = range(INK, w);
  const widths: ResolverState = { smoothed: 0, last: 0 };
  const initial = resolve(widths, null, first.p, null);
  const start = (widths.last = clamp((max - initial) * 0.6 + initial, min, max));
  const out: Sample[] = [{ x: first.x, y: first.y, t: first.t, w: start }];
  const reach = Math.max(start * 0.09, 0.4);
  return track(out, { ...widths, prev: first, held: 0 }, (s, cur, final) => {
    const last = out[out.length - 1];
    if (cur.x === last.x && cur.y === last.y) return null;
    if (!final && (cur.x - last.x) ** 2 + (cur.y - last.y) ** 2 < reach * reach && ++s.held < 6)
      return null;
    s.held = 0;
    // The lift keeps the previous width rather than resolving a zero-pressure sample.
    const w = final ? last.w : resolve(s, s.prev, cur.p, cur);
    s.prev = cur;
    return { x: cur.x, y: cur.y, t: cur.t, w };
  });
}
// TextureFountainPenDrawer input: a curvature-driven nib lag, then a constant graphite width.
function pencil(first: Point, w: number): Track {
  const out: Sample[] = [{ x: first.x, y: first.y, t: first.t, w }];
  return track(out, { Q: 0, R: 0, S: 1 }, (s, cur) => {
    const last = out[out.length - 1];
    if (cur.x === last.x && cur.y === last.y) return null;
    let x = cur.x,
      y = cur.y;
    if (out.length < 2) {
      s.Q *= 0.55;
      s.R *= 0.55;
    } else {
      const a = out[out.length - 2];
      const ux = last.x - a.x,
        uy = last.y - a.y,
        vx = cur.x - last.x,
        vy = cur.y - last.y;
      const lu = Math.hypot(ux, uy),
        lv = Math.hypot(vx, vy);
      if (lu > 0.001 && lv > 0.001) {
        const dx = vx / lv,
          dy = vy / lv;
        const dot = clamp((ux / lu) * dx + (uy / lu) * dy, -1, 1);
        if (dot < 0.1) {
          s.Q *= 0.62;
          s.R *= 0.62;
        } else {
          const cross = (ux / lu) * dy - (uy / lu) * dx,
            turn = Math.abs(cross);
          const bend = clamp((1 - dot) * 0.5, 0, 1),
            haste = clamp((speed(cur, last) - 0.55) / 2.2, 0, 1);
          const lag =
            turn < 0.07 || haste <= 0
              ? 0
              : clamp(
                  clamp(lv / Math.max(0.01, w * 1.4), 0.25, 1) *
                    (0.65 * bend + 0.35) *
                    0.23 *
                    w *
                    haste *
                    turn,
                  0,
                  w * 0.42,
                );
          if (lag <= 0.001) {
            const decay = turn < 0.07 ? 0.74 : haste <= 0 ? 0.78 : 0.8;
            s.Q *= decay;
            s.R *= decay;
          } else {
            if (turn >= 0.12) s.S = cross >= 0 ? 1 : -1;
            const side = s.S >= 0 ? -1 : 1,
              blend = clamp(bend * 0.16 + haste * 0.26 + 0.14, 0.14, 0.46);
            s.Q = -dy * side * lag * blend + s.Q * (1 - blend);
            s.R = dx * side * lag * blend + s.R * (1 - blend);
            const size = Math.hypot(s.Q, s.R);
            if (size > w * 0.4) {
              s.Q *= (w * 0.4) / size;
              s.R *= (w * 0.4) / size;
            }
          }
          x += s.Q;
          y += s.R;
        }
      }
    }
    return { x, y, t: cur.t, w };
  });
}
function constant(first: Point, w: number): Track {
  const out: Sample[] = [{ x: first.x, y: first.y, t: first.t, w }];
  return track(out, {}, (_, cur) => ({ x: cur.x, y: cur.y, t: cur.t, w }));
}

// ---------------------------------------------------------------- geometry
const n = (v: number) => Math.round(v * UNIT * 100) / 100;
// Path output in Slate page units: SVG path data, or calls straight into a canvas path.
class Sink {
  d = "";
  constructor(readonly path?: CanvasPath) {}
  M(x: number, y: number) {
    if (this.path) this.path.moveTo(x * UNIT, y * UNIT);
    else this.d += `M${n(x)},${n(y)}`;
  }
  L(x: number, y: number) {
    if (this.path) this.path.lineTo(x * UNIT, y * UNIT);
    else this.d += `L${n(x)},${n(y)}`;
  }
  Q(cx: number, cy: number, x: number, y: number) {
    if (this.path) this.path.quadraticCurveTo(cx * UNIT, cy * UNIT, x * UNIT, y * UNIT);
    else this.d += `Q${n(cx)},${n(cy)} ${n(x)},${n(y)}`;
  }
  Z() {
    if (this.path) this.path.closePath();
    else this.d += "Z";
  }
  // Counter-clockwise like the ribbons, so nonzero filling never cancels an overlap.
  O(x: number, y: number, r: number) {
    if (this.path) {
      this.path.moveTo((x + r) * UNIT, y * UNIT);
      this.path.arc(x * UNIT, y * UNIT, r * UNIT, 0, Math.PI * 2, true);
      this.path.closePath();
    } else
      this.d += `M${n(x + r)},${n(y)}a${n(r)},${n(r)} 0 1,0 ${n(-r * 2)},0a${n(r)},${n(r)} 0 1,0 ${n(r * 2)},0Z`;
  }
}
// SlantedMidpointSpline: a line to the first midpoint, quads through samples, a straight tail.
interface Segment {
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  bx: number;
  by: number;
  wa: number;
  wc: number;
  wb: number;
}
// Segment i of the spline through samples `s`: segment 0 leads in from the first sample, the
// last segment is the straight tail to the newest sample, and those between pass through each
// sample from midpoint to midpoint. Segments before `s.length - 2` never involve the newest sample.
function segment(s: Sample[], i: number): Segment {
  const mid = (j: number) => ({
    x: (s[j].x + s[j + 1].x) / 2,
    y: (s[j].y + s[j + 1].y) / 2,
    w: (s[j].w + s[j + 1].w) / 2,
  });
  if (i === 0) {
    const m = mid(0);
    return {
      ax: s[0].x,
      ay: s[0].y,
      cx: (s[0].x + m.x) / 2,
      cy: (s[0].y + m.y) / 2,
      bx: m.x,
      by: m.y,
      wa: s[0].w,
      wc: (s[0].w + m.w) / 2,
      wb: m.w,
    };
  }
  const m = mid(i - 1);
  if (i < s.length - 1) {
    const next = mid(i);
    return {
      ax: m.x,
      ay: m.y,
      cx: s[i].x,
      cy: s[i].y,
      bx: next.x,
      by: next.y,
      wa: m.w,
      wc: s[i].w,
      wb: next.w,
    };
  }
  // The tail always reaches the newest sample, including a two-sample stroke.
  const end = s[i];
  return {
    ax: m.x,
    ay: m.y,
    cx: (m.x + end.x) / 2,
    cy: (m.y + end.y) / 2,
    bx: end.x,
    by: end.y,
    wa: m.w,
    wc: (m.w + end.w) / 2,
    wb: end.w,
  };
}
function at(g: Segment, t: number) {
  const u = 1 - t;
  // SlantedMidpointSpline.f keeps interpolated widths near their anchors.
  const w = clamp(
    u * u * g.wa + 2 * u * t * g.wc + t * t * g.wb,
    Math.max(0.1, Math.min(g.wa, g.wc, g.wb) * 0.6),
    Math.max(g.wa, g.wc, g.wb) * 1.4,
  );
  return {
    x: u * u * g.ax + 2 * u * t * g.cx + t * t * g.bx,
    y: u * u * g.ay + 2 * u * t * g.cy + t * t * g.by,
    w,
  };
}
// LinearPenDrawer: one continuous quadratic centerline, stroked at a constant width.
function centerline(s: Sample[], segments: Segment[], from: number, to: number, sink: Sink) {
  if (!segments.length) {
    // A zero-length subpath has empty bounds; browsers can skip repainting it.
    sink.M(s[0].x, s[0].y);
    sink.L(s[0].x + 0.05, s[0].y);
    return;
  }
  if (from < to) sink.M(segments[from].ax, segments[from].ay);
  for (let i = from; i < to; i++) {
    const g = segments[i];
    sink.Q(g.cx, g.cy, g.bx, g.by);
  }
}
// VectorPenDrawer.f0: each segment is a ribbon whose edges are the spline's offset quadratics,
// closed by the nib's round oval at the segment end (and at the first segment's start).
function ribbon(s: Sample[], segments: Segment[], from: number, to: number, sink: Sink) {
  if (!segments.length) return sink.O(s[0].x, s[0].y, s[0].w / 2);
  for (let i = from; i < to; i++) {
    const g = segments[i],
      ra = g.wa / 2,
      rb = g.wb / 2,
      rc = g.wc / 2;
    if (i === 0) sink.O(g.ax, g.ay, ra);
    let tax = g.cx - g.ax,
      tay = g.cy - g.ay,
      tbx = g.bx - g.cx,
      tby = g.by - g.cy;
    if (Math.hypot(tax, tay) < 1e-6) [tax, tay] = [g.bx - g.ax, g.by - g.ay];
    if (Math.hypot(tbx, tby) < 1e-6) [tbx, tby] = [g.bx - g.ax, g.by - g.ay];
    const la = Math.hypot(tax, tay),
      lb = Math.hypot(tbx, tby);
    if (la < 1e-6 || lb < 1e-6) {
      sink.O(g.bx, g.by, rb);
      continue;
    }
    const nax = -tay / la,
      nay = tax / la,
      nbx = -tby / lb,
      nby = tbx / lb;
    const den = tax * tby - tay * tbx,
      chord = Math.hypot(g.bx - g.ax, g.by - g.ay) || 1;
    const edge = (side: number) => {
      const px = g.ax + nax * ra * side,
        py = g.ay + nay * ra * side,
        qx = g.bx + nbx * rb * side,
        qy = g.by + nby * rb * side;
      // The offset control sits where the offset tangents meet; near-straight or sharply
      // turning segments fall back to the chord normal.
      let cx = g.cx - ((g.by - g.ay) / chord) * rc * side,
        cy = g.cy + ((g.bx - g.ax) / chord) * rc * side;
      if (Math.abs(den) > 1e-4 * la * lb) {
        const u = ((qx - px) * tby - (qy - py) * tbx) / den,
          ix = px + tax * u,
          iy = py + tay * u;
        if (Math.hypot(ix - g.cx, iy - g.cy) <= 2 * Math.max(ra, rb, rc)) [cx, cy] = [ix, iy];
      }
      return [px, py, cx, cy, qx, qy];
    };
    const [lpx, lpy, lcx, lcy, lqx, lqy] = edge(1),
      [rpx, rpy, rcx, rcy, rqx, rqy] = edge(-1);
    sink.M(lpx, lpy);
    sink.Q(lcx, lcy, lqx, lqy);
    sink.L(rqx, rqy);
    sink.Q(rcx, rcy, rpx, rpy);
    sink.Z();
    sink.O(g.bx, g.by, rb);
  }
}
// SlantedStampGeometry: a rectangular nib at 45 degrees, 0.28 thick, swept by convex hulls.
function nib(x: number, y: number, w: number) {
  const m = Math.max(0.01, w * 0.72),
    a = m * 0.9 * Math.SQRT1_2,
    t = m * 0.28 * Math.SQRT1_2;
  return [x - a + t, y + a + t, x + a + t, y - a + t, x + a - t, y - a - t, x - a - t, y + a - t];
}
function hull(p: number[]) {
  const pts: [number, number][] = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [],
    upper: [number, number][] = [];
  for (const q of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const q = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function polygon(p: [number, number][], sink: Sink) {
  sink.M(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) sink.L(p[i][0], p[i][1]);
  sink.Z();
}
function slanted(s: Sample[], segments: Segment[], from: number, to: number, sink: Sink) {
  if (!segments.length) return polygon(hull(nib(s[0].x, s[0].y, s[0].w)), sink);
  for (let index = from; index < to; index++) {
    const g = segments[index];
    const length = Math.hypot(g.cx - g.ax, g.cy - g.ay) + Math.hypot(g.bx - g.cx, g.by - g.cy);
    const steps = Math.max(1, Math.min(16, Math.ceil(length / Math.max(1.05, g.wc * 0.5))));
    let previous = nib(g.ax, g.ay, at(g, 0).w);
    for (let i = 1; i <= steps; i++) {
      const p = at(g, i / steps);
      // The final stamp narrows to 74%, giving Flexcil's lifted tail.
      const end = index === segments.length - 1 && i === steps;
      const stamp = nib(p.x, p.y, end ? p.w * 0.74 : p.w);
      polygon(hull(previous.concat(stamp)), sink);
      previous = stamp;
    }
  }
}

// ---------------------------------------------------------------- strokes
export interface BrushLayer {
  d: string;
  fill: boolean;
  width: number;
  cap: "round" | "square";
  grain?: "core" | "fringe";
}
export interface BrushGeometry {
  layers: BrushLayer[];
  opacity: number;
  blend: "normal" | "darken" | "lighten";
}
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
// A stroke's spline, drawable a segment range at a time like Flexcil's front-buffered drawers.
export interface BrushPlan {
  layers: Omit<BrushLayer, "d">[];
  opacity: number;
  blend: BrushGeometry["blend"];
  segments: number;
  // Leading segments that newer input can no longer change.
  stable: number;
  draw(from: number, to: number, path?: CanvasPath): string;
  bounds(from: number, to: number): PageRect;
}
const scaled = (p: Point): Point => ({ ...p, x: p.x / UNIT, y: p.y / UNIT });
function begin(stroke: Stroke): Track {
  const w = stroke.width / UNIT,
    first = scaled(stroke.points[0]),
    pressure = stroke.pressureSensitive !== false;
  if (stroke.brush === "fountain") return fountain(first, w, pressure);
  if (stroke.brush === "calligraphy") return calligraphy(first, w, pressure);
  if (stroke.brush === "pencil") return pencil(first, w);
  return constant(first, w);
}
interface Progress {
  track: Track;
  // Points committed to the track; the newest point is resolved separately.
  count: number;
  tail: Point;
  segments: Segment[];
}
const progress = new WeakMap<Stroke, Progress>();
// Live strokes only append points or replace the newest one, so each input event resolves its
// new points and segments instead of the whole stroke.
function resolve(stroke: Stroke) {
  const points = stroke.points;
  let p = progress.get(stroke);
  if (!p || p.count > points.length - 1 || points[p.count - 1] !== p.tail) {
    p = { track: begin(stroke), count: 1, tail: points[0], segments: [] };
    progress.set(stroke, p);
  }
  for (; p.count < points.length - 1; p.count++) p.track.push(scaled(points[p.count]));
  p.tail = points[p.count - 1];
  const settled = p.track.out;
  for (let i = p.segments.length; i < settled.length - 1; i++) p.segments.push(segment(settled, i));
  const newest = points.length > 1 ? p.track.last(scaled(points[points.length - 1])) : null;
  return { s: newest ? settled.concat(newest) : settled.slice(), settled: p.segments };
}
export function samples(stroke: Stroke): Sample[] {
  return resolve(stroke).s;
}
const plans = new WeakMap<Stroke, { count: number; last: Point; plan: BrushPlan }>();
export function brushPlan(stroke: Stroke): BrushPlan {
  const last = stroke.points[stroke.points.length - 1];
  const cached = plans.get(stroke);
  if (cached && cached.count === stroke.points.length && cached.last === last) return cached.plan;
  const brush = stroke.brush as Brush,
    width = stroke.width;
  const resolved = resolve(stroke);
  let s = resolved.s,
    segments: Segment[] = [];
  // A held nib that only changed pressure is a dot at its widest sample.
  if (s.every((p) => Math.abs(p.x - s[0].x) < 0.01 && Math.abs(p.y - s[0].y) < 0.01))
    s = [{ ...s[0], w: Math.max(...s.map((p) => p.w)) }];
  else {
    segments = resolved.settled.slice();
    for (let i = segments.length; i < s.length; i++) segments.push(segment(s, i));
  }
  const marker = brush === "highlighter" || brush === "marker";
  const shape = brush === "fountain" ? ribbon : brush === "calligraphy" ? slanted : centerline;
  const plan: BrushPlan = {
    layers:
      brush === "fountain" || brush === "calligraphy"
        ? [{ fill: true, width: 0, cap: "round" }]
        : brush === "pencil"
          ? // Overlapping rotated graphite stamps leave a dense core and a ragged fringe.
            [
              { fill: false, width: width * 1.3, cap: "round", grain: "fringe" },
              { fill: false, width: width * 0.85, cap: "round", grain: "core" },
            ]
          : [{ fill: false, width, cap: brush === "marker" ? "square" : "round" }],
    opacity: stroke.opacity ?? (marker ? HIGHLIGHTER_OPACITY : 1),
    // Translucent highlighters use DARKEN (LIGHTEN for white) so overlaps never stack.
    blend:
      marker && (stroke.opacity ?? HIGHLIGHTER_OPACITY) < 1
        ? stroke.color.toLowerCase() === "#ffffff"
          ? "lighten"
          : "darken"
        : "normal",
    segments: segments.length,
    // A sample is final once a newer one arrives, and a segment once its newest sample is.
    stable: Math.max(0, s.length - 2),
    draw(from, to, path) {
      const sink = new Sink(path);
      shape(s, segments, from, to, sink);
      return sink.d;
    },
    bounds(from, to) {
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity,
        w = 0;
      const add = (x: number, y: number, r: number) => {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        w = Math.max(w, r);
      };
      if (!segments.length) add(s[0].x, s[0].y, s[0].w);
      for (let i = from; i < to; i++) {
        const g = segments[i];
        add(g.ax, g.ay, g.wa);
        add(g.cx, g.cy, g.wc);
        add(g.bx, g.by, g.wb);
      }
      if (x0 > x1) return { x: 0, y: 0, width: 0, height: 0 };
      // Covers square caps, the slanted nib and the pencil fringe.
      const pad = Math.max(w, width / UNIT) * 1.4 * 0.75 + 0.5;
      return {
        x: (x0 - pad) * UNIT,
        y: (y0 - pad) * UNIT,
        width: (x1 - x0 + pad * 2) * UNIT,
        height: (y1 - y0 + pad * 2) * UNIT,
      };
    },
  };
  plans.set(stroke, { count: stroke.points.length, last, plan });
  return plan;
}
const cache = new WeakMap<BrushPlan, BrushGeometry>();
export function brushGeometry(stroke: Stroke): BrushGeometry {
  const plan = brushPlan(stroke);
  let geometry = cache.get(plan);
  if (geometry) return geometry;
  const d = plan.draw(0, plan.segments);
  geometry = {
    layers: plan.layers.map((layer) => ({ ...layer, d })),
    opacity: plan.opacity,
    blend: plan.blend,
  };
  cache.set(plan, geometry);
  return geometry;
}

// ---------------------------------------------------------------- pencil grain
// Flexcil's procedural graphite texture (TextureFountainPenDrawer.a), made seamless.
function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(seed, 198491317) + Math.imul(y, 668265263) + Math.imul(x, 374761393)) | 0;
  h = Math.imul(h ^ (h >> 13), 1274126177);
  return ((h ^ (h >> 16)) & 1023) / 1023;
}
function noise(seed: number, x: number, y: number, period: number) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const sx = (3 - 2 * fx) * fx * fx,
    sy = (3 - 2 * fy) * fy * fy;
  const wrap = (v: number) => ((v % period) + period) % period;
  const a = hash(wrap(x0), wrap(y0), seed),
    b = hash(wrap(x0 + 1), wrap(y0), seed);
  const c = hash(wrap(x0), wrap(y0 + 1), seed),
    d = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  const top = (b - a) * sx + a;
  return ((d - c) * sx + c - top) * sy + top;
}
export const GRAIN_TILE = 24;
const grainCache = new Map<string, HTMLCanvasElement>();
export function grainTile(color: string, layer: "core" | "fringe") {
  const key = color + layer;
  let tile = grainCache.get(key);
  if (tile) return tile;
  const size = 128;
  tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const ctx = tile.getContext("2d")!,
    image = ctx.createImageData(size, size);
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v =
        (noise(832, x * 0.75, y * 0.75, 96) * 0.3 + 0.7) *
        (noise(448, x * 0.125, y * 0.125, 16) * 0.32 + 0.68) *
        (noise(1216, x * 0.25, y * 0.25, 32) * 0.44 + 0.56) *
        (hash(x * 17, y * 19, 1856) > 0.88 ? 0.62 : 1) *
        (hash(x * 11, y * 13, 1984) > 0.94 ? 0.55 : 1);
      const alpha =
        // Stamps of up to 84% alpha overlap several times: a dense core, a speckled fringe.
        layer === "core"
          ? clamp(0.5 + v * 0.65, 0, 1) * 0.96
          : clamp((v - 0.32) * 1.5, 0, 1) * 0.55;
      const i = (y * size + x) * 4;
      image.data.set([rgb[0], rgb[1], rgb[2], Math.round(alpha * 255)], i);
    }
  ctx.putImageData(image, 0, 0);
  grainCache.set(key, tile);
  return tile;
}
let defs: SVGDefsElement | null = null;
export function grainPattern(color: string, layer: "core" | "fringe") {
  const id = `slate-grain-${color.slice(1).toLowerCase()}-${layer}`;
  if (!defs?.isConnected) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  if (!defs.querySelector("#" + id)) {
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.id = id;
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(GRAIN_TILE));
    pattern.setAttribute("height", String(GRAIN_TILE));
    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
    image.setAttribute("href", grainTile(color, layer).toDataURL());
    image.setAttribute("width", String(GRAIN_TILE));
    image.setAttribute("height", String(GRAIN_TILE));
    image.setAttribute("preserveAspectRatio", "none");
    pattern.appendChild(image);
    defs.appendChild(pattern);
  }
  return `url(#${id})`;
}

// ---------------------------------------------------------------- painting
export function grainPaint(ctx: CanvasRenderingContext2D, color: string, grain: "core" | "fringe") {
  const pattern = ctx.createPattern(grainTile(color, grain), "repeat");
  pattern?.setTransform(new DOMMatrix().scale(GRAIN_TILE / 128));
  return pattern ?? color;
}
// Fills or strokes one layer of a plan's geometry; `cap` overrides the layer's own caps.
export function paintLayer(
  ctx: CanvasRenderingContext2D,
  layer: BrushPlan["layers"][number],
  path: Path2D,
  paint: string | CanvasPattern,
  cap = layer.cap,
) {
  if (layer.fill) {
    ctx.fillStyle = paint;
    ctx.fill(path);
  } else {
    ctx.strokeStyle = paint;
    ctx.lineWidth = layer.width;
    ctx.lineCap = cap;
    ctx.lineJoin = "round";
    ctx.stroke(path);
  }
}
const canvasPaths = new WeakMap<BrushPlan, Path2D>();
export function drawBrush(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (!stroke.points.length) return;
  const plan = brushPlan(stroke);
  let path = canvasPaths.get(plan);
  if (!path) {
    // Build the canvas path directly; parsing SVG data would double the work.
    plan.draw(0, plan.segments, (path = new Path2D()));
    canvasPaths.set(plan, path);
  }
  ctx.save();
  ctx.globalAlpha = plan.opacity;
  if (plan.blend !== "normal") ctx.globalCompositeOperation = plan.blend;
  for (const layer of plan.layers)
    paintLayer(
      ctx,
      layer,
      path,
      layer.grain ? grainPaint(ctx, stroke.color, layer.grain) : stroke.color,
    );
  ctx.restore();
}
const SVG = "http://www.w3.org/2000/svg";
export function brushElement(stroke: Stroke, element?: SVGElement) {
  const geometry = brushGeometry(stroke);
  const group = (
    element?.tagName === "g" ? element : document.createElementNS(SVG, "g")
  ) as SVGGElement;
  group.setAttribute("opacity", String(geometry.opacity));
  group.style.mixBlendMode = geometry.blend === "normal" ? "" : geometry.blend;
  while (group.childNodes.length > geometry.layers.length) group.lastChild!.remove();
  geometry.layers.forEach((layer, i) => {
    const path =
      (group.childNodes[i] as SVGPathElement) ??
      group.appendChild(document.createElementNS(SVG, "path"));
    const paint = layer.grain ? grainPattern(stroke.color, layer.grain) : stroke.color;
    path.setAttribute("d", layer.d);
    if (layer.fill) {
      path.setAttribute("fill", paint);
      path.removeAttribute("stroke");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", paint);
      path.setAttribute("stroke-width", String(layer.width));
      path.setAttribute("stroke-linecap", layer.cap);
      path.setAttribute("stroke-linejoin", "round");
    }
  });
  return group;
}
