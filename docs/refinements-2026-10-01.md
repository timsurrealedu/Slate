# Slate refinements — 2026-10-01

The maintained source is `.`. Root `AGENTS.md` and `PROJECT.md` record this direction. `.local/legacy/LEGACY.md` marks the other build as research only. Slate's fonts, colors, navigation, and independent paper treatment are preserved.

## Using the changes

1. **Open a vault:** the top bar's **Open vault → Open vault folder** connects an existing folder. Windows/Linux use the native directory picker; Android uses its system document-tree picker; supported desktop browsers use File System Access on HTTPS/localhost. Nested `.md`, `.markdown`, `.txt`, and `.slate-notebook` files are indexed. Markdown writes back to its original file. Local Markdown and Obsidian image embeds resolve within the selected folder. `.obsidian`, hidden files, and filesystem symlinks are not modified. **Vault → Refresh vault files** rereads external changes; **Open local workspace** returns to the retained local library.
2. **Line numbers:** toggle the numbered-list icon beside **Note layout**, or **Settings → Markdown → Show line numbers**. The same saved preference applies to Source, Live preview, and Reading. Reading labels rendered blocks with their starting Markdown source line. Gutters follow Slate's theme and align with their lines.
3. **Vim:** enable **Settings → Markdown → Vim keybindings**. Standard modal editing, motions, operators, visual selection, undo, search, and `:w` are available in editing modes. `:set number`, `:set nonumber`, `:set number!`, and `nu` aliases change the universal preference. Reading supports `j/k`, `gg/G`, Ctrl-D/U/F/B, and the same number commands. Android activates Vim on a detected hardware keyboard event, leaving ordinary soft input alone.
4. **Creation:** **+ New note** offers exactly **Markdown** and **Notebook**. The redundant library buttons and Quick Note creation/navigation are removed. Existing notes and folders are retained.
5. **Selected ink:** select strokes, then drag a corner to resize or the round handle above the selection to rotate. The transform menu also provides keyboard-accessible scale and rotation buttons. Transforms keep pressure/timing and remain undoable. Two fingers pan with any tool, including when finger drawing is enabled; pinch zooms. Double-tap with two fingers to undo.
6. **Tables and equations:** the table icon opens a row/column grid with editable cells. Clicking a rendered table cell in Live preview reopens the grid for edits. The equation icon opens a visual math field with fraction/root/power/integral/matrix templates and familiar shortcuts such as `/`, `^`, `sqrt`, and `pi`. Both save ordinary Markdown/LaTeX and work offline, with bundled fonts.
7. **Library:** the top-right **+ New note** is the remaining library creation entry.
8. **Layout:** **Note layout** sets column width, left/right margins, and left/center/right placement. Settings persist across notes, reloads, and all three Markdown modes.

Slate caches connected-vault documents for offline reopening. It checks external file content before writes and preserves edits on failure; a conflict can be saved as a new local copy. Folder refresh preserves tags, starred state, Trash, and restored/imported documents. Portable backup restore makes additional copies and does not reconnect or overwrite original external files. Imported PDFs/DOCX/Flexcil and their original assets remain in Slate's local cache for the selected vault; connecting a folder does not synchronize those caches between devices. Library title/folder metadata does not rename existing external files.

## Validation and packages

See `validation-2026-10-01.md` for exact evidence and platform limits. Dated runnable packages live in `releases/2026-10-01`. Earlier packages remain available. Close an older running desktop Slate before starting the updated desktop package; both use the existing Slate application-data profile.

Android's updated **debug** APK is a development preview. It cannot replace an existing release installation signed with Slate's preserved release key. A signed update requires the owner's recovery password, described in `platform/android/SIGNING.md`; never uninstall a populated release workspace to bypass that difference.

Flexcil migration evidence and undecoded features are documented in `flexcil-import.md`.
