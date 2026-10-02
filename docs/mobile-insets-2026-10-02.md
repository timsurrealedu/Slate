# Mobile system bars and Settings label

The app now reserves all four system safe-area insets. Capacitor Android supplies `--safe-area-inset-*`; browser/PWA builds fall back to `env(safe-area-inset-*)`. Capacitor supplies zero when its native layout already applies the insets, avoiding duplicate padding on older WebViews. The mobile navigation no longer adds a second bottom inset. Insets update with rotation, cutouts and the keyboard.

The mobile Workspace tab is now labeled Settings and uses a gear icon. It retains the same settings-dialog action.

Validation: TypeScript, seven browser workflow checks including simulated native status/cutout/gesture insets, portrait and landscape, zero bottom inset for the keyboard, clickable top controls and Settings behavior; mobile screenshot reviewed. Android 0.1.4/versionCode 5 passes assembly and APK signature/embedded asset verification. Desktop bundles match the final independent web build. Physical Android status-bar and keyboard behavior remains to be checked on the user's device.

Packages: `releases/2026-10-02-mobile-insets`. The debug APK updates earlier debug builds using the same development key, but cannot update the original signed release. Retain existing installation data; a release update requires the preserved release-signing password.
