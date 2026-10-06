# Release status

Storage cleanup on 2026-10-06 preserves the complete 0.1.16 delivery, the four compressed/APK rollback packages for 0.1.15, and historical APKs and validation records. Older unpacked desktop/web folders and superseded downloads were removed; affected folders contain retention notices. The dated records below describe their original complete deliveries. See [storage retention](storage-retention.md).

The current local delivery is Slate 0.1.17 / Android versionCode 18 in `releases/2026-10-06-notebook-input`. Received ink paints during input events on a separate bounded canvas. Panning reuses completed ink, pen input owns the page while writing, and rejected palms stay excluded until lift. Raw/move overlap retains every new hardware sample; cancellation retains received pen ink. At 4x Chromium CPU slowdown, panning 5,000 existing strokes improved p95 frame intervals from 585.3ms to 17.8ms. TypeScript/scoped lint, 56 unit tests and 81 production browser workflows pass; one optional private Flexcil fixture skipped. See [notebook input validation](notebook-input-2026-10-06.md) and the delivery's `VALIDATION.md` for measurements, native evidence and physical-device limits.

The prior local delivery is Slate 0.1.16 / Android versionCode 17 in `releases/2026-10-06-handwriting-responsiveness`. Background delta saves and a bounded visible-paper cache remove full-notebook work from active pen input. Coalesced events retain precise samples without appending a processed parent; entry motion settles before first contact. No coordinate stabilization was added. At 4x Chromium CPU slowdown, rapid writing with 5,000 existing strokes improved p95 frame intervals from 804.4ms to 43.1ms, versus 43.8ms on an empty page. A separate 1,000-new-stroke run stayed responsive and reloaded every stroke. TypeScript/scoped lint, 56 unit tests and 76 production browser workflows pass; one optional private Flexcil fixture skipped. See [handwriting responsiveness validation](handwriting-responsiveness-2026-10-06.md) and the delivery's `VALIDATION.md` for packages, native evidence and physical-device limits.

The prior local delivery is Slate 0.1.15 / Android versionCode 16 in `releases/2026-10-04-notebook-performance`. Completed ink stays cached while live strokes update in bounded chunks; raw/coalesced input preserves fast writing and small lettering. Notebook autosaves are batched, with immediate explicit flush on normal close and lifecycle/backup operations. At 4x Chromium CPU slowdown, a 2,500-stroke page improved from 39.2ms to 17.9ms p95 frame time, versus 17.7ms for an empty page. Precise coordinates, the 1000% zoom, saved pressure toggle and existing ink renderers remain. TypeScript/scoped lint, 53 unit tests, 72 distinct production browser workflows after focused corrections and Windows/Linux native checks pass; one optional private Flexcil fixture skipped. The APK retains the development certificate. See [notebook performance validation](notebook-performance-2026-10-04.md) and the delivery's `VALIDATION.md` for evidence and physical-device limits.

The prior 0.1.14 delivery is preserved in `releases/2026-10-04-precise-ink`. It removed coordinate stabilization from new handwriting. Its 49 unit tests, 27 targeted browser workflows and native desktop checks passed; see [its validation record](precise-ink-2026-10-04.md).

The prior 0.1.13 delivery is preserved in `releases/2026-10-04-notebook-ink`; its coordinate smoothing was rejected and superseded by 0.1.14. See [its validation record](notebook-ink-2026-10-04.md).

The previous 0.1.12 delivery remains in `releases/2026-10-03-final-polish`; see [final polish and validation](final-polish-2026-10-03.md). The records below describe the original release.

The sections below describe the earlier 0.1.0 distribution. The maintained Slate application's 2026-10-01 update, local packages, and current evidence are in [refinements-2026-10-01.md](refinements-2026-10-01.md) and [validation-2026-10-01.md](validation-2026-10-01.md). The new Android artifact is a debug preview, not a newly signed release update.

Slate 0.1.0 provides the shared study core, an independent offline-capable static build, x64 Windows/Linux application packages, and a Debian/Ubuntu package. The Android project now provides a signed release APK. These are preview builds; physical-device release validation remains open.

## Verified in this build

The clean-checkout build, type check, core suite and production-browser suite were rerun on 2026-10-01. Playwright generates its own PDF, DOCX and image fixtures automatically; local-image checks verify decoded pixels rather than only a completed request.

TypeScript checking and the production build pass. Thirteen unit tests exercise data integrity and core behavior: atomic initialization and saves, stale-write conflicts, independent page duplication, segment erasing and pressure-preserving movement, code-aware note links, bounded revision history, explicit history checkpoints, preference persistence, and validated additive backup restoration with attachment remapping.

Ten Playwright workflows pass against the built production server and, separately, the independent static build in Chromium:

- Markdown Live Preview, Source and Reading preserve the same source, local images, wiki links, backlinks and saved content.
- Live task toggles and wiki completion update Markdown directly; long-note mode changes preserve reading context.
- Quick Note remembers paper appearance; notebook ink supports undo, redo, selection, movement, page duplication, reordering and reopening. The checks verify that existing ink is actually painted immediately on open and after reload, including development effect replay.
- Pen pressure persists; touch pans by default and finger writing requires the explicit toggle.
- PDF and DOCX imports render locally. PDF annotations export separately while the original bytes remain unchanged, including rotated pages.
- Workspace backups download, validate and restore as additional copies.
- Keyboard search, folders, Trash and Undo complete a recoverable organization flow.
- Light and dark desktop and phone states pass the automated accessibility checks; narrow and tablet layouts stay within the viewport.
- The production shell reopens saved notes, renders math, searches and writes ink with the network disabled, including a subsequent reload.

The final screenshot batch covers desktop at 1440×960, landscape tablet at 1280×800 and phone at 390×844. Eight checked states report zero Axe violations and no browser runtime errors. The tablet capture is visual evidence; it is not a separate Axe result.

These checks use Linux Chromium and emulated touch/pen input. They establish the browser workflows, not a hardware latency benchmark or a physical-device result.

## Deployment and local packages

Anonymous production checks reached the hosting provider’s sign-in screen for both hosting project configurations. The service-reported URL does not establish account-free access, and the public smoke check has not passed. This hosting gate is external to Slate’s document and persistence code.

A separate static build and local platform shells remove that dependency. Desktop uses a stable loopback origin and an isolated application profile, with saves flushed before normal close. Android uses Capacitor’s bundled HTTPS origin, device Back/pause behavior, and the native system Save dialog for exports. Both x64 desktop application folders were generated successfully. The Linux executable passed a real virtual-display smoke flow: launch, edit, immediate ordinary close, reopen with retained content, write ink, export a valid eight-document backup, and reload offline with ink retained. An injected flush failure kept the window open; a subsequent successful flush allowed it to close. The capture is ../.impeccable/review/linux-native.png. This container test disables the Chromium sandbox only in its test invocation; the packaged application enables its renderer sandbox by default.

The Debian/Ubuntu package is assembled from the same verified Linux application, with an OS launcher and sandbox helper metadata. Package inspection checks architecture and payload; installing the package on a physical distribution remains a release check. The Windows executable has been packaged but has not been launched on Windows.

The user authorized Google’s SDK terms on 2026-10-01. Platform 36/build tools 36.0.0 installed, and debug/release compilation succeeds. The signed release APK passes apksigner verification against the preserved certificate, archive integrity, and byte-for-byte public download checks. Its native Save plugin is present in the compiled dex payload. The build disables WebView debugging. See [downloads.md](downloads.md) and [the Android manifest](releases/0.1.0-android.json). The signed release also installs in the disposable API 36 emulator with debugging disabled. Runtime workflows are blocked: the emulator crashes in its system WebView before rendering. A minimal Activity with a WebView and static HTML, without Slate or Capacitor, reproduces the same SIGTRAP at the same library address. Disabling emulator GPU/Vulkan does not resolve it. See [the runtime evidence](../.impeccable/review/android-runtime.json). Android editing, native Save, lifecycle, offline reopening and stylus checks remain unverified; compilation and installation do not establish those behaviors.

## Release validation still required

Install and run on physical Windows, Linux and Android systems. Check actual stylus latency, pressure curves, device palm rejection, pinch positioning, long writing sessions, large notebooks and PDFs, Android lifecycle/storage behavior, and platform screen readers. Validate the unsigned desktop packages and signed Android preview on target devices before calling this a finished cross-platform release.

Keep regular portable backups. Storage is local to the desktop application profile, Android installation, or browser origin/profile; clearing that data or uninstalling with data deletion removes the local workspace. Slate requests persistent storage when the browser permits it and reports save failures, but a portable backup remains the recovery path across devices and profiles.

## Reproduce the checks

From app/ with Node 22+ and Bun installed:

    bun install --frozen-lockfile
    bun run typecheck
    bun run test
    bun run build
    bunx playwright install chromium

Start the built application in one terminal:

    bun tests/browser/serve-built.mjs

Run the browser suite in another:

    SLATE_TEST_URL=http://localhost:3001 SLATE_PRODUCTION_TEST=1 bunx playwright test

Playwright creates its own sample documents before each run. To smoke-test a deployed HTTPS origin, set SLATE_TEST_URL to its actual URL and run bun tests/browser/smoke-release.mjs. This checks desktop and phone launch, saved content, and offline reload in isolated browser profiles.

See architecture.md for the persistence and document contracts. Design-system tokens and visual guardrails live in ../DESIGN.md and ../.impeccable/design.json.

## Reproduce independent checks

Build and serve the provider-independent bundle:

    bun run build:standalone
    bun tests/browser/serve-static.mjs

In another terminal:

    SLATE_TEST_URL=http://localhost:3002 SLATE_PRODUCTION_TEST=1 bunx playwright test

Build desktop packages and run the Linux smoke check with a display available:

    bun run package:desktop
    bun run test:desktop:linux
    bun run package:linux

The cloud-container smoke invocation uses Xvfb and SLATE_CI_NO_SANDBOX=1. That flag is confined to the test and is not a release launcher option. See platforms.md and ../README.md for Android prerequisites and packaging commands.

## Download verification

Windows, Linux, Android and independent web archives were uploaded and then downloaded through their anonymous public file URLs. All downloaded byte counts, SHA-256 hashes and ZIP integrity checks match the built files. See [downloads.md](downloads.md) for the files and exact artifact manifest. This is independent of the failed anonymous hosted-app smoke check.
