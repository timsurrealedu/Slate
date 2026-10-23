// Turns a photo of handwritten paper into notebook ink.
// Separate repeated paper ruling from ink, trace editable centerlines, and register them
// to a native notebook template. All image analysis also runs in the offline worker.
import {
  newId,
  newPage,
  type Page,
  type PaperStyle,
  type Point,
  type Stroke,
  type PhotoImportPreferences,
} from "../core/model";
import { analyzePaper, removeRuling, ruledCoordinate, type PaperAnalysis } from "./paperAnalysis";

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export type HandwritingOptions = PhotoImportPreferences;
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
  if (best < 0) {
    inside.fill(1);
    return inside;
  }
  // Dark cells enclosed by paper can be broad writing. Only the region connected to
  // the frame is outside the sheet; punch holes are handled separately at pixel scale.
  const outside = new Uint8Array(light.length),
    stack: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x;
      if ((x === 0 || y === 0 || x === columns - 1 || y === rows - 1) && label[i] !== best) {
        outside[i] = 1;
        stack.push(i);
      }
    }
  while (stack.length) {
    const i = stack.pop()!,
      x = i % columns,
      y = Math.floor(i / columns);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const j = ny * columns + nx;
      if (!outside[j] && label[j] !== best) {
        outside[j] = 1;
        stack.push(j);
      }
    }
  }
  for (let i = 0; i < label.length; i++) if (!outside[i]) label[i] = best;
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

// Sampling the paper color continuously avoids color changes at analysis-cell boundaries.
function paperColorAt(bg: Background, x: number, y: number, channel: number) {
  const fx = Math.min(bg.columns - 1, Math.max(0, (x + 0.5) / bg.cell - 0.5));
  const fy = Math.min(bg.rows - 1, Math.max(0, (y + 0.5) / bg.cell - 0.5));
  const x0 = Math.floor(fx),
    y0 = Math.floor(fy);
  const x1 = Math.min(bg.columns - 1, x0 + 1),
    y1 = Math.min(bg.rows - 1, y0 + 1);
  const u = fx - x0,
    v = fy - y0;
  const at = (cx: number, cy: number) => bg.rgb[(cy * bg.columns + cx) * 3 + channel];
  return (
    (at(x0, y0) * (1 - u) + at(x1, y0) * u) * (1 - v) + (at(x0, y1) * (1 - u) + at(x1, y1) * u) * v
  );
}

// Subpixel sampling keeps small counters and diagonal connections when a phone image
// contains only one or two pixels across a pen stroke. The source raster stays untouched.
function refineRaster(image: Raster, mask: Uint8Array): Raster {
  let ink = 0,
    edge = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      ink++;
      if (!mask[i - 1] || !mask[i + 1] || !mask[i - image.width] || !mask[i + image.width]) edge++;
    }
  // Broad, already well sampled ink does not benefit from a larger working raster.
  if (!ink || edge / ink < 0.8) return image;
  const factor = Math.min(2, TRACE_SIDE / Math.max(image.width, image.height));
  if (factor < 1.2) return image;
  const width = Math.round(image.width * factor),
    height = Math.round(image.height * factor);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, ((y + 0.5) * image.height) / height - 0.5);
    const y0 = Math.floor(sy),
      y1 = Math.min(image.height - 1, y0 + 1),
      v = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, ((x + 0.5) * image.width) / width - 0.5);
      const x0 = Math.floor(sx),
        x1 = Math.min(image.width - 1, x0 + 1),
        u = sx - x0;
      for (let c = 0; c < 3; c++) {
        const at = (px: number, py: number) => image.data[(py * image.width + px) * 4 + c];
        data[(y * width + x) * 4 + c] =
          (at(x0, y0) * (1 - u) + at(x1, y0) * u) * (1 - v) +
          (at(x0, y1) * (1 - u) + at(x1, y1) * u) * v;
      }
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { data, width, height };
}

// Punch holes must be found before the coarse sheet crop can leave pieces of their rims.
function defects(image: Raster, bg: Background) {
  const { data, width, height } = image,
    seen = new Uint8Array(width * height),
    excluded = new Uint8Array(width * height);
  const floor = Math.max(...bg.light) * 0.46;
  const guard = Math.max(4, Math.round(Math.max(width, height) / 140));
  const paperFloor = (floor / 0.46) * 0.6;
  const left = new Int32Array(height).fill(width),
    right = new Int32Array(height);
  const holes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  // A page has broad paper runs; isolated bright tape, tears and desk reflections do not.
  for (let y = 0; y < height; y++) {
    let start = 0,
      last = -1,
      best = 0;
    for (let x = 0; x < width; x++) {
      if (luminance(data, y * width + x) < paperFloor) continue;
      if (x - last > Math.max(12, width * 0.25)) start = x;
      last = x;
      if (x - start > best) {
        best = x - start;
        left[y] = start;
        right[y] = x;
      }
    }
    if (best < width * 0.3) {
      left[y] = width;
      right[y] = 0;
    }
  }
  for (let y = 0; y < height; y++) {
    const ls: number[] = [],
      rs: number[] = [];
    // A broad underline must not become an apparent page edge and crop the writing.
    const radius = Math.max(12, bg.cell * 3);
    for (let v = Math.max(0, y - radius); v <= Math.min(height - 1, y + radius); v++) {
      ls.push(left[v]);
      rs.push(right[v]);
    }
    ls.sort((a, b) => a - b);
    rs.sort((a, b) => a - b);
    const l = ls[Math.floor(ls.length * 0.15)],
      r = rs[Math.floor(rs.length * 0.85)];
    for (let x = 0; x < width; x++) if (x < l + 1 || x > r - 1) excluded[y * width + x] = 1;
  }
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || luminance(data, i) >= floor) continue;
    const pixels = [i];
    seen[i] = 1;
    let x0 = width,
      x1 = 0,
      y0 = height,
      y1 = 0;
    for (let k = 0; k < pixels.length; k++) {
      const p = pixels[k],
        x = p % width,
        y = Math.floor(p / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (!seen[j] && luminance(data, j) < floor) {
          seen[j] = 1;
          pixels.push(j);
        }
      }
    }
    const box = (x1 - x0 + 1) * (y1 - y0 + 1),
      minor = Math.min(x1 - x0, y1 - y0),
      major = Math.max(x1 - x0, y1 - y0);
    const middle = Math.floor((y0 + y1) / 2);
    const edge =
      x0 < left[middle] + bg.cell * 2 ||
      x1 > right[middle] - bg.cell * 2 ||
      y0 < bg.cell * 2 ||
      y1 > height - bg.cell * 2;
    const hole =
      edge && pixels.length > 60 && pixels.length > box * 0.6 && minor >= 7 && major < minor * 1.8;
    if (hole && minor > Math.min(width, height) * 0.018) holes.push({ x0, x1, y0, y1 });
    const surround =
      pixels.length > width * height * 0.04 &&
      (x0 === 0 || x1 === width - 1 || y0 === 0 || y1 === height - 1);
    if (hole || surround)
      for (const p of pixels) {
        const x = p % width,
          y = Math.floor(p / width);
        for (let dy = -guard; dy <= guard; dy++)
          for (let dx = -guard; dx <= guard; dx++)
            if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height)
              excluded[(y + dy) * width + x + dx] = 1;
      }
  }
  // Repeated punches identify a binding margin, including its pale rims and torn
  // material that is brighter than the dark hole centers. Keep the crop narrow.
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const horizontal = side === "left" || side === "right",
      extent = horizontal ? width : height;
    const start = side === "left" || side === "top";
    const at = (r: (typeof holes)[number]) =>
      horizontal ? (start ? r.x1 : r.x0) : start ? r.y1 : r.y0;
    const candidates = holes.filter((r) => (start ? at(r) < extent * 0.12 : at(r) > extent * 0.88));
    if (candidates.length < 2) continue;
    const positions = candidates.map(at).sort((a, b) => a - b);
    const middle = positions[Math.floor(positions.length / 2)];
    if (positions.filter((v) => Math.abs(v - middle) < bg.cell * 2).length < 2) continue;
    const along = candidates.map((r) => (horizontal ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2));
    const diameter = Math.max(...candidates.map((r) => (horizontal ? r.x1 - r.x0 : r.y1 - r.y0)));
    if (Math.max(...along) - Math.min(...along) < diameter * 1.5) continue;
    const boundary = middle + (start ? guard : -guard);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = horizontal ? x : y;
        if (start ? p < boundary : p > boundary) excluded[y * width + x] = 1;
      }
  }
  return excluded;
}

function inkMask(
  image: Raster,
  bg: Background,
  inside: Uint8Array,
  sensitivity: number,
  detected?: PaperAnalysis,
) {
  const { width, height, data } = image;
  const strong = 0.38 - 0.26 * Math.max(0, Math.min(1, sensitivity)),
    weak = strong * 0.55;
  const darkness = new Float32Array(width * height);
  const chroma = new Float32Array(width * height);
  const red = new Float32Array(width * height);
  let redPixels = 0;
  const excluded = defects(image, bg);
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (excluded[i] || !inside[Math.floor(y / bg.cell) * bg.columns + Math.floor(x / bg.cell)])
        continue;
      const paper = paperAt(bg, x, y);
      // Ink must also differ by a visible amount, so dim paper grain stays paper.
      const d = paper - luminance(data, i) < 5 ? 0 : 1 - luminance(data, i) / Math.max(1, paper);
      darkness[i] = d;
      const rgb = [0, 1, 2].map((k) => data[i * 4 + k] / Math.max(1, paperColorAt(bg, x, y, k)));
      chroma[i] = Math.max(...rgb) - Math.min(...rgb);
      if (rgb[0] > Math.max(rgb[1], rgb[2]) + 0.15) {
        red[i] = rgb[0] - Math.max(rgb[1], rgb[2]);
        redPixels++;
      }
      if (d >= weak) mask[i] = 1;
    }
  const analysis =
    detected ||
    analyzePaper(
      darkness,
      width,
      height,
      redPixels > Math.min(width, height) * 0.6 ? red : undefined,
    );
  removeRuling(mask, darkness, chroma, width, height, analysis, red);
  const density = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) darkness[i] = 0;
  // Estimate the ink boundary at a fraction of its nearby core, rather than growing
  // every dark halo to the same low threshold. This retains light pen strokes too.
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      density[i] =
        (darkness[i] * 4 +
          darkness[i - 1] +
          darkness[i + 1] +
          darkness[i - width] +
          darkness[i + width]) /
        8;
    }
  const candidates = new Uint8Array(mask.length);
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let peak = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) peak = Math.max(peak, density[i + dy * width + dx]);
      if (density[i] >= Math.max(weak, peak * 0.44)) candidates[i] = 1;
    }
  for (let i = 0; i < mask.length; i++) {
    mask[i] =
      candidates[i] &&
      (density[i] >= strong || (chroma[i] > 0.04 && density[i] >= Math.max(weak, 0.12)))
        ? 1
        : 0;
    if (mask[i]) stack.push(i);
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
        if (!mask[j] && candidates[j]) {
          mask[j] = 1;
          stack.push(j);
        }
      }
  }
  despeckle(mask, width, height);
  return { mask, analysis };
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
    const solid =
      (x0 < width * 0.06 || x1 > width * 0.94 || y0 < height * 0.06 || y1 > height * 0.94) &&
      pixels.length > box * 0.6 &&
      Math.min(x1 - x0, y1 - y0) > Math.max(6, Math.max(width, height) / 140);
    const blob = solid || (pixels.length > width * height * 0.01 && pixels.length > box * 0.45);
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

function components(mask: Uint8Array, dist: Float32Array, width: number, height: number) {
  const labels = new Int32Array(mask.length);
  const regions: { peak: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    const region = { peak: i, x0: width, x1: 0, y0: height, y1: 0 };
    regions.push(region);
    const label = regions.length,
      stack = [i];
    labels[i] = label;
    while (stack.length) {
      const p = stack.pop()!,
        x = p % width,
        y = Math.floor(p / width);
      region.x0 = Math.min(region.x0, x);
      region.x1 = Math.max(region.x1, x);
      region.y0 = Math.min(region.y0, y);
      region.y1 = Math.max(region.y1, y);
      if (dist[p] > dist[region.peak]) region.peak = p;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (mask[j] && !labels[j]) {
            labels[j] = label;
            stack.push(j);
          }
        }
    }
  }
  return { labels, regions };
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
      if (node(j)) {
        // Keep the actual connecting segment at a junction, including adjacent crossings.
        if (i < j) paths.push([i, j]);
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
  const keep = new Uint8Array(points.length),
    stack = [[0, points.length - 1]];
  keep[0] = keep[points.length - 1] = 1;
  while (stack.length) {
    const [start, end] = stack.pop()!,
      a = points[start],
      b = points[end];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    let worst = epsilon * epsilon,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i],
        t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
      // Distance to the segment also preserves a hairpin's tip beyond either end.
      const distance = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (distance > worst) {
        worst = distance;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
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
  detection: { style: PaperStyle; horizontalRules: number; verticalRules: number };
}
export function extractHandwriting(
  image: Raster,
  options: HandwritingOptions = DEFAULT_HANDWRITING,
): HandwritingPage {
  let { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > TRACE_SIDE ||
    height > TRACE_SIDE ||
    data.length !== width * height * 4
  )
    throw new Error("This photo could not be read at a supported size.");
  const source = image;
  const sourceBg = background(source),
    sourceInside = sheet(sourceBg);
  const sourceInk = inkMask(source, sourceBg, sourceInside, options.sensitivity);
  image = refineRaster(source, sourceInk.mask);
  ({ width, height, data } = image);
  const resolution = width / source.width;
  const rescaleRuling = (ruling: PaperAnalysis["horizontal"], factor: number) => ({
    spacing: ruling.spacing * factor,
    rules: ruling.rules.map((rule) => ({
      ...rule,
      position: rule.position * factor,
      samples: rule.samples.map((v) => v * factor),
    })),
  });
  const detected: PaperAnalysis = {
    ...sourceInk.analysis,
    horizontal: rescaleRuling(sourceInk.analysis.horizontal, height / source.height),
    vertical: rescaleRuling(sourceInk.analysis.vertical, resolution),
    dots: sourceInk.analysis.dots.map(
      (i) =>
        Math.round((Math.floor(i / source.width) * height) / source.height) * width +
        Math.round((i % source.width) * resolution),
    ),
    margins: sourceInk.analysis.margins && {
      horizontal: rescaleRuling(
        { rules: sourceInk.analysis.margins.horizontal, spacing: 0 },
        height / source.height,
      ).rules,
      vertical: rescaleRuling(
        { rules: sourceInk.analysis.margins.vertical, spacing: 0 },
        resolution,
      ).rules,
    },
  };
  const bg = image === source ? sourceBg : background(image);
  const inside = image === source ? sourceInside : sheet(bg);
  const { mask, analysis } =
    image === source ? sourceInk : inkMask(image, bg, inside, options.sensitivity, detected);
  const dist = distance(mask, width, height);
  const { labels, regions } = components(mask, dist, width, height);
  const skeleton = thin(mask, width, height);
  const represented = new Uint8Array(regions.length + 1);
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) represented[labels[i]] = 1;
  // Symmetric two-pixel-wide dots can disappear in parallel thinning. Preserve each
  // original ink component at its distance peak, retaining punctuation and subscripts.
  regions.forEach((r, k) => {
    if (!represented[k + 1]) skeleton[r.peak] = 1;
  });
  const { paths, degree } = trace(skeleton, width);
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
  const style = options.paper && options.paper !== "auto" ? options.paper : analysis.style;
  const page = newPage({
    style,
    color: "#ffffff",
    lineColor: "#d3d3d4",
    spacing: 26,
    template: "flexcil",
  });
  const unit = PAGE_WIDTH / 768;
  const targetStep =
    (style === "lined" || style === "legal" || style === "cornell" ? 26 : 26.4502) * unit;
  const rulingStep = analysis.horizontal.spacing || analysis.vertical.spacing;
  const rectify = (x: number, y: number) => ({
    x: analysis.vertical.rules.length ? ruledCoordinate(analysis.vertical, y, x, height) : x - x0,
    y: analysis.horizontal.rules.length
      ? ruledCoordinate(analysis.horizontal, x, y, width)
      : y - y0,
  });
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) {
        const p = rectify(x, y);
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
        top = Math.min(top, p.y);
        bottom = Math.max(bottom, p.y);
      }
  if (!Number.isFinite(left)) {
    left = top = 0;
    right = x1 - x0;
    bottom = y1 - y0;
  }
  const margin = 42 * unit;
  const fit = Math.min(
    (page.width - margin * 2) / Math.max(1, right - left),
    (page.height - margin * 2) / Math.max(1, bottom - top),
  );
  const scale = Math.min(rulingStep ? targetStep / rulingStep : PAGE_WIDTH / (x1 - x0), fit);
  // Dense source sheets still fit one native page; its adjustable ruling follows the fitted ink.
  const compressed =
    rulingStep &&
    scale < (targetStep / rulingStep) * 0.995 &&
    ["lined", "grid", "dot"].includes(style);
  if (compressed) {
    page.paper.template = undefined;
    page.paper.spacing = Math.max(8, rulingStep * scale);
  }
  const pitch = compressed ? page.paper.spacing : targetStep;
  let offsetX = (page.width - (right + left) * scale) / 2;
  let offsetY = (page.height - (bottom + top) * scale) / 2;
  if (analysis.horizontal.rules.length && style !== "blank") {
    const origin = compressed
      ? style === "lined"
        ? 74
        : pitch
      : style === "lined" || style === "legal" || style === "cornell"
        ? 63.5 * unit
        : 9.5 * unit;
    offsetY = origin + Math.ceil((margin - top * scale - origin) / pitch) * pitch;
  }
  if (
    analysis.vertical.rules.length &&
    (style === "grid" || style === "vertical" || style === "dot")
  ) {
    const origin = compressed ? pitch : 13.79 * unit;
    offsetX = origin + Math.round((offsetX - origin) / pitch) * pitch;
  }
  if (analysis.margins?.vertical.length && (style === "legal" || style === "cornell")) {
    const target = (style === "legal" ? 149.5 : 215.5) * unit;
    offsetX = Math.max(
      margin - left * scale,
      Math.min(
        page.width - margin - right * scale,
        target - (analysis.margins.vertical[0].position - x0) * scale,
      ),
    );
  }
  let inkPixels = 0;
  for (let i = 0; i < mask.length; i++) inkPixels += mask[i];
  inkPixels = Math.round(inkPixels / resolution / (height / source.height));
  const halfWidth = (i: number) => Math.max(0.5, dist[i] - 0.5);
  const appearances = paths.map((path) => {
    // Junctions and isolated dots do not give a reliable nib measurement.
    const widths = path
      .filter((i) => degree[i] === 2)
      .map(halfWidth)
      .sort((a, b) => a - b);
    const half = widths[Math.floor(widths.length * 0.5)] || halfWidth(path[0]);
    let r = 0,
      g = 0,
      b = 0,
      contrast = 0;
    for (const i of path) {
      const x = i % width,
        y = Math.floor(i / width);
      r += Math.min(1, data[i * 4] / Math.max(1, paperColorAt(bg, x, y, 0)));
      g += Math.min(1, data[i * 4 + 1] / Math.max(1, paperColorAt(bg, x, y, 1)));
      b += Math.min(1, data[i * 4 + 2] / Math.max(1, paperColorAt(bg, x, y, 2)));
      contrast += 1 - luminance(data, i) / Math.max(1, paperAt(bg, x, y));
    }
    r /= path.length;
    g /= path.length;
    b /= path.length;
    contrast /= path.length;
    const low = Math.min(r, g, b),
      spread = Math.max(r, g, b) - low;
    const pigment = spread / Math.max(0.2, contrast);
    const color =
      pigment > 0.075 && spread > 0.022
        ? penColor(
            40 + (180 * (r - low)) / spread,
            40 + (180 * (g - low)) / spread,
            40 + (180 * (b - low)) / spread,
          )
        : INK_COLORS.black;
    return {
      half,
      contrast,
      pigment,
      color,
      redGreen: r - g,
      neutral: contrast > 0.78 && pigment < 0.07,
      identified: color !== INK_COLORS.black && pigment > 0.1,
    };
  });
  const colorSupport = new Map<string, number>();
  appearances.forEach((a, k) => {
    if (a.color !== INK_COLORS.black)
      colorSupport.set(a.color, (colorSupport.get(a.color) || 0) + paths[k].length);
  });
  const palette = [...colorSupport].sort((a, b) => b[1] - a[1]);
  const coloredSupport = palette.reduce((sum, c) => sum + c[1], 0);
  const totalSupport = paths.reduce((sum, p) => sum + p.length, 0);
  const neutralSupport = appearances.reduce(
    (sum, a, k) => sum + (a.neutral ? paths[k].length : 0),
    0,
  );
  const neutralPen = neutralSupport > Math.max(20, totalSupport * 0.02);
  const primaryColor =
    palette[0] && palette[0][1] > coloredSupport * 0.75 && coloredSupport > totalSupport * 0.3
      ? palette[0][0]
      : undefined;
  // Low-chroma pieces of the same pen inherit its established color. Strong neutral or
  // distinctly colored writing remains independent; no per-fragment black/blue flicker.
  if (primaryColor)
    appearances.forEach((a) => {
      if (a.neutral) return;
      if (primaryColor === INK_COLORS.blue && a.color === INK_COLORS.purple && a.redGreen < 0.06)
        a.color = primaryColor;
      if (
        a.pigment > 0.03 &&
        a.pigment < 0.2 &&
        (colorSupport.get(a.color) || 0) < coloredSupport * 0.1
      )
        a.color = primaryColor;
      if (a.color === INK_COLORS.black && a.pigment > 0.03) a.color = primaryColor;
    });
  const regionInk = regions.map(() => ({
    colors: new Map<string, number>(),
    weight: 0,
    contrast: 0,
    half: 0,
    identified: 0,
    widths: [] as { half: number; weight: number }[],
    nib: 0.5,
    warm: 0,
  }));
  appearances.forEach((a, k) => {
    const group = regionInk[labels[paths[k][0]] - 1],
      weight = paths[k].length;
    group.weight += weight;
    group.contrast += a.contrast * weight;
    group.half = Math.max(group.half, a.half);
    if (a.identified) group.identified += weight;
    if (a.color === INK_COLORS.orange) group.warm += weight;
    if (weight >= 4) group.widths.push({ half: a.half, weight });
    if (a.color !== INK_COLORS.black)
      group.colors.set(a.color, (group.colors.get(a.color) || 0) + weight);
  });
  appearances.forEach((a, k) => {
    const group = regionInk[labels[paths[k][0]] - 1];
    const color = [...group.colors].sort((a, b) => b[1] - a[1])[0];
    if (color && color[1] > group.weight * 0.35 && a.color === INK_COLORS.black && !a.neutral)
      a.color = color[0];
  });
  const weightedMedian = (entries: { half: number; weight: number }[]) => {
    entries.sort((a, b) => a.half - b.half);
    const total = entries.reduce((sum, a) => sum + a.weight, 0);
    let sum = 0;
    for (const a of entries) {
      sum += a.weight;
      if (sum >= total / 2) return a.half;
    }
    return 0.5;
  };
  regionInk.forEach((group) => {
    group.nib = weightedMedian(group.widths);
  });
  // A whole letter/component establishes a nib class. Short swollen branches at
  // crossings cannot invent a second, thicker pen for an otherwise fine-pen page.
  const nibSamples = regionInk.flatMap((group) => {
    const color = [...group.colors].sort((a, b) => b[1] - a[1])[0]?.[0];
    const established =
      !primaryColor ||
      color === primaryColor ||
      (colorSupport.get(color || "") || 0) > coloredSupport * 0.05 ||
      (!color && neutralPen);
    return established &&
      group.widths.length &&
      group.weight >= Math.max(8, group.nib * (group.contrast / group.weight > 0.65 ? 2 : 6))
      ? [
          {
            half: group.nib,
            weight: group.weight,
            color: color || (neutralPen ? INK_COLORS.black : primaryColor),
          },
        ]
      : [];
  });
  const nibClasses = (samples: { half: number; weight: number }[]) => {
    const typical = weightedMedian(samples),
      nibs = [typical];
    const support = samples.reduce((sum, a) => sum + a.weight, 0);
    for (const broad of [false, true]) {
      const other = samples.filter((a) => (broad ? a.half > typical * 3 : a.half < typical / 3));
      if (other.reduce((sum, a) => sum + a.weight, 0) > Math.max(24, support * 0.02))
        nibs.push(weightedMedian(other));
    }
    return nibs;
  };
  const nibs = nibClasses(nibSamples),
    typicalHalf = nibs[0];
  const colorNibs = new Map<string, number[]>();
  for (const color of Object.values(INK_COLORS)) {
    const samples = nibSamples.filter((a) => a.color === color);
    if (samples.reduce((sum, a) => sum + a.weight, 0) > Math.max(24, totalSupport * 0.02))
      colorNibs.set(color, nibClasses(samples));
  }
  for (let k = 0; k < paths.length; k++) {
    const path = paths[k],
      appearance = appearances[k];
    const half = appearance.half;
    const length = path.length;
    const broad = half > typicalHalf * 2.5;
    const contrast = appearance.contrast;
    const region = regions[labels[path[0]] - 1],
      group = regionInk[labels[path[0]] - 1];
    const nearEdge =
      region.x0 < x0 + bg.cell * 6 ||
      region.x1 > x1 - bg.cell * 6 ||
      region.y0 < y0 + bg.cell * 3 ||
      region.y1 > y1 - bg.cell * 3;
    const regionColor = [...group.colors].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (
      primaryColor &&
      primaryColor !== INK_COLORS.orange &&
      nearEdge &&
      group.warm > group.weight * 0.2 &&
      group.contrast / group.weight < 0.4 &&
      group.half > typicalHalf * 1.5 &&
      (colorSupport.get(INK_COLORS.orange) || 0) < coloredSupport * 0.05
    )
      continue;
    if (
      primaryColor &&
      !neutralPen &&
      nearEdge &&
      contrast < 0.65 &&
      appearance.color !== primaryColor &&
      appearance.color !== INK_COLORS.black &&
      (colorSupport.get(appearance.color) || 0) < coloredSupport * 0.05 &&
      (half > typicalHalf * 1.5 || length < 8 * resolution)
    )
      continue;
    if (
      primaryColor &&
      nearEdge &&
      group.contrast / group.weight < 0.7 &&
      ((group.identified < group.weight * 0.05 &&
        group.contrast / group.weight < 0.3 &&
        group.weight > 20 * resolution) ||
        (regionColor !== primaryColor &&
          (colorSupport.get(regionColor || "") || 0) < coloredSupport * 0.05 &&
          group.half > typicalHalf * 1.5))
    )
      continue;
    if (primaryColor && group.identified < group.weight * 0.05 && contrast < 0.4 && length > 8) {
      const onRule = (horizontal: boolean) => {
        const ruling = horizontal ? analysis.horizontal : analysis.vertical;
        return (
          ruling.rules.length > 1 &&
          path.every((i) => {
            const q =
              ruledCoordinate(
                ruling,
                horizontal ? i % width : Math.floor(i / width),
                horizontal ? Math.floor(i / width) : i % width,
                horizontal ? width : height,
              ) / ruling.spacing;
            return Math.abs(q - Math.round(q)) * ruling.spacing < 3 * resolution;
          })
        );
      };
      if (onRule(true) || onRule(false)) continue;
    }
    // Short, unusually broad skeleton branches are often crease/tape blobs. A genuinely
    // broad nib remains broad when it is consistent across the writing or along a long stroke.
    if (broad && contrast < 0.65 && length < half * 6) continue;
    const profile = colorNibs.get(regionColor || primaryColor || INK_COLORS.black) || nibs;
    const measuredHalf =
      path.length === 1 && group.weight === 1
        ? half
        : profile.reduce(
            (best, nib) =>
              Math.abs(Math.log(group.nib / nib)) < Math.abs(Math.log(group.nib / best))
                ? nib
                : best,
            profile[0],
          );
    // A short spur off a crossing is a thinning artefact of a thick stroke, not a stroke.
    if (length > 1 && length < Math.max(3, half * 2.2)) {
      const ends = [path[0], path[path.length - 1]].filter((i) => skeleton[i]);
      const free = ends.some((i) => neighbours(skeleton, width, i).length === 1);
      const joined = ends.some((i) => neighbours(skeleton, width, i).length > 2);
      if (free && joined) continue;
    }
    const color = options.colors
      ? primaryColor && !neutralPen && appearance.color === INK_COLORS.black
        ? primaryColor
        : appearance.color
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
    const line = simplify(smooth, 0.25);
    let t = 0;
    const points: Point[] = line.map((p, k) => {
      if (k) t += Math.hypot(p.x - line[k - 1].x, p.y - line[k - 1].y) * scale * 2;
      const q = rectify(p.x, p.y);
      return { x: q.x * scale + offsetX, y: q.y * scale + offsetY, p: 0.5, t: Math.round(t) };
    });
    page.strokes.push({
      id: newId(),
      tool: "pen",
      color,
      // The existing precise renderer stores a radius. It follows the traced path
      // without running photo geometry through the live pen's spline engine again.
      // A fitted-page diameter below 1.2 is too faint for ordinary notebook reading.
      width: Math.min(100, Math.max(0.6, measuredHalf * scale)),
      points,
      rendering: "precise",
      pressureSensitive: false,
    } satisfies Stroke);
  }
  return {
    page,
    inkPixels,
    detection: {
      style: analysis.style,
      horizontalRules: analysis.horizontal.rules.length,
      verticalRules: analysis.vertical.rules.length,
    },
  };
}

// Fits a decoded image within the trace size.
export function traceSize(width: number, height: number) {
  const k = Math.min(1, TRACE_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
