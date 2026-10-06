# Notebook performance: 2026-10-04

Slate 0.1.15 / Android versionCode 16 addresses increasing drawing cost as a page accumulates strokes, as well as fast input and small lettering. Completed packages are in `releases/2026-10-04-notebook-performance`; earlier deliveries are preserved.

## Changes

Completed ink and the live stroke now occupy separate cached SVG layers. Reconciliation retains existing path elements and appends only newly completed strokes. Live geometry updates in 64-point chunks, so extending a long stroke does not regenerate its entire outline each frame. Both ink layers receive compositor promotion because promoting the live layer alone still left density-dependent raster work. Highlighter opacity applies to the whole live group, preventing overlapping chunks from becoming darker.

Pen input consumes `pointerrawupdate` and coalesced samples, with `pointermove` fallback. Overlapping move events and stale samples are excluded without dropping valid input. Canvas bounds are cached until input, scrolling or resize requires fresh coordinates. Every accepted fractional coordinate, pressure value and final lift point is retained; no centerline smoothing, simplification or prediction is added. Existing direct, legacy and smoothed strokes keep their rendering.

The hidden library retains its last visible content while a document is open. Page thumbnails append new strokes and rebuild for undo, transforms, reordering or paper changes. History controls update only when their flags change, and an unused selection overlay is no longer cleared every drawing frame.

Notebook and PDF page updates batch full-document persistence after 200ms of quiet, with a maximum 1s delay before scheduling a write during continuous edits. Writes remain serialized. Normal close, lifecycle and backup flushes bypass the delay and include all pending ink; pending edits retain the existing unsaved-data guard. Storage schemas, source documents, vault behavior and recovery protections are unchanged. These scheduling bounds do not guarantee disk completion within one second.

## Measured result

The same synthetic Chromium workload was recorded before and after the change: a 1440×960 viewport, 4x CPU slowdown, 2,500 mixed precise/direct/legacy strokes with 48 samples each, and 600 additional samples tracing tight loops over 100 animation frames. The first five intervals are excluded from frame percentiles.

| Measure | 0.1.14 baseline | 0.1.15 |
| --- | --- | --- |
| Empty-page p95 frame interval | 18.5ms | 17.7ms |
| 2,500-stroke page p95 frame interval | 39.2ms | 17.9ms |
| Dense-page p95 six-sample handler batch | 8.4ms | 3.2ms |
| Dense-page p95 paint duration | 7.389ms | 1.021ms |
| Canvas bounds reads in the measured gesture | 603 | 2 |
| Newly saved samples, including down/lift | 602 | 602 |

Raw reports are included as `ink-performance-before.json` and `ink-performance-after.json`. The separate regression test records 18.3ms empty-page and 18.2ms dense-page p95 frame intervals, with zero mutations of completed ink and zero input-handler bounds reads during live input. See `notebook-frame-budget.json`. These measurements describe this controlled browser workload, not physical stylus latency.

## Verification

- TypeScript, scoped lint, independent production build and Android build pass; 53 unit tests pass.
- 72 distinct production browser workflows pass across the complete run and corrected focused reruns; one optional private Flexcil fixture is skipped. Raw failed attempts are retained alongside `browser-results.json`, which records each workflow's final result.
- Four new browser workflows cover density-independent frame cost, 2,048 fast raw/coalesced samples with tiny loops and replay/stale-event guards, 20 consecutive strokes on a dense page with undo/redo/reload and thumbnail identity, and uniform long-stroke highlighter transparency.
- Incremental pen/highlighter geometry matches fresh full rendering over 1,025 points crossing chunk boundaries. Autosave tests cover batching, bounded scheduling and forced flush of pending ink.
- Existing browser fixtures now await queued saves before reading persisted data, select the completed ink layer explicitly, and wait for library navigation before computing drag coordinates. The dense-page fixture returns only a small IndexedDB summary, avoiding transport of 120,000 points during CPU-throttled polling.
- Windows and Linux native checks pass in isolated profiles, including pressure settings, 1000% zoom, immediate close/reopen, ink, backup, offline reload and close protection on save failure. Linux runs through WSLg; sandbox relaxation is confined to that test invocation.
- All 346 web files match Windows/Linux ASARs, Android assets and the independent web delivery. Android signature matches 0.1.14. Archive checks cover file hashes, ZIP CRC and Linux executable/sandbox modes. Delivered files are recorded in `checksums.json`.

Physical pen feel, device pressure response, very long writing sessions and Android device installation/lifecycle remain unverified.

## Design review

Desktop and phone screenshots retain Slate's paper, typography and compact tools. Impeccable's detector reported 26 inherited notebook CSS advisories: the paper grid is a functional template; caption/miniature-preview sizes, colors and radii are existing presentation values outside this performance change. They are retained unchanged under the project's visual-preservation instruction. Compositor hints apply only to the two measured ink layers. No ignore directive or suppression was added.

Impeccable's cached design metadata predates `DESIGN.md`; `/impeccable document` can refresh it. Graphify's existing map remains useful for orientation, with `.needs_update` marking the new rendering and persistence relationships for its next refresh.
