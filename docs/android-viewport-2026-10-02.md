# Android viewport coverage

Slate 0.1.9 (Android versionCode 10) removes reserved status/navigation-bar space from the immersive Android window. The owner reported light strips above the header and below the content on an Android tablet.

The shared root already has zero document margins and a `100dvh` app shell. Its four safe-area paddings consume Capacitor's CSS inset values. The reported strips are consistent with system-bar-sized insets reaching that shell, or native window padding outside the WebView. The tablet's actual inset values were not captured.

Android now owns immersive inset handling in `MainActivity`. The window explicitly draws to its edges and permits drawing around cutouts. Only physical display-cutout insets are published to the existing CSS variables. Hidden and transient system bars do not reserve space. Keyboard insets resize the native view once, with zero additional bottom safe-area padding while typing. Consumed bar/cutout insets are cleared before reaching child views, including their values when visibility is ignored.

Immersive mode is reapplied after resume, focus restoration and configuration changes. System controls remain available by an edge swipe. Insets are republished after a WebView page commit so reloads receive current values. `SystemBars.insetsHandling` is disabled to prevent a second native/CSS inset handler; the manifest requests keyboard resizing for older Android versions.

| Before | After | Why |
| --- | --- | --- |
| General system-bar insets could reserve space around fullscreen content. | Android publishes physical cutouts only and clears bar padding. | The header and content can reach the available window edges. |
| Bar hiding was configured for startup. | Resume, focus and rotation restore immersive mode. | Returning from system dialogs or rotating must not leave reserved strips. |
| Native inset behavior depended on WebView version. | Android applies keyboard resize and CSS cutout protection in one place. | Avoid duplicate padding while supporting older WebViews. |

The scope is a viewport repair for Slate's quiet study workspace (Operate; design variance 3, motion intensity 3, visual density 5). Existing Slate typography, tokens, paper, controls and shared web layout are preserved. Windows, Linux and independent web retain their existing viewport and browser safe-area behavior. This delivery contains the updated Android APK; desktop packages were not rebuilt.

## Verification

- TypeScript and scoped ESLint pass. All 45 unit tests pass.
- Seven production browser workflows pass, including a new viewport regression at the reported 1440 by 850 size. Checks cover the library, notebook, portrait rotation, dynamic cutout values, keyboard-sized viewport changes, reload, dark theme, drawers and ink interactions. Screenshots were inspected; no outer top/bottom strips remain in these browser layouts.
- Android debug assembly and APK signature verification pass. Version name/code and the embedded immersive configuration are verified. All 346 bundled web files match the final standalone build. The debug certificate matches the previous 0.1.8 debug APK, and the application ID and HTTPS localhost origin are retained.
- Android lint reports no issue in `MainActivity`. The full lint task fails on an existing `WrongConstant` error at `SlateVaultPlugin.java:50` for already-masked URI permission flags, with 27 existing manifest/resource/version warnings. This unrelated file was left unchanged.
- The design pre-flight scanner passes for the edited TypeScript files. The scoped visual review preserves the existing system, themes, reading type, control states, responsive behavior and paper. No UI copy, new motion, forms, decorative visuals or data displays were added.

No Android device or emulator was connected. Browser emulation verifies layout but does not execute Android's inset listener. Native fullscreen, display cutouts, transient system bars, keyboard show/hide, rotation and returning from a file picker still require tablet verification.

## Delivery

`releases/2026-10-02-android-viewport/android/Slate-0.1.9-android-debug.apk` is the verified update, with a neighboring SHA-256 file. The release folder includes instructions, browser previews, verification notes and checksums. Completed builds always go in `releases`; `artifacts` is internal staging. This delivery copies the already-verified APK without rebuilding or changing its bytes. It can update the previous debug build in place; keep the existing installation and notes. Release-signed installations require the preserved release signing identity.

The implementation follows Android's [immersive mode](https://developer.android.com/develop/ui/views/layout/immersive) and [edge-to-edge inset handling](https://developer.android.com/develop/ui/views/layout/edge-to-edge) APIs, and Capacitor's [SystemBars configuration](https://capacitorjs.com/docs/apis/system-bars).
