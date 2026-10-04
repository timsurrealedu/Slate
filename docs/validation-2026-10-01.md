# Validation — Slate refinements, 2026-10-01

| Check | Evidence |
| --- | --- |
| TypeScript | `tsc --noEmit` passes. |
| Core integrity | 21 tests across 5 files pass: existing storage/recovery behavior; connected vault write-through, reconnect, retained metadata and restored notes; external conflict recovery; failed-refresh protection; traversal denial; Flexcil source preservation, backup restoration, cancellation and duplicate prevention; table serialization and pressure-preserving transforms. |
| Production Chromium | 18 workflows pass, with `SLATE_PRODUCTION_TEST=1` and the owner's optional read-only Flexcil fixture. Coverage includes Markdown modes, search/links/images, PDF/DOCX, ink and recovery, backups, mobile/dark accessibility, shared gutters/layout, Vim, first-use offline equations, visual tables, transforms, two-finger gestures, Android hardware-key detection, and exact source-byte recovery through OPFS cleanup. |
| Fresh Flexcil sample | 17 recovered PDF documents / 17 original PDF pages. Existing handwritten objects and additional Flexcil pages are not decoded. Tests use an isolated browser profile. |
| Independent web | Production build succeeds with all fonts, math/PDF modules and service worker bundled. The shell, notes, ink and equation composer work with browser networking disabled. |
| Windows package | Packaged executable passes ordinary close/reopen, immediate-close saves, pen ink, backup download, offline reload, save-failure retention, and a separate actual-folder vault test covering local images, original-file writes, reopen and switching back to the preserved local workspace. Tests use hidden windows, separate profiles, and a separate local test port. |
| Linux package | x64 Electron package built from the same current source. No new Linux runtime result is claimed from this Windows session. |
| Android | Capacitor sync and JDK 21 / SDK 36 Gradle `assembleDebug` succeed. The new native folder plugin compiles. `apksigner verify` verifies the debug APK's v2 signature. No new release-key signing, physical-device or provider-runtime claim is made. |

Browser results: `artifacts/browser-results.json`. Native results: `artifacts/desktop-smoke.json`, `artifacts/desktop-vault-smoke.json`. Build logs: `artifacts/build-standalone.log`, `artifacts/build-android.log`. Package checksums are recorded with the dated runnable packages. The historical 0.1.0 remote download manifests do not describe these new artifacts.

Commands use the repository's existing Playwright/Vitest harness. Hardware-key detection is tested with an Android user-agent plus real synthesized keyboard events; gestures use Chromium's touch-event synthesis. This establishes application behavior in Chromium, not palm rejection, hardware latency, Android TalkBack or filesystem-provider behavior on physical devices. Those, and Linux runtime validation, remain release checks.

The updated APK is signed with a development key. It cannot update the previously signed release installation. The owner must supply the preserved signing recovery password to produce a release update; retain existing app data and export a backup before installation changes.
