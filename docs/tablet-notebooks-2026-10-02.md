# Tablet notebooks - 2026-10-02

Slate 0.1.8 (Android versionCode 9) improves pen tracking, reduces toolbar space, brings phone drawer gestures to tablets, and removes reserved space around the mobile document view. The same source serves Windows, Linux, Android and independent web. Slate's typography, colors and paper treatment are preserved.

| Area | Result |
| --- | --- |
| Handwriting | New strokes use direct, pressure-aware segments through the pen samples. Extending a stroke cannot reshape its earlier segments. Coalesced samples and the final lift location are included; the page edge clips ink instead of forcing points onto its boundary. |
| Toolbar | One compact row holds a grip, drawing tools, one color swatch, history and options. Tap an already selected pen or highlighter for thickness; tap the swatch for colors. Drag the grip anywhere within the paper area. Position, color, width and page-panel visibility survive reloads. |
| Tablet navigation | Coarse-pointer devices use the existing finger-tracked edge drawers regardless of landscape width. Swipe inward from the left for files or right for links and outline; swipe outward to close. Edge taps and document-menu actions remain accessible alternatives. The notebook pages toggle stays visible. |
| Screen coverage | Compact documents remove the hidden top chrome's reserved space. Android hides the status and navigation bars through Capacitor SystemBars while retaining actual display-cutout and keyboard inset handling. |

The pen takes priority over touching palms. A palm that arrives before pen contact cannot leave a stray dot. Intentional two-finger pan, zoom and double-tap undo remain available, including when the nib is hovering. Touch drawing is still optional.

Selection, panning, redo, touch drawing, rotation, scaling and deletion remain available through Ink options. Phones put secondary tools in that menu to keep the row compact; visible touch controls retain 44-pixel targets. Drag positions are clamped when the viewport rotates, and a focused grip can also be moved with arrow keys.

Existing strokes retain their original renderer and saved geometry. Only new strokes carry the optional `direct` rendering marker, which survives backups, transforms, thumbnails and exports. Older backup manifests receive defaults for the added preferences; the backup schema version remains compatible.

## Validation

All 45 unit tests pass. Across the complete browser run and corrected targeted reruns, 49 distinct production workflows pass; the optional real Flexcil fixture is skipped. The final input change also passes all five tablet workflows and the existing two-finger workflow. Checks cover sharp pen turns, coalesced events, final lift position, stable stroke prefixes, palm rejection, hovering-nib gestures, reload persistence, toolbar touch interactions and dragging, viewport rotation, both drawers, phone control sizes, and light/dark accessibility.

TypeScript and production builds pass. Scoped ESLint exits with zero errors and ten warnings, including existing hook warnings and toolbar hook/fast-refresh warnings. Packaged Windows smoke passes saving, immediate-close recovery, relaunch, ink, width/zoom, offline reload, backup download and save-failure recovery in an isolated profile.

Android signature verification passes, and its debug certificate matches the previous 0.1.7 development APK. The application ID and HTTPS localhost origin are preserved. All 346 web files in each desktop ASAR and the APK match the final standalone bundle byte for byte. Package copies, ZIP integrity, Linux tar paths/executable permissions and SHA-256 hashes are verified.

Physical tablet/stylus feel, native fullscreen and keyboard behavior have not been tested on hardware. Linux runtime is also untested. Browser emulation validates layout and event handling but cannot establish hardware latency or device-specific pen pressure behavior.

## Delivery

`releases/2026-10-02-tablet-notebook` contains Windows/Linux x64 folders and archives, independent web files/ZIP, the Android debug APK, previews, instructions and checksums. Preserve existing desktop profiles and the web origin. A release-signed Android installation needs its preserved release key for an update; the debug preview cannot replace it.

Native bar configuration follows the official [Capacitor SystemBars documentation](https://capacitorjs.com/docs/apis/system-bars). Flexcil handwriting and synchronized audio remain undecoded; see [flexcil-import.md](flexcil-import.md).
