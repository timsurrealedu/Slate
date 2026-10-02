# Android packaging and hidden descendants

Hidden visibility now checks both the display name and stored path, accepts slash and backslash separators, and follows path-based parents even when a cached folder has a null parentId. Dot-prefixed folders hide their complete subtree, including documents with ordinary names. Relative path markers `.` and `..` are not hidden names. The common visibility filter supplies library navigation, recent documents, search and link completion; hiding retains stored notes.

Android debug/release build helpers now typecheck, rebuild and synchronize web assets before Gradle assembly. They compare every standalone bundle file against its APK entry and run apksigner verification. Release builds verify the preserved certificate and refuse to assemble without signing credentials. Android versionCode is 2, versionName 0.1.1; application ID and HTTPS localhost origin remain unchanged.

Verification: 32 unit tests and all four library/tags browser tests passed. JDK 21 / SDK 36 debug assembly, signature verification, full bundled-file comparison and aapt manifest parsing passed. The unsigned-release dry run failed with the intended signing-credentials message. The older 2026-10-02 debug artifact also passes apksigner and aapt; no malformed APK was reproduced. Its debug certificate differs from the original release certificate, preventing an update over that release.

No device is attached and no local Android emulator is installed. The owner's reported installation failure remains unconfirmed: the failing APK filename, Android version and existing-installation status are needed. A release update requires the private signing recovery password file; no new release-key-signed artifact was produced. Retain any populated installation.
