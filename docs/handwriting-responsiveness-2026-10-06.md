# Handwriting responsiveness — 2026-10-06

Slate 0.1.16 / Android versionCode 17 is delivered in `releases/2026-10-06-handwriting-responsiveness`.

## What changed

Rapid pen lifts on dense pages exposed a different bottleneck from a single long stroke. Autosaving cloned the whole notebook into IndexedDB on the input thread, sometimes blocking it for over a second. A dedicated worker now rebuilds and saves notebook/PDF page changes, including revision checkpoints and connected-vault serialization. Ordinary saves send only changed ink. The database schema, revision checks, saved samples and backup format remain compatible; worker failure falls back to the existing transactional save. Explicit close and lifecycle flushes still await pending saves.

While writing, completed ink is painted into a cached bitmap of the visible paper. New strokes append incrementally; the live stroke still updates in bounded chunks. Selection and settled viewing use the original vectors, including 1000% zoom. The bitmap is limited to approximately four million pixels and 4096 pixels per side; save snapshots retain at most four documents. Redundant completed SVG geometry strings are released after the paths are cached. Existing notes, paper and controls retain their appearance.

Input consumes the coalesced event batch or its parent event, as specified by [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/#coalesced-events). Appending the browser's processed parent position after the batch could introduce a false turn. Fractional coordinates, small pressure changes and the lift endpoint are retained. Opening animations settle before measuring the paper for the first contact, so handwriting cannot chase a moving page. No coordinate stabilization, prediction or extra centerline smoothing was added; rounded joins and existing pressure-width smoothing remain.

## Measurements

Production Chromium tests used a fourfold CPU slowdown and synthesized pen input. These measure software responsiveness, not physical pen-to-display latency.

| Workload | Before | After |
| --- | --- | --- |
| 5,000 existing strokes / 240,000 samples, then 100 short strokes with autosaving: p95 frame interval | 804.4 ms | 43.1 ms |
| Empty page under the same rapid-writing workload: p95 frame interval | 45.0 ms | 43.8 ms |
| Dense-page p95 input handler | 13.1 ms | 6.7 ms |
| Full-document writes on the input thread during rapid writing | 20 | 0 |

The dense-page frame interval improved approximately 95% and matches the empty-page workload. This intentionally demanding test sends 16 samples per frame and completes a stroke every two frames.

A separate run wrote and reloaded 1,000 new strokes. The first 50 strokes had a 5.1 ms p95 input handler; the last 50 had 4.1 ms. The raster stayed at 760 × 815 pixels and retained JavaScript heap grew by 3.9 MB after collection. A continuous-stroke test measured 17.6 ms p95 frames on an empty page and 18.1 ms with 2,500 existing strokes, without paper-bounds reads or completed-path mutations during the measured live stroke.

Raw JSON reports are included in the delivery. The unsuccessful first targeted run is retained: a precise-sample assertion revealed the opening-animation issue, which was fixed before the complete production suite passed.

## Verification

TypeScript, scoped lint, root/standalone builds and 56 unit tests pass. The complete production browser suite passes 76 workflows; one optional private Flexcil fixture is skipped. Coverage includes exact coalesced coordinates/pressure, worker failure recovery, conflict-safe delta saves, transform/erase/reorder/undo, 1,000-stroke persistence, dense writing, highlighter transparency, 1000% zoom, touch gestures and accessibility.

The packaged Windows and Linux apps pass saving, normal close, relaunch, background worker writes, offline worker reload, ink pressure/zoom, backup and failed-save recovery checks. Linux runs through WSLg with the sandbox disabled only for testing. All 347 application assets match across Windows, Linux, Android and independent web. The verified Android APK retains the existing development certificate. Native reports and final bundle/archive verification are recorded in the delivery's `VALIDATION.md`.

Impeccable's scoped design audit scored 17/20. Its 26 detector advisories refer to inherited functional paper grids, miniature preview/caption sizes, paper colors and control radii; these were reviewed and retained under Slate's established design requirement. No ignore rules or suppressions were added. Desktop and phone previews and the detector report are included. Existing bundle size remains outside this handwriting change.

Physical stylus latency, pressure hardware and Android device behavior are unverified. The stress runs demonstrate the tested workloads rather than an unlimited-stroke guarantee.
