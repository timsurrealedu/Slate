# Library fixes — 2026-10-02

Slate 0.1.7 (Android versionCode 8) fixes canceled drags, exported Markdown tag properties and content visibility in library thumbnails. The established typography, theme tokens and paper treatment are preserved. Development remains in `.`.

| Before | After | Why |
| --- | --- | --- |
| Canceling a drag sometimes leaves the library blue. | Drag end, Escape, outside drops, focus loss and page hiding clear every drop highlight. Touch cancellation also removes its floating label and restores the source. | One shared drag lifecycle cleans up targets and listeners, including terminal events captured outside the source. A later valid drag still works. |
| Some exported notes show `## tags: \[latihan, uas]` as text. | Standalone bracketed tag properties render with Slate's clickable chips in reading and live preview, appear in library tag filters, and stay out of the outline. | These exports use Markdown properties rather than YAML. Escaped brackets, quoted values and optional heading markers are recognized without rewriting the source. Code examples, comments and malformed properties remain protected. |
| A leading rule, spacer or long tag heading occupies the thumbnail. | Previews put compact tags and actual body content near the top. Tags occupy at most two rows; initial empty blocks and rules are omitted, with smaller thumbnail margins. | Cards remain readable at desktop and mobile widths. Rules within the body and full-note spacing remain intact. |

YAML frontmatter also accepts a BOM and leading blank lines while keeping original source offsets and line numbers. Complete leading comments are removed before the preview's source budget is applied; indented code retains its indentation.

The fidelity checks found that opening a CRLF note could trigger a whole-document replacement and save normalized LF text. External editor synchronization now compares CodeMirror text correctly and does not call the user-edit save callback. Real edits preserve CRLF when the note uses it. Viewing, rendering and filtering do not change the note's stored content.

## Verification

All 43 unit tests and 44 production Playwright workflows pass. Six new browser regressions cover native drag events, a real Chromium mouse drag canceled with Escape, touch cancellation and a subsequent valid move, leading YAML with CRLF edits, exported tag filtering in both modes, and thumbnail positions in light/dark desktop/mobile layouts. The optional real Flexcil archive test was skipped because its fixture was not supplied. The generic export fixture matches the reported syntax; the owner's vault was inspected read-only.

Three packaged Windows workflows pass in isolated profiles: library drag/tag/preview fidelity; saving, immediate-close recovery, relaunch, offline use, backup export, zoom and pen behavior; and vault write-through, local images, rename/stable IDs, external folder deletion and local workspace retention. The native library test dispatches drag events; the physical mouse regression runs in Chromium. The owner's running profile was not used.

TypeScript, standalone and provider production builds and `git diff --check` pass. Scoped ESLint exits successfully with three existing asset-effect dependency warnings in `MarkdownEditor.tsx`. The design-taste review used preservation mode; light/dark screenshots at 1440 and 390 pixels show readable content near the top, and the full browser accessibility checks pass.

## Packages

`releases/2026-10-02-library-fixes` contains Windows/Linux x64 folders and archives, an amd64 Debian installer, independent web files/ZIP, a signed debug APK, instructions and SHA-256 checksums. Each desktop ASAR's 346 web files matches the final standalone bundle byte for byte. The Android helper and package copy verify APK assets and signatures; package metadata is 0.1.7/versionCode 8. ZIP integrity and Linux archive executable/sandbox permissions are verified.

Close an older Slate before launching the Windows update. The existing `%APPDATA%/Slate` profile and local origin are retained. Independent web hosting must preserve its origin and serve `.mjs` as JavaScript and `.wasm` as WebAssembly; the package includes a Python localhost server.

Linux runtime and physical Android/stylus behavior were not exercised. The debug APK retains the previous development certificate and cannot update a release-signed Android installation. Keep its workspace and use the preserved release signing identity for an update. Flexcil handwriting and synchronized audio remain undecoded as documented in [flexcil-import.md](flexcil-import.md).
