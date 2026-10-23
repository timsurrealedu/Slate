# Fast handwriting and photo import — 2026-10-23

## Fast strokes

The owner reported that fast strokes could lag, turn curves into straight segments, end at about half their length, or end somewhere they did not draw. Simulating the same input against 0.1.21 reproduced every symptom. Each had a separate cause.

| Symptom                         | Cause in 0.1.21                                                                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Long fast lines end short       | The Flexcil stabilizer is a FIR filter over the last N samples. It was never drained at the lift, so the stroke ended where the filter's output was, not where the pen lifted. Because the filter counts samples rather than time, sparse fast input lags further. A 600-unit flick at 60 Hz reached only 89% of its length at the default smoothing, 66% at 0.5 and 37% at 1. | `StrokeInput.end()` holds the pen at the lift position until the filter catches up, then lands exactly on the lift sample. It stops early if the low-lag kernel would overshoot the lift.                                                                                                                                                                                                                    |
| Curves become straight segments | When samples arrive far apart, the spline joins them with near-straight chords. Twelve samples around a circle turned by up to 35° at each sample.                                                                                                                                                                                                                             | When the next sample arrives, the gap before it is filled along a centripetal Catmull-Rom curve, with about 2 screen pixels between filled points. The curve passes through every received sample. The same circle now turns by at most 1.8°, and its interior stays within 0.21 units of the true circle. Sharp sparse corners such as an "N" stay within 4% of the leg length. Dense input is not changed. |
| Ink lags behind the pen         | Every input event recomputed the whole stroke's widths and spline, so the work per event grew with stroke length.                                                                                                                                                                                                                                                              | Width models (`fountain`, `calligraphy`, `pencil`) run one point at a time, and settled spline segments are cached. Only the newest point can still change. Geometry for the 3,000th sample now takes 0.026 ms instead of 0.458 ms, and stays flat as the stroke grows. Output is byte-identical to 0.1.21 for every brush and stroke prefix tested, including replaced tips.                                |
| Occasional hooks                | Raw and frame-aligned move batches overlap. A move delivered after a newer raw sample could feed a repeated sample to the stabilizer.                                                                                                                                                                                                                                          | `StrokeInput.add()` rejects samples older than the newest accepted sample, and exact repeats of it.                                                                                                                                                                                                                                                                                                          |

The newest received sample is drawn as a provisional tip, so filling the gap behind it adds no latency. Only the newest stroke point ever changes, which the live front buffer relies on. A unit test checks this property for every pen.

Stroke data stays in the same format. A fast stroke now stores the filled points, and the stored end is the lift position. Existing notes render exactly as before.

### Verification

- `tests/fast-ink.test.ts` checks:
  - full length for every brush and smoothing level;
  - curve fidelity and smoothness;
  - sharp turns;
  - unchanged dense input;
  - replay rejection;
  - settled-segment stability;
  - pressure-only taps;
  - flat per-sample cost.
- `tests/browser/live-ink.spec.ts` checks that a sparse CDP pen flick in Chromium keeps its full length, its curves and its sample order. The test fails on 0.1.21 (570 of 627 units) and passes now.
- The zoom test's endpoint checks now pass. On 0.1.21 the endpoint was off by 1 unit.

Not verified: physical stylus feel on the owner's devices.

## Notebook from photos

**New note → Notebook from photos** opens the photo picker, which on Android also offers the camera. Each photo becomes one notebook page of editable ink. A review dialog shows each photo next to its traced ink, with an ink-sensitivity slider and a "Keep ink colors" switch. Photos are processed on the device in a worker and are not stored.

Tracing (`src/slate/import/handwriting.ts`):

1. Paper brightness is estimated per cell, which cancels shadows and uneven light. The largest bright region is treated as the sheet, and the desk around it is ignored.
2. Ink is whatever is clearly darker than its local paper. Fainter pixels are kept only when they touch clear ink. This keeps pencil strokes whole while dropping printed rules and paper grain. Specks and solid blobs are removed.
3. The ink is thinned to centerlines (Zhang-Suen) and traced into strokes between ends and crossings. Thinning spurs are pruned and closed loops are kept.
4. Each stroke keeps its measured nib width as a ballpoint stroke. Its color is white-balanced against the paper and snapped to black, blue, red, green, purple or orange.

Verified:

- `tests/handwriting-import.test.ts` uses a synthetic photo with a desk, a lighting gradient, blue rules, and black, blue and red ink plus a dot. The tests check:
  - page mapping;
  - that the desk and rules are ignored;
  - line length and width;
  - loop accuracy;
  - colors;
  - the black-only mode;
  - the sensitivity range.
- `tests/browser/photo-import.spec.ts` drives the menu, picker, dialog and created notebook.

Limits: perspective is not corrected, so photograph the page straight on. Highlighter shading is not traced as highlighter, and pages are blank paper.
