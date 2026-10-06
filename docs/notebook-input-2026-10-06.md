# Notebook input and gesture fixes — 2026-10-06

Slate 0.1.17 / Android versionCode 18 is delivered in `releases/2026-10-06-notebook-input`.

The 0.1.16 worker saves and bounded rendering cache remain. This follow-up fixes input publication, scroll invalidation and pointer ownership around them.

## Changes

- Newly received ink paints in the pointer event on an independent bounded canvas, requesting a desynchronized context where supported. Only new segments paint; vector geometry, completed ink, selection and UI work remain frame-batched. Rapid short strokes can publish ink before lifting without reparsing an SVG path on every sample. The live buffer is reused and only its previous stroke's area is cleared. Highlighter opacity applies once to the entire live layer. Pressure filtering, rounded joins, raw coordinates and earlier geometry retain their existing behavior.
- Raw/move overlap is checked against hardware samples. A processed parent's later dispatch timestamp cannot suppress newer coalesced coordinates. No processed parent is appended to a nonempty coalesced batch. Fractional lift coordinates are retained.
- Panning publishes the latest requested scroll position once per frame. Ordinary pages reuse a complete raster within the existing four-million-pixel/4096-side budget. Large zooms reuse a visible slice with a 192-pixel margin until new paper is exposed. Completed stroke bounds are cached for slice refreshes. Vectors return after panning settles.
- The whole page viewport, including margins, uses the gesture handler and disables competing native touch scrolling. Pen contact and a 350 ms guard after contact activity reject new touch contacts; broad contacts are also rejected. Rejected contacts remain excluded until they lift. Fresh fingers can navigate after the guard, including while a rejected palm remains down; hover movement does not extend the guard. A palm pan that starts immediately before pen contact is rolled back; deliberate earlier pans retain their position.
- A pen interrupts and synchronously settles an active pinch before its first sample is measured. Wheel scrolling/zoom is blocked during a pen stroke. Unrelated touch cancellation cannot interrupt the pen. Pen cancellation or capture loss saves the already received stroke, with no invented cancellation endpoint; provisional touch ink remains discardable.
- The service-worker build sorts its asset list so repeated platform builds produce the same cache identifier and bundled script.

The pointer handling follows [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/): raw and move coalesced lists overlap, and a cancellation supplies no new coalesced samples. No coordinate stabilization, curve fitting, predicted samples, new dependencies or storage format changes were added.

## Verification

Four new browser regressions failed against the original implementation: delayed live publication, a palm pinch between letters, discarded canceled pen ink and unhandled margin panning. The final suite also covers raw/move overlap, pen takeover during a pinch, wheel suppression, pressure, highlighter transparency, undo/redo, exact coordinates, 1000% zoom, worker fallback, reload and dense-page persistence.

TypeScript/scoped lint and the root/independent builds pass, along with all 56 unit tests and 81 production browser workflows. One optional private Flexcil fixture is skipped. The sorted service-worker build also passes focused offline writing/reload and save-worker fallback checks.

At fourfold Chromium CPU slowdown, a 5,000-stroke page pans at 17.8ms p95 frame intervals versus 585.3ms in 0.1.16, without repainting completed strokes. A continuous 600-sample stroke measures 25.3ms p95 frames on a dense page versus 24.0ms on an empty page. All 1,000 strokes survive the long writing/reload check. Immediate painting adds work in the intentionally extreme rapid-short-stroke workload: empty-page p95 increases from 46.9ms to 62.8ms, while dense-page p95 stays comparable at 70.6ms versus 72.6ms. These are software measurements, not hardware pen-to-display latency.

Packaged Windows and Linux checks pass import, equations, pressure/zoom, worker saving, normal-close persistence, backup, offline reload and save-failure recovery in isolated profiles. All 347 application assets match across the four platforms. Android versionCode 18 passes signature verification with the existing development certificate. Native evidence, raw measurements and checksums are recorded in the delivery's `VALIDATION.md` and JSON reports. Android stylus/palm behavior and physical stylus feel require device verification.

## Design review

The mechanical detector's inherited paper-grid, paper-color, thumbnail/caption-size and control-radius advisories are intentional under Slate's existing design. Its rose-color advisory in the tablet test verifies the existing ink palette. These are contextual false positives for this input change; no visual tokens were changed and no detector exceptions were added. The stale design sidecar was not refreshed as an unrelated side effect.
