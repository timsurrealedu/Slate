# Slate

A local-first study and knowledge workspace for Markdown, linked notes, page-based handwriting, PDFs and DOCX. The workspace stays on the device without an account.

The 2026-10-01 refinements add connected vault folders, Vim, universal line numbers and layout, visual tables/math, ink transforms and gestures, and source-preserving Flexcil import. See [the usage guide](docs/refinements-2026-10-01.md) and [Flexcil findings](docs/flexcil-import.md). Updated local packages are in `releases/2026-10-01`; older distributed releases are historical.

## Run and check

Use Node 22+ and Bun:

    bun install --frozen-lockfile
    bun run dev
    bun run typecheck
    bun run test

The independent application build has no hosted application runtime:

    bun run build:standalone

Its output is dist/standalone. Serve it over HTTPS or a stable localhost origin. The first browser load installs the offline shell; subsequent launches work offline. The source also retains the provider-specific deployment build, bun run build, with dist/server and dist/client output.

## Windows and Linux

Build the independent application, then:

    bun run package:desktop

This produces x64 Windows and Linux application folders in artifacts/desktop. Keep each folder's contents together. Windows launches Slate.exe; Linux launches Slate. Node, Bun and a network connection are not needed to run the resulting application.

On a Linux build machine with dpkg-deb installed, create the Debian/Ubuntu package:

    bun run package:linux

The result is artifacts/slate-0.1.0-linux-amd64.deb. It includes the launcher, application icon and root-owned Chromium sandbox helper. The application itself runs as the signed-in user.

These are unsigned preview packages. The current Windows package passes native persistence, offline, save-failure, and connected-vault smoke tests. The rebuilt Linux package has not been run on Linux in this Windows session. Physical-device release checks remain outstanding.

## Android

The tracked Capacitor project bundles the same independent application. It uses touch navigation, device Back behavior, lifecycle save flushing and the native system Save dialog. It requires Android 7 or newer.

Use JDK 21 and Android SDK platform 36/build tools 36.0.0, with the SDK terms accepted by the developer:

    bun run build:standalone
    bun run android:sync
    bun run android:build

The updated debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. On Windows, run `android/gradlew.bat assembleDebug` from the Android directory. The owner authorized Google's SDK terms on 2026-10-01. This session compiled the updated shared app and native folder plugin with JDK 21 / SDK 36. The older signed preview in docs/downloads.md is historical; its emulator validation was blocked by a system WebView crash. The new debug APK cannot update a release installation with a different signing identity. Native folder providers, Save, physical stylus and lifecycle checks require device validation.

Signed updates use the encrypted development signing identity described in [platform/android/SIGNING.md](platform/android/SIGNING.md). Build with bun run android:release --password-file /private/path/slate-signing.password after synchronizing the independent assets. The password is a development credential, not an app login.

## Data and recovery

IndexedDB stores versioned documents, recovery history and original files. Export portable .slate.zip backups in Settings. Restore validates hashes, adds fresh copies and leaves existing documents intact. Trash is reversible. Markdown exports as .md; notebooks as PDF; imported PDFs as preserved originals or annotated copies; DOCX retains its original.

Desktop data lives in the OS application-data directory, under Slate: %APPDATA%\Slate on Windows, and normally ~/.config/Slate on Linux. Replacing the application folder preserves that profile. Android data is private to the installation; automatic Android cloud backup is disabled. Browser data belongs to its exact origin and browser profile. Export before uninstalling, clearing data or moving to another device.

## Architecture, design and evidence

See [docs/downloads.md](docs/downloads.md) for the verified preview files and updated source archive, docs/architecture.md for the data contract, docs/platforms.md for platform boundaries, and docs/release-status.md for verification and limits. PRODUCT.md records the requirements; DESIGN.md and .impeccable/design.json describe the implemented visual system.

See [current validation](docs/validation-2026-10-01.md). The independent build passes 18 production Chromium workflows, including first-use offline math and Flexcil OPFS source recovery. The current Windows package has separate persistence and native-vault smoke checks. No physical stylus or new Linux runtime result is implied by browser emulation. Desktop and independent web packages run without a hosting provider.
