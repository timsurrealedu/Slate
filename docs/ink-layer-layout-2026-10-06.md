# Notebook ink layout — 2026-10-06

Slate 0.1.19 / Android versionCode 20 addresses the owner's report that handwriting remains choppy after roughly 100 strokes, including after reopening the notebook. The completed delivery is `releases/2026-10-06-ink-layer-layout`.

## Cause and correction

Completed ink switched between SVG and its cached canvas using `display:none`. Hiding the SVG discarded its layout cache. At the next pen contact, the viewport measurement forced layout of all saved stroke geometry again. Longer saved trajectories made this expensive even when the stroke count was modest; reopening retained that workload. Earlier stress checks used shorter strokes and continuous input, which did not exercise repeated switches after idle pauses.

Completed SVG ink now uses `visibility:hidden` while its raster is active. Its geometry remains laid out across pen lifts and pauses. The raster still displays completed ink while new input paints immediately on the separate live canvas. Settled viewing, selection and zoom retain their vector handoff.

Inactive open notebooks also received the window's pen events and read every coalesced batch before deciding that the event belonged to another page. The move handler now checks pointer ownership first. It still processes tracked gestures, touches and rejected palms outside the canvas, preserving capture-loss recovery and palm rejection. A regression with two open notebooks records four batch reads before the correction and two after, while preserving the received coordinates.

Received coordinates, pressure, note formats and preferences retain their existing behavior. No coordinate smoothing, fitting or prediction is added. The earlier pen-contact recovery, unbuffered Android dispatch and palm handling remain in place.

## Measured reproduction

A synthesized Chromium tablet workload uses a 1280×800 viewport, device pixel ratio 2 and fourfold CPU slowdown. Each saved stroke has 512 received samples. A fresh browser context reopens each notebook, draws a 320-sample stroke, pauses for 1.8 seconds, then writes again. CDP performance counters measure layout during pen contact separately from active drawing.

| Saved strokes | First contact after reopening: 0.1.18 → 0.1.19 | Resume after pause: 0.1.18 → 0.1.19 |
| ------------- | ---------------------------------------------- | ----------------------------------- |
| 0             | 0.948 → 0.419 ms                               | 0.621 → 0.383 ms                    |
| 100           | 22.626 → 0.409 ms                              | 22.684 → 0.383 ms                   |
| 200           | 44.360 → 0.418 ms                              | 46.030 → 0.436 ms                   |

The change removes the density-dependent SVG layout cost in this workload. These are layout durations, not physical pen-to-display latency or total event durations. Active drawing p95 frame intervals after a pause were 17.6/17.8/17.7 ms before and 17.7/17.9/22.5 ms after at 0/100/200 strokes. Other work and scheduling still affect frames; these runs do not demonstrate a universal improvement in every latency metric. The before/after JSON reports and final CPU profiles are retained in the delivery.

A production-browser regression reopens 0- and 200-stroke notebooks, measures two contacts separated by the idle vector handoff, checks every newly dispatched sample is saved, and verifies a SHA-256 digest of the original stroke data is unchanged. Dense contact layout must stay below the larger of 5 ms or three times the empty-page measurement. The same regression fails cleanly at the original budget against the retained 0.1.18 bundle: 51.501/52.495 ms at 200 strokes versus 0.683/0.408 ms empty. The assertion failure and both measurements are retained. No threshold was relaxed.

The initial full run recorded a separate 5,000-stroke sustained-writing budget miss (52.9 ms empty / 88.2 ms dense p95 frames); its unchanged isolated recheck also missed (55.7 / 117.0 ms). Profiling confirmed 99 appended raster fills and no completed SVG path updates during 100 added strokes, then inspection and the ownership regression exposed duplicate hardware-batch reads in inactive notebooks. After the ownership correction, the same recorded test and original budget passed at 57.0 / 70.4 ms. No recorder setting, input workload or threshold was changed. Timings vary; this does not establish physical Android latency. Original reports and profiles are retained.

The final complete run passes all 91 production browser workflows, with one optional private Flexcil fixture skipped and zero failures. TypeScript/scoped lint, root/independent builds, all 56 unit tests and all 13 native Windows/Linux workflows pass. The final contact regression measures 0.221/0.381 ms dense versus 0.368/0.029 ms empty; sustained writing records 64.5/93.1 ms empty/dense p95 frames, passing the unchanged relative budget. All 1,000 consecutive strokes survive reopening. These are software measurements, separate from Android hardware latency.

All 347 application assets match across Windows, Linux, Android and independent web. APK version/signature, archive hashes and Linux executable/sandbox modes verify. Final checks and file hashes are recorded in the delivery's `VALIDATION.md` and JSON reports.

No physical Android device is connected. Device handwriting latency, digitizer sampling and palm behavior remain unverified. Install the APK over the existing development-signed app while retaining its data; the existing signing identity is preserved.
