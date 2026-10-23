// Repeated ruling is evidence of paper; a single straight line can be part of a drawing.
import type { PaperStyle } from "../core/model";

export interface Rule {
  position: number;
  // Coordinates across equal strips, including perspective and gently curved paper.
  samples: number[];
  strength: number;
  ordinal?: number;
  reliable?: boolean;
  coverage?: number;
}
export interface Ruling {
  rules: Rule[];
  spacing: number;
}
export interface PaperAnalysis {
  style: PaperStyle;
  horizontal: Ruling;
  vertical: Ruling;
  dots: number[];
  margins?: { horizontal: Rule[]; vertical: Rule[] };
}
const median = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)] || 0;
export function ruleAt(rule: Rule, across: number, extent: number) {
  if (rule.samples.length === 1) return rule.samples[0];
  // Strip samples are at their centers. Continue their slope to the paper edge;
  // clamping it left short pieces of ruling behind on tilted photographs.
  const p = (across / extent) * rule.samples.length - 0.5;
  const i = Math.max(0, Math.min(rule.samples.length - 2, Math.floor(p))),
    f = p - i;
  return rule.samples[i] * (1 - f) + rule.samples[i + 1] * f;
}

function periodic(rules: Rule[], extent: number): Ruling {
  if (rules.length < 4) return { rules: [], spacing: 0 };
  rules.sort((a, b) => a.position - b.position);
  let best: Rule[] = [],
    step = 0,
    score = 0;
  for (let i = 0; i < rules.length - 1; i++) {
    const spacing = rules[i + 1].position - rules[i].position;
    if (spacing < 9 || spacing > extent / 5) continue;
    const family = rules.filter(
      (r) =>
        rules.filter((s) => {
          const gap = Math.abs(s.position - r.position) / spacing;
          return gap > 0.7 && gap < 3.3 && Math.abs(gap - Math.round(gap)) < 0.24;
        }).length >= 2,
    );
    const merit = family.reduce((s, r) => s + r.strength, 0);
    if (family.length >= 4 && merit > score) [best, step, score] = [family, spacing, merit];
  }
  if (!best.length || best[best.length - 1].position - best[0].position < extent * 0.22)
    return { rules: [], spacing: 0 };
  const gaps = best.slice(1).map((r, i) => {
    const d = r.position - best[i].position;
    return d / Math.max(1, Math.round(d / step));
  });
  const spacing = median(gaps);
  let ordinal = 0;
  best.forEach((r, i) => {
    if (i) ordinal += Math.max(1, Math.round((r.position - best[i - 1].position) / spacing));
    r.ordinal = ordinal;
  });
  return { rules: best, spacing };
}

function axisRules(
  dark: Float32Array,
  width: number,
  height: number,
  horizontal: boolean,
  single = false,
): Ruling {
  const along = horizontal ? width : height,
    extent = horizontal ? height : width;
  const at = (u: number, v: number) => {
    if (u < 0 || v < 0 || u >= along || v >= extent) return 0;
    return dark[horizontal ? v * width + u : u * width + v];
  };
  // Reject broad shadows before voting. Cap votes so dark writing cannot outweigh a long rule.
  const signal = new Float32Array(width * height);
  for (let u = 0; u < along; u++)
    for (let v = 4; v < extent - 4; v++)
      signal[horizontal ? v * width + u : u * width + v] = Math.min(
        0.12,
        Math.max(0, at(u, v) - (at(u, v - 4) + at(u, v + 4)) / 2),
      );
  const response = (u: number, v: number) =>
    v < 0 || v >= extent ? 0 : signal[horizontal ? v * width + u : u * width + v];
  const strips = 12,
    candidates: Rule[] = [];
  // Local angle searches allow the top and bottom of a perspective photograph to differ.
  for (let zone = 0; zone < 4; zone++) {
    const low = Math.floor((zone * extent) / 4),
      high = Math.floor(((zone + 1) * extent) / 4);
    let slope = 0,
      merit = -1;
    for (let k = -24; k <= 24; k++) {
      const tilt = k * 0.0075,
        votes = new Float32Array(extent);
      for (let u = Math.floor(along * 0.06); u < along * 0.94; u += 4)
        for (let v = Math.max(4, low - 50); v < Math.min(extent - 4, high + 50); v++) {
          const row = Math.round(v - tilt * (u - along / 2));
          if (row >= low && row < high) votes[row] += response(u, v);
        }
      let sum = 0;
      for (let v = low + 1; v < high - 1; v++) {
        const n = votes[v - 1] + votes[v] + votes[v + 1];
        sum += n * n;
      }
      if (sum > merit) [slope, merit] = [tilt, sum];
    }
    const votes = new Float32Array(extent),
      counts = new Uint16Array(extent);
    for (let u = Math.floor(along * 0.06); u < along * 0.94; u += 2)
      for (let row = low; row < high; row++) {
        const v = Math.round(row + slope * (u - along / 2));
        votes[row] += response(u, v);
        counts[row]++;
      }
    const score = (v: number) => (votes[v] || 0) / Math.max(1, counts[v] || 0);
    for (let row = low; row < high; row++) {
      if (score(row) < 0.01 || score(row) < score(row - 1) || score(row) <= score(row + 1))
        continue;
      const samples: number[] = [],
        strengths: number[] = [];
      let supported = 0,
        tested = 0;
      for (let strip = 0; strip < strips; strip++) {
        const u0 = Math.floor(((strip + 0.12) * along) / strips),
          u1 = Math.floor(((strip + 0.88) * along) / strips);
        let best = -1,
          offset = 0;
        for (let d = -6; d <= 6; d++) {
          let value = 0;
          for (let u = u0; u < u1; u += 2) {
            const v = Math.round(row + slope * (u - along / 2) + d);
            value += response(u, v);
          }
          value /= Math.max(1, (u1 - u0) / 2);
          // Stay on the same rule when a nearby letter is darker.
          value -= Math.abs(d) * 0.0015;
          if (value > best) [best, offset] = [value, d];
        }
        samples.push(row + slope * (((strip + 0.5) * along) / strips - along / 2) + offset);
        strengths.push(best);
        for (let u = u0; u < u1; u += 2) {
          const v = Math.round(row + slope * (u - along / 2) + offset);
          if ([-2, -1, 0, 1, 2].some((d) => response(u, v + d) > 0.035)) supported++;
          tested++;
        }
      }
      // Paper rules cross most of the sheet. Short diagram edges remain ink.
      const reliable =
        strengths.filter((s) => s > 0.025).length >= strips * 0.66 && supported >= tested * 0.68;
      if (supported < tested * 0.3 || strengths.filter((s) => s > 0.015).length < 3) continue;
      const strength = reliable
        ? median(strengths)
        : strengths.reduce((a, b) => a + Math.max(0, b), 0) / strips;
      const position = (samples[5] + samples[6]) / 2;
      const candidate = { position, samples, strength, reliable, coverage: supported / tested };
      const duplicate = candidates.find((r) => Math.abs(r.position - position) < 7);
      if (!duplicate) candidates.push(candidate);
      else if (
        (!duplicate.reliable && reliable) ||
        (duplicate.reliable === reliable && duplicate.strength < strength)
      )
        Object.assign(duplicate, candidate);
    }
  }
  if (single) return { rules: candidates.filter((r) => (r.coverage || 0) > 0.5), spacing: 0 };
  const certain = periodic(
    candidates.filter((r) => r.reliable),
    extent,
  );
  if (certain.rules.length) return certain;
  // Faint rules can disappear into a shadow. Require a much longer, phase-consistent
  // lattice before accepting rules visible across only part of the photograph.
  candidates.sort((a, b) => a.position - b.position);
  let best: Rule[] = [];
  for (let i = 0; i < candidates.length - 1; i++) {
    const step = candidates[i + 1].position - candidates[i].position;
    if (step < 9 || step > extent / 8) continue;
    for (const origin of candidates) {
      const tilt = origin.samples[origin.samples.length - 1] - origin.samples[0];
      const family = candidates.filter(
        (r) =>
          Math.abs(r.samples[r.samples.length - 1] - r.samples[0] - tilt) < 6 &&
          Math.abs(
            (r.position - origin.position) / step -
              Math.round((r.position - origin.position) / step),
          ) < 0.1,
      );
      if (
        family.length >= 8 &&
        family.length > best.length &&
        family[family.length - 1].position - family[0].position > extent * 0.5
      )
        best = family;
    }
  }
  return periodic(best, extent);
}

function dotGrid(dark: Float32Array, width: number, height: number) {
  const seen = new Uint8Array(dark.length),
    dots: { x: number; y: number; pixels: number[] }[] = [];
  for (let i = 0; i < dark.length; i++) {
    if (seen[i] || dark[i] < 0.055) continue;
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
        if (!seen[j] && dark[j] >= 0.055) {
          seen[j] = 1;
          pixels.push(j);
        }
      }
    }
    if (pixels.length >= 2 && pixels.length <= 50 && x1 - x0 <= 7 && y1 - y0 <= 7)
      dots.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, pixels });
  }
  const axis = (key: "x" | "y", extent: number) => {
    const groups: { position: number; count: number }[] = [];
    for (const d of dots.sort((a, b) => a[key] - b[key])) {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last.position - d[key]) < 2.5) {
        last.position = (last.position * last.count + d[key]) / (last.count + 1);
        last.count++;
      } else groups.push({ position: d[key], count: 1 });
    }
    return periodic(
      groups
        .filter((g) => g.count >= 4)
        .map((g) => ({
          position: g.position,
          samples: [g.position, g.position],
          strength: g.count,
        })),
      extent,
    );
  };
  const horizontal = axis("y", height),
    vertical = axis("x", width);
  if (!horizontal.rules.length || !vertical.rules.length) return;
  const matched = dots.filter(
    (d) =>
      horizontal.rules.some((r) => Math.abs(r.position - d.y) < 2.5) &&
      vertical.rules.some((r) => Math.abs(r.position - d.x) < 2.5),
  );
  if (matched.length < 16 || matched.length < dots.length * 0.5) return;
  return { horizontal, vertical, dots: matched.flatMap((d) => d.pixels) };
}

export function analyzePaper(
  dark: Float32Array,
  width: number,
  height: number,
  red?: Float32Array,
): PaperAnalysis {
  const horizontal = axisRules(dark, width, height, true);
  const vertical = axisRules(dark, width, height, false);
  if (red && horizontal.rules.length && !vertical.rules.length) {
    const margin = axisRules(red, width, height, false, true).rules.filter(
      (r) => r.position > width * 0.08 && r.position < width * 0.4,
    );
    if (margin.length === 1) {
      const dividers = axisRules(red, width, height, true, true).rules.filter(
        (r) => r.position > height * 0.12 && r.position < height * 0.9,
      );
      const cornell =
        dividers.some((r) => r.position < height * 0.35) &&
        dividers.some((r) => r.position > height * 0.6);
      return {
        style: cornell ? "cornell" : "legal",
        horizontal,
        vertical,
        dots: [],
        margins: { horizontal: cornell ? dividers : [], vertical: margin },
      };
    }
  }
  if (!horizontal.rules.length && !vertical.rules.length) {
    const dotted = dotGrid(dark, width, height);
    if (dotted) return { style: "dot", ...dotted };
  }
  return {
    style: horizontal.rules.length
      ? vertical.rules.length
        ? "grid"
        : "lined"
      : vertical.rules.length
        ? "vertical"
        : "blank",
    horizontal,
    vertical,
    dots: [],
  };
}

// Only erase pixels with the paper rule's pigment/contrast. Stronger or differently colored
// writing on a rule remains; crossings of same-color ink are bridged from both sides.
export function removeRuling(
  mask: Uint8Array,
  dark: Float32Array,
  chroma: Float32Array,
  width: number,
  height: number,
  analysis: PaperAnalysis,
  red?: Float32Array,
) {
  const original = mask.slice();
  const dotContrast = median(analysis.dots.map((i) => dark[i]));
  const dotColor = median(analysis.dots.map((i) => chroma[i]));
  for (const i of analysis.dots) mask[i] = 0;
  if (analysis.style === "dot") {
    for (const h of analysis.horizontal.rules)
      for (const v of analysis.vertical.rules) {
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const x = Math.round(v.position) + dx,
              y = Math.round(h.position) + dy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const i = y * width + x;
            if (dark[i] <= dotContrast + 0.12 && chroma[i] <= dotColor + 0.055) mask[i] = 0;
          }
      }
    return;
  }
  for (const horizontal of [true, false]) {
    const along = horizontal ? width : height,
      extent = horizontal ? height : width;
    const index = (u: number, v: number) => (horizontal ? v * width + u : u * width + v);
    const ruling = horizontal ? analysis.horizontal : analysis.vertical;
    const rules: Rule[] = [];
    for (let k = 0; k < ruling.rules.length; k++) {
      const rule = ruling.rules[k],
        next = ruling.rules[k + 1];
      rules.push(rule);
      // Writing or correction tape may conceal a printed rule. Its periodic neighbors
      // still locate it; otherwise those concealed strips survived as spurious ink.
      const gap = next ? (next.ordinal ?? k + 1) - (rule.ordinal ?? k) : 1;
      if (gap > 1 && gap <= 4)
        for (let n = 1; n < gap; n++)
          rules.push({
            ...rule,
            position: rule.position + ((next.position - rule.position) * n) / gap,
            samples: rule.samples.map((v, i) => v + ((next.samples[i] - v) * n) / gap),
            ordinal: (rule.ordinal ?? k) + n,
          });
    }
    if (rules.length >= 2) {
      const first = rules[0],
        last = rules[rules.length - 1];
      if (first.position < ruling.spacing * 1.2) {
        const next = rules[1],
          gap = Math.max(1, (next.ordinal ?? 1) - (first.ordinal ?? 0));
        rules.unshift({
          ...first,
          position: first.position - ruling.spacing,
          samples: first.samples.map((v, i) => v - (next.samples[i] - v) / gap),
        });
      }
      if (last.position > extent - ruling.spacing * 1.2) {
        const previous = rules[rules.length - 2];
        rules.push({
          ...last,
          position: last.position + ruling.spacing,
          samples: last.samples.map(
            (v, i) =>
              v +
              (v - previous.samples[i]) /
                Math.max(1, (last.ordinal ?? 1) - (previous.ordinal ?? 0)),
          ),
        });
      }
    }
    rules.push(
      ...(horizontal ? analysis.margins?.horizontal || [] : analysis.margins?.vertical || []),
    );
    const familyContrasts: number[] = [],
      familyColors: number[] = [];
    for (const rule of rules)
      for (let u = 0; u < along; u += 8) {
        const v = Math.round(ruleAt(rule, u, along));
        if (v < 2 || v >= extent - 2) continue;
        let i = index(u, v);
        for (const d of [-1, 1]) if (dark[index(u, v + d)] > dark[i]) i = index(u, v + d);
        if (dark[i] > 0.025) {
          familyContrasts.push(dark[i]);
          familyColors.push(chroma[i]);
        }
      }
    const familyContrast = median(familyContrasts),
      familyColor = median(familyColors);
    for (const rule of rules) {
      const margin = (
        horizontal ? analysis.margins?.horizontal : analysis.margins?.vertical
      )?.includes(rule);
      for (let strip = 0; strip < rule.samples.length; strip++) {
        const start = Math.floor((strip * along) / rule.samples.length),
          end = Math.floor(((strip + 1) * along) / rule.samples.length);
        const contrasts: number[] = [],
          colors: number[] = [];
        for (let u = start; u < end; u += 2) {
          const v = Math.round(ruleAt(rule, u, along));
          if (v < 4 || v >= extent - 4) continue;
          let best = index(u, v);
          for (let d = -1; d <= 1; d++)
            if (dark[index(u, v + d)] > dark[best]) best = index(u, v + d);
          if (dark[best] > 0.025) {
            contrasts.push(dark[best]);
            colors.push(chroma[best]);
          }
        }
        // A handwritten underline can coincide with a printed rule for a whole strip.
        // Its pigment must not become the reference used to erase the handwriting itself.
        const contrast = margin
            ? median(contrasts)
            : Math.min(
                contrasts.length ? median(contrasts) : familyContrast,
                familyContrast + 0.06,
              ),
          color = margin
            ? median(colors)
            : Math.min(colors.length ? median(colors) : familyColor, familyColor + 0.04);
        for (let u = start; u < end; u++) {
          const v = Math.round(ruleAt(rule, u, along));
          if (v < -5 || v >= extent + 5) continue;
          const pen = (i: number) =>
            original[i] && (dark[i] > contrast + 0.12 || chroma[i] > color + 0.055);
          const crosses =
            v >= 4 &&
            v < extent - 4 &&
            [-1, 0, 1].some((d) => pen(index(Math.max(0, Math.min(along - 1, u + d)), v - 4))) &&
            [-1, 0, 1].some((d) => pen(index(Math.max(0, Math.min(along - 1, u + d)), v + 4)));
          if (crosses) continue;
          const radius = Math.max(
            2,
            Math.min(
              5,
              Math.floor(
                ((horizontal ? analysis.horizontal : analysis.vertical).spacing || 20) / 4,
              ),
            ),
          );
          for (let d = -radius; d <= radius; d++) {
            if (v + d < 0 || v + d >= extent) continue;
            const i = index(u, v + d);
            if (margin && (!red || red[i] < 0.15)) continue;
            if (dark[i] <= contrast + 0.12 && chroma[i] <= color + 0.055) mask[i] = 0;
          }
        }
      }
    }
  }
}

// The local ruler flattens photographed lines, retaining positions within each ruled band.
export function ruledCoordinate(ruling: Ruling, across: number, value: number, extent: number) {
  const { rules, spacing } = ruling;
  if (!rules.length) return value;
  let i = 0;
  while (i < rules.length - 2 && value > ruleAt(rules[i + 1], across, extent)) i++;
  const a = ruleAt(rules[i], across, extent),
    b = ruleAt(rules[i + 1], across, extent);
  const row = rules[i].ordinal ?? i;
  const count = (rules[i + 1].ordinal ?? i + 1) - row;
  return (row + ((value - a) / Math.max(1, b - a)) * count) * spacing;
}
