# Android pen contact and input work — 2026-10-06

Slate 0.1.18 / Android versionCode 19 follows the owner's Android APK report of missing stroke beginnings, coarse turns and chunked ink. Deliveries are in `releases/2026-10-06-pen-contact`.

## Corrections

- Attach input handlers during layout. Recover a pressed pen move/raw event from its first received coalesced sample when down is absent. A fresh down finalizes stale input before starting the next contact. A missing up can be resolved by a hover/contact transition; held barrel buttons no longer join separate nib contacts.
- Listen for active movement and release at the window's capture phase. A known capture-state failure does not discard contact, and loss of capture does not end a pen stroke that can still receive window input.
- Deduplicate actual coordinates and pressure across raw/move batches, including samples sharing one timestamp. A unique same-time fallback coordinate is retained. Older samples remain excluded from backwards replay.
- Paint live ink on its existing immediate canvas without constructing a hidden SVG copy. Build cached precise-ink paths with native path commands. Defer completed SVG publication until input settles, publishing appended vectors in bounded batches while the existing raster stays visible. Raster and vector append positions are tracked independently to preserve highlighter opacity.
- Android requests unbuffered dispatch for native stylus/eraser down events before forwarding the event through the ordinary WebView path. Android documents this request as a way to deliver motion without frame batching; it does not establish the digitizer's sampling rate or guarantee WebView-to-display latency. See [Android stylus guidance](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features) and [Pointer Events](https://www.w3.org/TR/pointerevents3/).

Received coordinates, pressure, existing renderers, note formats and preferences remain intact. No inferred trajectories, curve fitting or prediction is added. A contact recovered after a missing down starts at the earliest sample actually received; physical points never delivered to Slate cannot be reconstructed.

## Evidence

Five interrupted-stream regressions fail against 0.1.17. Follow-up checks cover missing down/up, repeated down, held barrel buttons, failed/lost capture, timestamp aliasing, and zero hidden SVG work. Earlier highlighter/loop assertions were changed to inspect the live canvas and restored vectors; a hidden SVG is no longer built during inking.

The controlled 640-sample test recorded 30 hidden SVG path updates and 20.5ms p95 frames in 0.1.17. The new build records zero hidden SVG updates and 17.5ms p95 frames in that check. This is a synthesized Chromium workload, not measured Android pen-to-display latency.

TypeScript/scoped lint, root/independent builds and 56 unit tests pass. All 89 distinct production browser workflows pass after focused rechecks; one optional private Flexcil fixture is skipped. The final complete run records 88 passes and one sustained-writing frame-budget miss (68.4ms empty / 123.5ms dense p95). The unchanged test passes in isolation (86.7ms / 121.7ms). A subsequent control of the retained 0.1.17 build on the same host with the same test and fourfold CPU slowdown also exceeds the budget (98.0ms / 163.8ms). Timings vary; no threshold was relaxed and these results do not establish a universal speed improvement. Original reports and the matching recheck are retained and verified.

Both final desktop packages pass native save/reopen, pressure, offline and recovery checks. All 347 application assets match across desktop, APK and independent web; the APK passes signature verification with the existing development certificate. Final measurements and asset/signature/archive verification are in the delivery's `VALIDATION.md` and JSON reports.

No Android device is connected to this workspace. Compilation and software regressions do not establish physical stylus latency, digitizer frequency or palm rejection on the owner's tablet.
