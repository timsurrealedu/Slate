# Flexcil migration in the maintained Slate build

The importer is in `src/slate/import/flexcil`. Import accepts `.flex` library backups and individual `.flx` documents. It opens the supplied file read-only, recovers original PDFs into annotatable Slate documents, and preserves each complete `.flx` as an original asset. Use **Export original Flexcil** inside the imported document to retrieve it. Workspace backups include those originals.

Flexcil handwriting, highlights, shapes, text objects, image placement, page rearrangements, added native pages, templates, and audio/stroke synchronization have **no verified decoder**. Slate cannot display or edit those Flexcil objects. The import report and document banner disclose this. A notebook without a recovered PDF receives blank placeholder pages; its preserved source remains recoverable. Keep Flexcil for viewing existing handwriting until a decoder is verified.

## What was worth adapting from the legacy prototype

- The seekable ZIP/ZIP64 reader, nested `.flx` container findings, CRC checks, and path/encryption/size validation.
- Per-document staging, cancellation, stable fingerprints, duplicate prevention, original preservation, and honest import reports.
- Structural research, preserved in `flexcil-format-legacy-research.md` as historical reference.

the legacy prototype's UI, Tauri persistence, and `.slate` document model were incompatible with the maintained Slate application and were not merged. Its legacy research's optimistic predictions are not a verified handwriting decoder.

## Fresh evidence (2026-10-01)

- Synthetic browser import through OPFS recovers a PDF, saves new Slate ink, skips an unchanged reimport, and exports `.flx` bytes exactly matching the input, after temporary-file cleanup.
- The owner's local backup was opened read-only in an isolated browser profile. This importer recovered **17 documents, 17 PDFs, and 17 original PDF pages**. No private note text or archive entry names were written to the test report. Flexcil's added/rearranged pages were not reconstructed.
- the legacy prototype previously reported 34 structural pages and 195 source records. Those historical counts describe its mapping and must not be presented as this importer rendering 34 pages or decoding handwriting.
- Integrity tests cover source preservation through backup/restore, duplicate detection, cancellation, unsafe paths, and atomic document/asset commits.

## Bounds and recovery

The outer backup is read through file slices. Only one nested document is staged at a time. Limits: 20,000 entries, 16 MB central directory, 256 MB per `.flx`, 100 MB per recovered PDF, 4 MB for parsed JSON, and a maximum 100:1 declared compression ratio. Without OPFS, nested documents are capped at 64 MB. The source asset is materialized before deleting its temporary file, so import memory is bounded by a document rather than by the whole library.

Cancellation stops before the next atomic document commit; documents already imported remain saved. Failed imports leave existing documents and annotations untouched. Reimport skips matching source-entry/fingerprint pairs within the current workspace or vault, protecting later Slate ink. Different exports of the same document can produce a separate import; no fuzzy merging is attempted.

The current portable backup importer retains its existing 256 MB compressed / 512 MB expanded limits. Large Flexcil sources can exceed a device's available storage or backup limits; original `.flx` files remain individually exportable.

Next decoder work needs controlled Flexcil fixtures containing one known feature each, including recordings, pressure, highlighting, transforms, inserted pages, and image/text objects. Never invent stroke coordinates or audio timing from opaque payloads.

## Static format findings (2026-10-19)

Decompiling Flexcil 1.5.0.13 (`AnnotationManagerBase`, `JDrawingTypeAdapterForSerialize`, `jf.c`) shows the handwriting record. Each page stores `<pageKey>.drawings` (with a `_back` copy), a JSON array of drawings with `figure`, `points`, `start`, `mode` (pen type), `dashtype`, `fillColor`/`strokeColor` (ARGB), `key`, `type`, `scale`, `rotate` and optional `seed`/`phase`. `points` is base64 of a little-endian `u32` count followed by `f32 x, f32 y, f32 width` per point, relative to `start`; readers apply `point × scale + start`. No pressure or timing is stored.

This is derived from code, not checked against a real `.flx`, so it is still not a verified decoder. The import limitations above still apply. See `flexcil-ink-2026-10-19.md` for the pen mechanics.
