# Platform delivery

Slate 0.1.0 shares one React/TypeScript study core. A small platform boundary adapts application lifecycle, external links and exports. The hosted provider is optional for local packages.

## Independent web build

standalone.html and src/standalone-entry.tsx are the local application entry. vite.standalone.config.ts builds dist/standalone, including self-hosted fonts, worker modules, icons and the generated offline shell. The entry includes no hosted router, account flow or design inspector. Its content policy allows local application resources and local attachment blobs; note rendering remains sanitized.

Use a stable HTTPS or localhost origin. Changing a browser origin, port or profile creates a separate workspace; export a portable backup before moving it. A static host does not receive document content.

## Desktop

Electron packages the independent assets. A static server listens only on 127.0.0.1:47421. This fixed origin keeps the IndexedDB workspace consistent across restarts. A second instance focuses the first; an occupied port produces a readable startup error instead of silently opening another origin.

The renderer has context isolation and sandboxing enabled, with Node integration disabled. It receives no general filesystem or command-execution bridge. External HTTP/HTTPS links open in the system browser. Exports use the normal file download flow.

On ordinary window close, the main process waits for the workspace flush before destroying the window. A flush failure keeps the window open and explains that the latest edits remain in memory. Force termination and power loss still require the recovery history and portable backups.

The application profile is separate from a user's web browser. Updates replace application binaries while retaining the OS app-data/Slate directory. Uninstallation of the Debian package removes program files, not a user's workspace.

package.cjs creates x64 Windows and Linux folders. package-linux.cjs assembles the Debian/Ubuntu package without installing it on the build machine. The package sets root ownership and the expected setuid mode on Chromium's sandbox helper; desktop execution remains under the normal user. The portable Linux folder requires a compatible system sandbox configuration.

## Android

Capacitor serves bundled files from its stable https://localhost WebView origin. Native Android does not register the web service worker; installed APK assets provide its offline shell and code updates. The app requires Android 7+ and targets API 36. Browser local storage is private to this installation. Android automatic cloud backup is disabled; Settings exports are the explicit transfer and recovery path.

Back first closes transient surfaces, returns an open document to the library, or leaves a folder. At the library root it flushes pending work before minimizing. Pausing also requests a flush. These hooks supplement the per-edit writer; an OS kill cannot be assumed to await JavaScript.

Exports stage a private cache file and open Android’s ACTION_CREATE_DOCUMENT Save dialog. A narrow native plugin reads only Slate’s exports cache, copies to the chosen URI in 64 KiB chunks, and reports success after the destination stream closes. Cancellation returns without a success message. Concurrent requests are rejected while a copy is pending. Temporary staging files are retired after completion. No broad storage permission is requested. External links open through the platform browser.

The adaptive application uses a navigation drawer and bottom navigation on phones, and larger pane layouts on tablets. Touch pans ink by default; finger writing is explicit. Pen events use pressure and coalesced samples; physical-device palm rejection and latency have not been measured.

## Build and release limits

The source pins dependencies in bun.lock. Desktop binaries are unsigned preview packages; Android has a preserved release signature. A Windows package created on Linux is packaging evidence, not a Windows launch result. The Linux smoke check runs a real packaged executable under a virtual display; its container-only test invocation disables the Chromium sandbox. Production launch does not set that flag.

The user explicitly authorized Google’s SDK terms. Android SDK platform 36/build tools 36.0.0 installed successfully, and both debug and release variants compile. The release passes APK signature and ZIP integrity checks and has WebView debugging disabled. Its encrypted signing identity is preserved for future updates; see ../platform/android/SIGNING.md. The signed APK installs in the API 36 emulator. That emulator fails inside its system WebView; a minimal WebView app without Slate reproduces the crash. Native workflows remain unverified. See [the runtime evidence](../.impeccable/review/android-runtime.json). Physical-device checks remain open.
