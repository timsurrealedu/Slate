# Flexcil handwriting parity — 2026-10-19

New notebook ink reproduces Flexcil 1.5.0.13's pen mechanics. They were recovered statically from the owner-supplied APK with JADX and apktool. The app was never run, and none of Flexcil's code or assets are shipped: no template PDFs, textures or icons. Templates, the pencil grain and the pen glyphs are regenerated from measured geometry and the decompiled procedural formulas.

## Recovered mechanics (`src/slate/ink/flexcil.ts`)

| Flexcil class (source file) | Behaviour ported |
| --- | --- |
| `cf.k` (GlobalEnum) | Pen types: 1 ballpoint, 2 highlighter, 5 fountain, 20 square highlighter, 21 slanted fountain, 23 texture pencil (22 round texture, 7 masking not ported). |
| `xm.k` (ReusableDrawerCollection) | Which drawer renders each type. |
| `an.l` / `an.m` (StrokeStabilizer) | FIR over the newest `smoothLevel × 50` samples (0.2 → 10 taps, capped by refresh rate). Low-lag kernel decoded from its float bit patterns. Integer-division resampling preserved. Applied to pens only, never to highlighters or straight strokes. |
| `xm.f` (LinearPenDrawer) | Ballpoint and highlighters: constant width, round cap and join, midpoint-quadratic spline. |
| `xm.r` (SquareCapLinearDrawer) | Square highlighter: square cap, round join. |
| `xm.h` + `ql.d` (BlendXfermodes) | Translucent highlighters blend with DARKEN (LIGHTEN for white), so overlaps never stack. |
| `xm.y` (VectorPenDrawer) | Fountain pen: per-sample width from smoothed velocity and pressure, ramped step limits, direction-reversal hold, velocity-only fallback after repeated full pressure (mouse/finger), eighth-nib jitter skip. |
| `xm.i` / `xm.j` (PressureVelocityStrokeWidthResolver) | Pressure window 0.1–0.8, EMA 0.3, velocity thinning 1.0–2.5 units/ms, minimum 50% width (pencil 35%), width-dependent step limiter, first sample leaned 60% toward maximum. Decompiled from smali because JADX's output was incorrect. |
| `xm.n`, `xm.p`, `xm.q` (Slanted*) | Calligraphy nib: a 45° rectangle 1.8·m long by 0.56·m thick (m = 0.72 × width) swept by convex hulls along the spline. The final stamp narrows to 74%. Jitter is filtered within max(9% width, 0.4). |
| `xm.u`, `xm.v` (TextureFountain/Pencil) | Pencil: constant width with curvature-driven nib lag (≤ 40% width). Graphite grain uses Flexcil's hash and value-noise texture formula, made seamless and drawn as a dense core plus a speckled fringe. |
| `xm.o` (SlantedMidpointSpline) | Shared spline: a line to the first midpoint, quads through samples, a straight tail; quadratic width interpolation clamped to 60–140% of anchors. |
| `xm.d` (LassoPenDrawer) | Freeform lasso: 1px `#4793ef` 12/12 dash over white. |
| `xm.a` / `xm.b` (Eraser*) | Whole-stroke eraser swept between samples; default width 10. |
| `DefaultPens.json` | The default pen slots, colors, widths, opacity, straight flags and per-pen stabilization. |

Widths are Flexcil units on its 768-wide page frame (pens 0.1–20, highlighters 1–40), scaled by 794/768 to Slate page units. Velocity constants use the same frame units.

## Live ink and outlines (2026-10-22, `src/slate/ink/live.ts`)

A second pass disassembled `classes3.dex` with the Android SDK's `dexdump`.

| Flexcil class | Finding | Slate |
| --- | --- | --- |
| `…handwriting.lowlaterncy.LowLatencySurfaceView` | A `SurfaceView` driving androidx `GLFrontBufferedRenderer` (strings `GLFrontBufferedRenderer`, `segments`, `beziers`). Each input batch draws only its new spline segments into the front buffer, and the stroke is committed whole on lift. | `LiveBrush` keeps settled segments in an offscreen buffer per layer and redraws only a dirty rectangle around the provisional tail on the `desynchronized` live canvas. Graphite coverage is tinted once per rectangle, so segment joins never darken. |
| `xm.y.f0` (VectorPenDrawer) | Per segment: `moveTo` the start, `lineTo` the left offset, `quadTo` the offset control, `lineTo` across, `quadTo` back, then `addOval` the nib at the segment end (and its start on the first segment). The scratch path `n` is rewound and appended to the persistent path `m`. The end offsets are cached in field `C` and reused as the next start. | `ribbon()` emits the same offset-quadratic ribbons and end ovals. This replaces up to 12 straight-edged dabs per segment, which faceted fast curves. |

A sample is final once a newer one arrives, so `BrushPlan.stable` (samples − 2) segments never change. A unit test checks this for every pen. Two-sample strokes now reach their last sample. Dots never emit zero-length subpaths, because Chromium can skip repainting their empty bounds.

Browser checks (`tests/browser/live-ink.spec.ts`): live ink matches the committed raster for all nine default pens (≤ 0.9% pixel mismatch, from the lift sample). Script time stays near 0.45–0.55 ms per sample across a 900-sample stroke. A tapped dot is still visible after the SVG layer takes over. Not yet verified on the Android device.

## Templates (`src/slate/ink/paper.ts`)

Measured from the Standard portrait PDFs (768 × 1024): lines every 26 units from y 63.5 with darker first and last rules. Graph, dot and vertical lattices are 26.45 units from (13.79, 9.5). Cornell, legal and two-column use `#c4151d` margin rules. Paper and line colors: white `#ffffff`/`#d3d3d4`, yellow `#fef4c3`/`#b4a36e`, dark `#2d2d2f`/`#5d5955`. New Flexcil-template pages are 794 × 1059 (3:4).

## Compatibility

Strokes gain optional `brush` and `opacity` fields. Paper gains optional `template` and `columns`. Existing direct, smooth and precise strokes and existing paper render exactly as before. New strokes store stabilized samples; widths are derived deterministically from those samples when drawn. The `.flx` storage format was decoded (see `flexcil-import.md`) but Slate does not read or write it: the owner chose to keep Slate's format.

## Verification

Unit tests (`tests/flexcil-ink.test.ts`) cover stabilizer convergence and lag, width models, pencil lag bounds, geometry determinism, caps and blending, taps, straight snapping and backup schema retention. A Chromium harness compared canvas and SVG output for every pen, including 8× zoom. Synthetic CDP pen input drove all ten default pens, lasso and the pen editor in the production build.

Not verified: side-by-side comparison with Flexcil on a device, physical stylus feel, and pressure curves on real hardware.
