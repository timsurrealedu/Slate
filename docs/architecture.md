# Architecture and data contract

Slate is a local-first workspace with independent static, Electron desktop and Capacitor Android entry points. All document operations take place on the device. The platform shells bundle the same study core; a hosted shell only distributes application code and receives no user notes, ink or files. See platforms.md for packaging, storage origins and lifecycle behavior.

## Boundaries

- core/model: versioned document, paper, ink, folder and workspace types.
- core/storage: IndexedDB transactions, compare-and-swap saves, revision retention, binary assets and portable backups.
- core/workspace: external application store; serialized immediate persistence and explicit save failure state.
- markdown: CodeMirror 6 source, live decorations and sanitized shared Markdown rendering.
- ink: pointer sampling and pressure, geometry, rendering and page-local undo history.
- documents: PDF.js and Mammoth adapters, immutable source assets and annotation overlays.
- ui: adaptive library, tabs, commands, context and settings.
- platform: native lifecycle, external links, exports and connected vault adapters; desktop packaging stays outside the shared application.
- import/flexcil: bounded seekable container reader, PDF recovery, immutable original sources, fingerprints and import reports.

## Persistence

Schema version 1. Each document is an independent record with a monotonically increasing revision. A read/write transaction checks the expected revision before replacing the document, and retains an earlier checkpoint in the same transaction, at most once every 30 seconds. Restoring a historical revision explicitly checkpoints the current document first, even inside that 30-second interval. Old history is bounded to 20 revisions. Blob assets are stored independently. Initial document creation plus associated file data is atomic. UI reports Saved only after transaction completion.

Writes start on every edit, outside the input path. The per-document writer coalesces changes while a transaction runs, serializes subsequent writes and retains a dirty in-memory copy on failure. It never pretends a failed save succeeded. The status indicator exposes pending work. Normal desktop close awaits a flush and preserves the window on failure. Browser termination, Android process death and power loss cannot be assumed to wait for pending writes. Multiple windows use revision conflicts and a broadcast notification. A conflicting local edit can be saved as a new document.

Trash is reversible. Backup export includes the versioned manifest, documents, folders, preferences and original assets, with SHA-256 hashes. Restore preflights schema, references and hashes before an atomic additive import, and gives restored documents fresh IDs to avoid replacing existing work. Backups can be produced even when a save has failed.

## Markdown

Markdown text is authoritative. No rich text document model. Live Preview only decorates the CodeMirror document, revealing syntax on the active line. The same editor instance persists between source and live modes. Reading is sanitized GFM and KaTeX, with local wiki links. Raw HTML is disabled. The renderer blocks executable URLs and remote embedded images to avoid background network requests from notes. User-activated external links are allowed.

## Ink and annotations

Ink points are stored in unscaled page coordinates, including pressure and timestamp. Pointer events and coalesced samples update a canvas directly without a React render per point. A completed stroke uses perfect-freehand outlines. Highlighters are transparent; erasing deletes hit strokes; selection moves, rotates and scales ink without rasterizing it. Two fingers pan/pinch regardless of tool; double two-finger taps undo. Templates are independent of ink. PDF uses the same page-coordinate overlay and never edits the original source. Annotated PDF export writes a new file.

## Offline and upgrades

A generated service worker precaches the shell, hashed application modules, worker, fonts and icons. New code activates after explicit user action and a save flush. Service-worker caches contain application assets only. IndexedDB migrations are additive. Unsupported backup schema versions fail with a readable message.

## Verification limits

Current browser and Windows-native evidence is recorded in validation-2026-10-01.md. Android hardware keyboard detection is tested using Chromium's Android user-agent and synthetic keyboard events. Real Android document providers, palm rejection, stylus latency, and the rebuilt Linux executable require their own runtime/device validation.
