// Turns a photo of handwritten paper into notebook ink.
// 1. Paper brightness is estimated per cell, so shadows and uneven light do not read as ink, and
//    the largest bright region is taken as the sheet; the desk around it is ignored.
// 2. Ink is what is clearly darker than its local paper. Faint pixels join only when they touch
//    clear ink, which keeps light pencil strokes whole and drops printed rules and grain.
// 3. The ink is thinned to one-pixel centerlines, traced into strokes between ends and crossings,
//    and each stroke keeps the measured nib width and a pen color snapped from the photo.
import { newId, type Page, type Point, type Stroke } from "../core/model";

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export interface HandwritingOptions {
  // 0 keeps only bold ink, 1 also keeps faint pencil.
  sensitivity: number;
  // Off writes everything in black.
  colors: boolean;
}
export const DEFAULT_HANDWRITING: HandwritingOptions = { sensitivity: 0.5, colors: true };
// Photos are traced at this long side; finer detail is sensor noise at handwriting scale.
export const TRACE_SIDE = 1600;
const PAGE_WIDTH = 794;
export const INK_COLORS = {
  black: "#000000",
  blue: "#0069db",
  red: "#e02020",
  green: "#00a65a",
  purple: "#7a3fc4",
  orange: "#e5760b",
};

interface Background {
  cell: number;
  columns: number;
  rows: number;
  // Per cell: paper luminance and paper color, and the cell's own brightness.
  light: Float32Array;
  own: Float32Array;
  rgb: Float32Array;
}
const luminance = (d: Uint8ClampedArray, i: number) =>
  0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

function background({ data, width, height }: Raster): Background {
  const cell = Math.max(8, Math.round(Math.max(width, height) / 80)),
    columns = Math.ceil(width / cell),
    rows = Math.ceil(height / cell);
  const raw = new Float32Array(columns * rows),
    rawRgb = new Float32Array(columns * rows * 3);
  const values: number[] = [];
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < columns; cx++) {
      values.length = 0;
      for (let y = cy * cell; y < Math.min(height, (cy + 1) * cell); y += 2)
        for (let x = cx * cell; x < Math.min(width, (cx + 1) * cell); x += 2)
          values.push(luminance(data, y * width + x));
      values.sort((a, b) => a - b);
      // Ink rarely covers most of a cell: a high percentile is the paper under it.
      const paper = values[Math.floor(values.length * 0.85)];
      raw[cy * columns + cx] = paper;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let y = cy * cell; y < Math.min(height, (cy + 1) * cell); y += 2)
        for (let x = cx * cell; x < Math.min(width, (cx + 1) * cell); x += 2) {
          const i = y * width + x;
          if (luminance(data, i) < paper - 12) continue;
          r += data[i * 4];
          g += data[i * 4 + 1];
          b += data[i * 4 + 2];
          n++;
        }
      rawRgb.set([r / n, g / n, b / n], (cy * columns + cx) * 3);
    }
  // Cells filled by a heavy stroke borrow the brightest neighbour.
  const light = new Float32Array(raw.length),
    rgb = new Float32Array(rawRgb.length);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < columns; cx++) {
      let best = cy * columns + cx;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
          const j = y * columns + x;
          if (raw[j] > raw[best] + 24) best = j;
        }
      light[cy * columns + cx] = raw[best];
      rgb.set(rawRgb.subarray(best * 3, best * 3 + 3), (cy * columns + cx) * 3);
    }
  return { cell, columns, rows, light, rgb, own: raw };
}

// The sheet: the largest connected run of bright cells, shrunk by a cell so its edge is not ink.
function sheet(bg: Background) {
  // Borrowed brightness would pull the desk beside the sheet into it.
  const { columns, rows, own: light } = bg;
  const sorted = Array.from(light).sort((a, b) => a - b);
  const bright = sorted[Math.floor(sorted.length * 0.95)],
    floor = Math.max(bright * 0.62, 60);
  const label = new Int32Array(light.length).fill(-1);
  let best = -1,
    bestSize = 0;
  for (let start = 0; start < light.length; start++) {
    if (label[start] >= 0 || light[start] < floor) continue;
    const stack = [start];
    label[start] = start;
    let size = 0;
    while (stack.length) {
      const i = stack.pop()!,
        x = i % columns,
        y = (i - x) / columns;
      size++;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const j = ny * columns + nx;
        if (label[j] < 0 && light[j] >= floor) {
          label[j] = start;
          stack.push(j);
        }
      }
    }
    if (size > bestSize) [best, bestSize] = [start, size];
  }
  const inside = new Uint8Array(light.length);
  // A sheet that fills most of the frame keeps the frame; otherwise only the sheet is read.
  if (best < 0 || bestSize > light.length * 0.9) {
    inside.fill(1);
    return inside;
  }
  for (let i = 0; i < light.length; i++) {
    if (label[i] !== best) continue;
    const x = i % columns,
      y = (i - x) / columns;
    let edge = false;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ])
      if (nx >= 0 && ny >= 0 && nx < columns && ny < rows && label[ny * columns + nx] !== best)
        edge = true;
    inside[i] = edge ? 0 : 1;
  }
  return inside;
}

// Bilinear paper luminance at a pixel.
function paperAt(bg: Background, x: number, y: number) {
  const fx = Math.min(bg.columns - 1, Math.max(0, (x + 0.5) / bg.cell - 0.5)),
    fy = Math.min(bg.rows - 1, Math.max(0, (y + 0.5) / bg.cell - 0.5));
  const x0 = Math.floor(fx),
    y0 = Math.floor(fy),
    x1 = Math.min(bg.columns - 1, x0 + 1),
    y1 = Math.min(bg.rows - 1, y0 + 1),
    u = fx - x0,
    v = fy - y0;
  const at = (cx: number, cy: number) => bg.light[cy * bg.columns + cx];
  return (
    (at(x0, y0) * (1 - u) + at(x1, y0) * u) * (1 - v) + (at(x0, y1) * (1 - u) + at(x1, y1) * u) * v
  );
}

function inkMask(image: Raster, bg: Background, inside: Uint8Array, sensitivity: number) {
  const { width, height, data } = image;
  const strong = 0.42 - 0.24 * Math.max(0, Math.min(1, sensitivity)),
    weak = strong * 0.55;
  const darkness = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!inside[Math.floor(y / bg.cell) * bg.columns + Math.floor(x / bg.cell)]) continue;
      const paper = paperAt(bg, x, y);
      // Ink must also differ by a visible amount, so dim paper grain stays paper.
      const d = paper - luminance(data, i) < 18 ? 0 : 1 - luminance(data, i) / Math.max(1, paper);
      darkness[i] = d;
      if (d >= strong) {
        mask[i] = 1;
        stack.push(i);
      }
    }
  // Hysteresis: faint pixels that touch clear ink belong to the same stroke.
  while (stack.length) {
    const i = stack.pop()!,
      x = i % width,
      y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (!mask[j] && darkness[j] >= weak) {
          mask[j] = 1;
          stack.push(j);
        }
      }
  }
  // Fill pinholes so thinning does not leave rings inside thick strokes.
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) n += mask[i + dy * width + dx];
      if (n >= 6) mask[i] = 2;
    }
  for (let i = 0; i < mask.length; i++) if (mask[i]) mask[i] = 1;
  despeckle(mask, width, height);
  return mask;
}

// Drops specks and solid blobs (shadows, stickers) that are not pen strokes.
function despeckle(mask: Uint8Array, width: number, height: number) {
  // Small enough to keep a full stop written with a fine pen.
  const minimum = Math.max(4, Math.round((Math.max(width, height) / 1000) ** 2 * 4));
  const seen = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels = [start],
      stack = [start];
    seen[start] = 1;
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    while (stack.length) {
      const i = stack.pop()!,
        x = i % width,
        y = (i - x) / width;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            pixels.push(j);
            stack.push(j);
          }
        }
    }
    const box = (x1 - x0 + 1) * (y1 - y0 + 1);
    const blob = pixels.length > width * height * 0.01 && pixels.length > box * 0.45;
    if (pixels.length < minimum || blob) for (const i of pixels) mask[i] = 0;
  }
}

// Chamfer distance to paper, in pixels.
function distance(mask: Uint8Array, width: number, height: number) {
  const d = new Float32Array(mask.length);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e6 : 0;
  const pass = (x: number, y: number, dx: number, dy: number, cost: number) => {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return 0;
    return d[ny * width + nx] + cost;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(
        d[i],
        pass(x, y, -1, 0, 1),
        pass(x, y, 0, -1, 1),
        pass(x, y, -1, -1, 1.4),
        pass(x, y, 1, -1, 1.4),
      );
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(
        d[i],
        pass(x, y, 1, 0, 1),
        pass(x, y, 0, 1, 1),
        pass(x, y, 1, 1, 1.4),
        pass(x, y, -1, 1, 1.4),
      );
    }
  return d;
}

// Zhang-Suen thinning, visiting only ink pixels.
function thin(mask: Uint8Array, width: number, height: number) {
  const m = mask.slice();
  let live: number[] = [];
  for (let i = 0; i < m.length; i++) {
    const x = i % width,
      y = (i - x) / width;
    if (m[i] && x > 0 && y > 0 && x < width - 1 && y < height - 1) live.push(i);
    else m[i] = 0;
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const phase of [0, 1]) {
      const remove: number[] = [];
      for (const i of live) {
        if (!m[i]) continue;
        const p2 = m[i - width],
          p3 = m[i - width + 1],
          p4 = m[i + 1],
          p5 = m[i + width + 1],
          p6 = m[i + width],
          p7 = m[i + width - 1],
          p8 = m[i - 1],
          p9 = m[i - width - 1];
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let a = 0;
        for (let k = 0; k < 8; k++) if (!ring[k] && ring[k + 1]) a++;
        if (a !== 1) continue;
        if (phase === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        remove.push(i);
      }
      for (const i of remove) m[i] = 0;
      if (remove.length) changed = true;
    }
    live = live.filter((i) => m[i]);
  }
  return m;
}

// Skeleton neighbours; a diagonal step is redundant when an orthogonal pixel already joins them.
function neighbours(m: Uint8Array, width: number, i: number) {
  const n = m[i - width],
    s = m[i + width],
    w = m[i - 1],
    e = m[i + 1];
  const out: number[] = [];
  if (n) out.push(i - width);
  if (s) out.push(i + width);
  if (w) out.push(i - 1);
  if (e) out.push(i + 1);
  if (m[i - width - 1] && !n && !w) out.push(i - width - 1);
  if (m[i - width + 1] && !n && !e) out.push(i - width + 1);
  if (m[i + width - 1] && !s && !w) out.push(i + width - 1);
  if (m[i + width + 1] && !s && !e) out.push(i + width + 1);
  return out;
}

// Walks the skeleton into pixel paths between ends and crossings, then closed loops.
function trace(m: Uint8Array, width: number) {
  const degree = new Uint8Array(m.length),
    pixels: number[] = [];
  for (let i = 0; i < m.length; i++)
    if (m[i]) {
      degree[i] = neighbours(m, width, i).length;
      pixels.push(i);
    }
  const node = (i: number) => degree[i] !== 2;
  const used = new Uint8Array(m.length);
  const paths: number[][] = [];
  const walk = (start: number, first: number) => {
    const path = [start, first];
    let previous = start,
      current = first;
    while (!node(current)) {
      used[current] = 1;
      const next = neighbours(m, width, current).find((j) => j !== previous);
      if (next === undefined || (used[next] && !node(next))) break;
      path.push(next);
      previous = current;
      current = next;
      if (current === start) break;
    }
    return path;
  };
  for (const i of pixels) {
    if (!node(i)) continue;
    if (degree[i] === 0) {
      paths.push([i]);
      continue;
    }
    for (const j of neighbours(m, width, i)) {
      if (used[j]) continue;
      // Adjacent crossing pixels form one crossing; they need no path between them.
      if (node(j)) {
        if (degree[i] < 3 || degree[j] < 3) {
          if (i < j) paths.push([i, j]);
        }
        continue;
      }
      paths.push(walk(i, j));
    }
  }
  for (const i of pixels) {
    if (used[i] || node(i)) continue;
    used[i] = 1;
    const loop = walk(i, neighbours(m, width, i)[0]);
    if (loop[loop.length - 1] !== i) loop.push(i);
    paths.push(loop);
  }
  return { paths, degree };
}

function simplify(points: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const a = points[0],
    b = points[points.length - 1];
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  let worst = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = length
      ? Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length
      : Math.hypot(p.x - a.x, p.y - a.y);
    if (d > worst) [worst, index] = [d, i];
  }
  if (worst <= epsilon) return [a, b];
  return simplify(points.slice(0, index + 1), epsilon)
    .slice(0, -1)
    .concat(simplify(points.slice(index), epsilon));
}

// White-balanced ink color snapped to a pen color.
export function penColor(r: number, g: number, b: number) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const saturation = max ? (max - min) / max : 0;
  if (saturation < 0.3 || max < 40) return INK_COLORS.black;
  let hue =
    max === r
      ? ((g - b) / (max - min)) * 60
      : max === g
        ? (2 + (b - r) / (max - min)) * 60
        : (4 + (r - g) / (max - min)) * 60;
  if (hue < 0) hue += 360;
  if (hue < 18 || hue >= 330) return INK_COLORS.red;
  if (hue < 60) return INK_COLORS.orange;
  if (hue < 165) return INK_COLORS.green;
  if (hue < 255) return INK_COLORS.blue;
  return INK_COLORS.purple;
}

export interface HandwritingPage {
  page: Page;
  // Pixels traced, for reporting.
  inkPixels: number;
}
export function extractHandwriting(
  image: Raster,
  options: HandwritingOptions = DEFAULT_HANDWRITING,
): HandwritingPage {
  const { width, height, data } = image;
  const bg = background(image);
  const inside = sheet(bg);
  const mask = inkMask(image, bg, inside, options.sensitivity);
  const dist = distance(mask, width, height);
  const skeleton = thin(mask, width, height);
  const { paths } = trace(skeleton, width);
  // The page spans the sheet's ink area at Slate's page width.
  let x0 = width,
    y0 = height,
    x1 = 0,
    y1 = 0;
  for (let i = 0; i < inside.length; i++)
    if (inside[i]) {
      const cx = i % bg.columns,
        cy = (i - cx) / bg.columns;
      x0 = Math.min(x0, cx * bg.cell);
      y0 = Math.min(y0, cy * bg.cell);
      x1 = Math.max(x1, Math.min(width, (cx + 1) * bg.cell));
      y1 = Math.max(y1, Math.min(height, (cy + 1) * bg.cell));
    }
  if (x1 <= x0 || y1 <= y0) [x0, y0, x1, y1] = [0, 0, width, height];
  const scale = PAGE_WIDTH / (x1 - x0);
  const page: Page = {
    id: newId(),
    paper: { style: "blank", color: "#ffffff", lineColor: "#d3d3d4", spacing: 26 },
    width: PAGE_WIDTH,
    height: Math.round(Math.min(4, Math.max(0.5, (y1 - y0) / (x1 - x0))) * PAGE_WIDTH),
    strokes: [],
  };
  let inkPixels = 0;
  for (let i = 0; i < mask.length; i++) inkPixels += mask[i];
  const halfWidth = (i: number) => Math.max(0.5, dist[i] - 0.5);
  for (const path of paths) {
    const widths = path.map(halfWidth).sort((a, b) => a - b);
    const half = widths[Math.floor(widths.length / 2)];
    const length = path.length;
    // A short spur off a crossing is a thinning artefact of a thick stroke, not a stroke.
    if (length > 1 && length < Math.max(3, half * 2.2)) {
      const ends = [path[0], path[path.length - 1]].filter((i) => skeleton[i]);
      const free = ends.some((i) => neighbours(skeleton, width, i).length === 1);
      const joined = ends.some((i) => neighbours(skeleton, width, i).length > 2);
      if (free && joined) continue;
    }
    let r = 0,
      g = 0,
      b = 0;
    for (const i of path) {
      const cx = Math.min(bg.columns - 1, Math.floor((i % width) / bg.cell)),
        cy = Math.min(bg.rows - 1, Math.floor(Math.floor(i / width) / bg.cell));
      const c = (cy * bg.columns + cx) * 3;
      // Ink color relative to its paper, so a warm lamp does not tint black ink.
      r += Math.min(255, (data[i * 4] / Math.max(1, bg.rgb[c])) * 255);
      g += Math.min(255, (data[i * 4 + 1] / Math.max(1, bg.rgb[c + 1])) * 255);
      b += Math.min(255, (data[i * 4 + 2] / Math.max(1, bg.rgb[c + 2])) * 255);
    }
    const color = options.colors
      ? penColor(r / path.length, g / path.length, b / path.length)
      : INK_COLORS.black;
    const pixels = path.map((i) => ({ x: (i % width) + 0.5, y: Math.floor(i / width) + 0.5 }));
    // Average out the skeleton's pixel staircase, keeping both ends.
    const smooth = pixels.map((p, k) =>
      k === 0 || k === pixels.length - 1
        ? p
        : {
            x: (pixels[k - 1].x + p.x * 2 + pixels[k + 1].x) / 4,
            y: (pixels[k - 1].y + p.y * 2 + pixels[k + 1].y) / 4,
          },
    );
    const line = simplify(smooth, 0.45);
    let t = 0;
    const points: Point[] = line.map((p, k) => {
      if (k) t += Math.hypot(p.x - line[k - 1].x, p.y - line[k - 1].y) * scale * 2;
      return { x: (p.x - x0) * scale, y: (p.y - y0) * scale, p: 0.5, t: Math.round(t) };
    });
    page.strokes.push({
      id: newId(),
      tool: "pen",
      color,
      width: Math.min(14, Math.max(0.6, half * 2 * scale)),
      points,
      brush: "ballpoint",
      pressureSensitive: false,
    } satisfies Stroke);
  }
  return { page, inkPixels };
}

// Fits a decoded image within the trace size.
export function traceSize(width: number, height: number) {
  const k = Math.min(1, TRACE_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
