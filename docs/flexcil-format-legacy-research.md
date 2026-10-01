# Flexcil `.flex` / `.flx` import feasibility

**Research date:** 2026-09-29  
**Verdict:** **Partially feasible now; feasible for high-fidelity import after one controlled reverse-engineering spike.**

## Executive summary and recommendation

A real, user-supplied Flexcil backup was inspected **read-only and in place**. It is a standards-compatible ZIP container, not an opaque monolithic database. Its 20 outer entries include 17 nested `.flx` document bundles; every sampled `.flx` begins with ZIP magic. A small sampled document bundle contains a PDF, JPEG cover/preview, JSON index records, and opaque binary payload(s). The outer archive is unencrypted.

This makes a streaming, read-only importer practical for folder/document packaging and embedded PDF/image assets. However, the handwritten-annotation payload in the sampled bundle is binary and its schema was not derived from a single sample. Flexcil officially confirms that recordings synchronize to annotations, but neither its documentation nor this no-audio sample establishes the recording codec/container or backup storage path. Therefore do **not** promise lossless handwriting, shape, textbox, or audio-timeline import until a controlled fixture set is generated.

**Recommended design:** implement a two-layer importer: (1) a production-safe ZIP walker that imports known folders, documents, PDFs, JPEGs, covers, and metadata; (2) a versioned `.flx` decoder plug-in behind a capability gate. Preserve unknown binary payloads and a provenance manifest in the resulting `.slate` bundle when decoding is unavailable. Build a synthetic Flexcil fixture library—one feature per document, including a short recording—then map each binary payload by controlled diffs. Do not base decoding on heuristic parsing of a user’s private archive.

## Evidence and confidence

| Evidence | What it establishes | Strength |
|---|---|---|
| Local archive, inspected in place: `C:\Users\timsurreal\Downloads\11th Sem 1.flex` | ZIP magic `PK\x03\x04`; 20 entries; 17 nested `.flx`; no encrypted entries; 30,826,300 bytes uncompressed. | Strong, direct |
| Same local archive, one 73,911-byte `.flx` sampled in memory only | Nested ZIP layout; embedded PDF and JPEG; JSON index/metadata records; opaque binary payloads. | Strong, direct, but one document only |
| [Flexcil: How to backup and restore your data](https://support.flexcil.com/hc/en-us/articles/6857130951321-How-to-backup-and-restore-your-data) (updated 2022-09-16) | Flexcil creates/restores `.flex` backup files and lets a user select documents or folders. | Strong, official |
| [Flexcil: Audio recording and syncing](https://support.flexcil.com/hc/en-us/articles/8006910155801-Audio-recording-and-syncing) (updated 2023-07-27) | Audio links to annotations; playback can jump both directions; restarting makes a separate file; recording limit is six hours. | Strong, official |
| [Flexcil: backup/restore troubleshooting](https://support.flexcil.com/hc/en-us/articles/6556956000409-I-m-in-trouble-with-backup-and-restoring-data) (updated 2026-08-07) | Backup can require 2–3× temporary storage; mentions `invalidTextboxJsonData` and `failtoreadcontent`; Android app data lives under `Android/data/com.flexcil.flexcilnote`. | Strong, official |
| Public-source scan (official docs, GitHub-oriented search, forums/Reddit search) | No credible public `.flex`/`.flx` parser or complete format specification was found. SEO converter sites make unverified ZIP claims; they are not relied upon. | Moderate negative finding |

## 1. Container format and top-level layout

### `.flex` outer container

**Confirmed:** `.flex` is a ZIP-format container. The local backup has the ZIP local-file header magic `50 4B 03 04`, no archive comment, and no encrypted entries. Its outer central directory reports 20 entries, 17 of which have the `.flx` extension. Outer entries are organised beneath a common multi-segment directory prefix, plus two top-level metadata-like entries. Names are intentionally omitted here because they can contain library/note identifiers.

**Meaning:** treat `.flex` as a package of document bundles and library metadata, not as a single serialized document. Do not rename or modify the source; open it with a read-only ZIP reader.

### `.flx` document bundles

**Confirmed:** all 17 `.flx` entries begin `PK\x03\x04` and are therefore nested ZIP-compatible containers. Their uncompressed sizes in this backup range from about 74 KB to 5.38 MB. The small sampled `.flx` contained 12 entries:

- an embedded PDF object (PDF 1.7 magic),
- a JPEG asset (JFIF magic),
- duplicate/backup JSON index records (`.index` and `.index_back`),
- a JSON document-metadata record,
- empty or opaque extensionless records/directories, and
- an opaque compressed/binary record.

This sample is enough to establish a nested-bundle architecture, not a universal per-document schema. Archive paths and values are intentionally withheld to avoid exposing personal library content.

### Folder hierarchy and document identity

**Confirmed, partial:** the outer archive uses multiple directory levels before its `.flx` entries, and the inner document uses stable-looking keys/attachment references in JSON. The sampled metadata object includes field names `key`, `currentPage`, `attachments`, `createDate`, `modifiedDate`, `type`, `useCover`, `name`, and `version`. These are likely sufficient to reconstruct document identity and attachment relationships once outer metadata semantics are decoded.

**Not yet confirmed:** exact folder-node record schema, whether a folder’s display name is separate from a path segment, ordering/sort rules, Trash/recents representation, and cross-document/reference-link resolution. The backup UI supports selecting document(s) or folder(s), so a backup may be a subtree rather than a complete library.[^backup]

## 2. Documents, pages, templates/backgrounds, and covers

### Documents and pages

The sampled `.flx` has an index represented as a JSON array of page-like objects. Its observed structural fields are:

```json
{
  "frame": { "x": 0, "y": 0, "width": 768, "height": 1024 },
  "rotate": 0,
  "attachmentPage": { "file": "<id>", "index": 0 },
  "annotationSubtypes": ["<numeric subtype codes>"],
  "key": "<id>",
  "version": "<format version>"
}
```

The index therefore links a page record to an attachment by ID and page index, carries a page frame and rotation, and advertises numeric annotation subtype codes. The sampled frame is 768 × 1024 with floating-point coordinates. These values are best described as **Flexcil document-space units**; they look pixel-like, but no source establishes physical units, DPI, or whether every template uses the same scale.

### Templates/backgrounds

**Unconfirmed.** The sampled document is PDF-backed, and no separately identifiable paper-template/background asset was visible in its small bundle. A native-notebook fixture—blank, ruled, grid, and custom background—is required before claiming a mapping. The importer should represent a missing/unknown template as `custom/unknown` while preserving the source page dimensions.

### Covers

**Confirmed, partial:** the metadata includes `useCover`, and the sampled `.flx` contains a JPEG asset. This supports an explicit-cover or cover-preview concept, but the field-to-file mapping has not been conclusively established. Import a JPEG as a candidate cover only when the `.flx` metadata/linkage proves it; otherwise treat it as an embedded image asset.

## 3. Handwriting and annotation encoding

### What is known

- Per-page index records expose `annotationSubtypes` as numeric codes, a page `frame`, `rotate`, and attachment reference.
- Flexcil’s recovery article explicitly names `invalidTextboxJsonData`, which is evidence that at least a textbox-related JSON representation exists in some format/version.[^recovery]
- The sampled bundle includes opaque binary payload(s) in addition to JSON and standard media.

### What is not known (and must not be invented)

The inspected sample did **not** reveal a public or self-describing schema for:

- stroke point arrays (`x`, `y`, `pressure`, time),
- pen/highlighter subtype mapping,
- RGBA/opacity/width encoding,
- shape geometry or recognition metadata,
- textbox content/style/transform encoding,
- embedded-image transforms/crops,
- stroke ordering, eraser operations, or undo history,
- timestamp units for strokes, or
- the numeric `annotationSubtypes` codebook.

Accordingly, an importer can safely record the page frame and page rotation now, but cannot claim lossless vector-ink conversion. Treat the coordinate system as a per-page affine space: normalize source `(x, y)` to `[0, 1]` using `frame.width`/`frame.height`, then denormalize to Slate page units. Preserve the original frame and rotation in importer provenance. This is a **design recommendation**, not a confirmed Flexcil interpretation.

### Required decoder spike

Create fresh, non-personal fixtures in Flexcil, each with one controlled change: single pen stroke, pressure variation, each pen/highlighter type and colour, shape, textbox, image, eraser action, and rotated page. Compare only entry names, sizes, hashes, and decoded structural deltas. This identifies the corresponding record without exposing the user’s notes.

## 4. Audio recordings

### Confirmed product behaviour

Flexcil officially documents audio recording alongside handwriting/text input. During recording, annotations link to audio; audio playback replays linked annotations; tapping an annotation can jump to the linked audio; and the play bar can jump to linked annotations. Recording restart creates a separate recording file, and each recording has a six-hour limit.[^audio]

The documented options also show the intended model:

- **Multi-document Audio Sync:** playback/synchronization can cover annotations in another tab or a pop-up viewer.
- **Sync Notes During Playback:** new annotations made while listening can be linked to existing audio.
- **Note Replay:** annotations replay with audio.

### Storage, codec, and timeline

| Question | Result |
|---|---|
| Is audio part of the product model? | Yes; confirmed by official docs. |
| Is audio present in the inspected `.flex` sample? | No outer audio extension was present, and the one small sampled `.flx` had no identifiable audio asset. This is **not** proof that Flexcil backups exclude audio. |
| Audio codec/container? | **Unknown.** No official source specifies it, and no audio-bearing sample was inspected. |
| Where stored in a `.flex`? | **Unknown.** Likely inside a document bundle or a sibling archive area, but that is unverified. |
| Link to note/page/timeline? | Product-level annotation↔audio linkage is confirmed; on-disk identifiers, timestamp units, and any per-stroke sync are unknown. |

**Importer policy:** import audio only if an explicitly recognised asset and timeline mapping are decoded. Otherwise preserve an opaque recording payload/reference for a later migration pass and report that timeline sync could not be reconstructed. Do not infer audio from a file extension alone.

## 5. PDF-backed documents versus native notebooks

**PDF-backed documents are confirmed.** The sampled `.flx` contains an embedded PDF and an index `attachmentPage` reference with a file ID and page index. This supports a model in which a Flexcil page overlays annotations on a source PDF page.

**Native notebooks are not yet characterized.** The document metadata has a numeric `type`, but one sample cannot assign its meaning. A native notebook could use generated paper pages, an internal PDF-like representation, or another asset layout. The importer must distinguish by observed asset/link structure rather than assuming that `type` values are stable across Flexcil releases.

## 6. Flexcil → Slate mapping

Slate target: `.slate` ZIP bundle containing pages, per-page paper template, strokes `[x,y,pressure,t]`, timestamped audio, embedded PDF/images; folders become vault folders.

| Flexcil concept | Evidence / proposed source | Slate target | Fidelity now | Notes |
|---|---|---|---|---|
| Backup package | Confirmed ZIP `.flex` | Import transaction input | Lossless container access | Do not copy/extract wholesale. |
| Folder/subtree | Outer hierarchy exists; exact folder metadata unknown | Vault folders | Approximate | Retain source path/IDs; ordering and special folders may be lost pending decoder. |
| `.flx` document bundle | Confirmed nested ZIP | One `.slate` bundle | Lossless package boundary | One `.flx` is the best provisional document boundary. |
| Document identity/version | `key`, `version`, dates observed | Bundle metadata/provenance | Partial | Preserve identifiers but do not rely on field semantics beyond observed names. |
| PDF-backed page | Embedded PDF plus `attachmentPage.file/index` | Embedded PDF + page reference | Likely lossless | Confirm mapping over multiple PDF fixtures. |
| Page frame/rotation | `frame`, `rotate` observed | Slate page dimensions/transform | Partial | Values preserved; physical unit/DPI unknown. |
| Paper template/background | Not identified | Per-page template | Unknown/lost initially | Use `custom/unknown`; add decoder after native fixtures. |
| Cover/preview | `useCover` plus JPEG observed | Bundle cover image | Partial | Need metadata-to-asset linkage confirmation. |
| Images | JPEG asset observed | Embedded image | Likely lossless bytes | Position/crop/rotation is unknown until object decoder exists. |
| Handwriting strokes | Opaque binary payloads; subtypes advertised | `strokes[x,y,pressure,t]` | Not yet importable | Preserve opaque data; do not rasterize silently if editable fidelity is promised. |
| Pen/highlighter/colour | Not decoded | Stroke style | Unknown | Cannot map subtype codes, width, opacity, blend mode, or colour yet. |
| Shapes/text boxes | Textbox JSON error token only; schema unknown | Vector/text objects | Unknown | Text may be recoverable in a later decoder, but not established. |
| Audio assets | Product feature confirmed; archive codec/path unknown | Timestamped audio | Unknown | Import only after audio-bearing fixture analysis. |
| Audio/annotation timeline | Product linkage confirmed | Audio timestamps / stroke `t` | Unknown | No on-disk timestamp mapping established. |
| Reference links | Backup warns some may be lost | Slate links | At risk | Preserve raw source IDs where feasible; expect external links to be incomplete. |

## 7. Streaming strategy for a 4 GB archive on Android and desktop

### Non-negotiable constraints

- Open the source with read-only access; never upload it.
- Do not fully extract the outer archive, and do not hold whole documents in memory.
- Impose path traversal, zip-bomb, compression-ratio, CRC, entry-count, and total-output limits.
- Produce each `.slate` bundle atomically: write to a temporary destination, validate, then rename into the Slate vault.

### Desktop (Windows / Linux)

1. Open the `.flex` with a seekable file handle and parse only its ZIP central directory.
2. Enumerate outer entries; apply a strict allow-list/size policy and never materialize arbitrary paths.
3. Process one `.flx` entry at a time. Stream-decompress it into a **bounded per-document temporary file** only when a seekable nested ZIP reader needs its central directory; delete the temporary file immediately after that one document commits or fails. This bounds disk use to the largest document, not the 4 GB library.
4. For recognised PDF/JPEG/media entries, stream bytes directly into the target `.slate` ZIP entry while calculating a hash/CRC. Avoid an intermediate full asset buffer.
5. Route unrecognised annotation/audio payloads to an optional `source/opaque/` area in the `.slate` bundle plus an import manifest. Make this opt-in if retaining opaque source data is undesirable.
6. Check cancellation between outer entries and leave a resumable checkpoint keyed by source archive fingerprint plus completed `.flx` identifiers.

### Android (Tauri/Rust bridge)

1. Use Android’s Storage Access Framework (`ACTION_OPEN_DOCUMENT`) and request a persisted read permission. Prefer a seekable `ParcelFileDescriptor` / `FileChannel`.
2. If the selected provider cannot seek, do **not** buffer the 4 GB archive into RAM. Either require a seekable local copy selected by the user, or use an explicitly disclosed, size-limited on-device staging file with available-space preflight.
3. Run import in a foreground/long-running worker with progress based on archive bytes and document count; persist checkpoints in app-private storage.
4. Enforce the same one-document spool/delete discipline. Android should reject an import early if the largest nested `.flx` plus target bundle cannot fit in available storage.

### Why not recursively use a naive ZIP API?

A nested `.flx` ZIP needs random access to its own central directory, which sits at the end of the nested stream. A conventional nested ZIP API often therefore requires buffering/spooling that entire `.flx` entry. The correct bounded strategy is **per-document disk spooling**, not whole-archive extraction or whole-archive memory buffering. A future custom sequential nested-ZIP parser could reduce temporary I/O, but should not be the first implementation.

## 8. Risks, feasibility, and implementation plan

### Biggest risks

1. **Opaque annotation encoding:** the central risk. Without a fixture-derived decoder, editable ink fidelity cannot be claimed.
2. **Audio asset/timeline format:** audio exists at product level but codec, location, and linkage records remain unverified.
3. **Format/version drift:** observed metadata carries a version; old/new Flexcil exports may differ.
4. **Native-notebook templates:** PDF-backed documents are proven; native paper/template representation is not.
5. **Reference links and special library state:** Flexcil itself warns that some reference links can be lost during backup.[^backup]
6. **Storage and mobile UX:** Flexcil itself advises temporary space of roughly 2–3× backup size while creating a backup; Slate should avoid reproducing that requirement during import.[^recovery]

### Recommended phased importer

**Phase 0 — fixture and safety harness (required before editable-import claims)**

- Generate non-personal fixtures covering every requested annotation and audio feature.
- Archive-diff one feature at a time; document stable fields and version differences.
- Add golden tests that verify source is never modified and importer memory stays bounded.

**Phase 1 — robust structural import**

- Read `.flex`/`.flx` ZIPs, create vault folders where proven, create `.slate` documents, and retain source identifiers.
- Import embedded PDFs and image assets when linkages are identified.
- Preserve unknown payloads under explicit provenance; report exact non-imported capabilities.

**Phase 2 — page and object decoder**

- Decode page records, templates, cover linkage, then strokes/styles/shapes/text/images.
- Normalize coordinates into Slate page space; retain original source dimensions and format version.

**Phase 3 — audio and timeline decoder**

- Identify codec/container and recording-to-document/page IDs from audio fixtures.
- Map annotation timing into Slate stroke/object timestamps when demonstrated; otherwise import audio as separately timestamped recordings without false sync precision.

### Final verdict

**Partially feasible.** A safe importer for the packaging layer is feasible now because `.flex` and sampled `.flx` files are ZIP-compatible, unencrypted containers with standard PDF/JPEG assets and small JSON metadata/index records. A genuinely lossless conversion of editable handwriting, annotation semantics, templates, and synchronized recordings is not yet established. The next engineering investment should be a controlled fixture corpus and an `.flx` decoder spike—not a bulk attempt against the user’s 4 GB library.

[^backup]: [Flexcil, “How to backup and restore your data”](https://support.flexcil.com/hc/en-us/articles/6857130951321-How-to-backup-and-restore-your-data).
[^audio]: [Flexcil, “Audio recording and syncing”](https://support.flexcil.com/hc/en-us/articles/8006910155801-Audio-recording-and-syncing).
[^recovery]: [Flexcil, “I'm in trouble with backup and restoring data”](https://support.flexcil.com/hc/en-us/articles/6556956000409-I-m-in-trouble-with-backup-and-restoring-data).