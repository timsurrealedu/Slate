# Paper-aware photo import — 2026-10-23

Slate 0.1.23 (Android versionCode 24) separates photographed paper from handwriting before tracing. Open **New note → Notebook from photos**, review the native-page preview, then create the notebook. Each photo remains one page of ordinary, editable notebook ink.

## Paper and ink

- Detect repeated horizontal and vertical rules, square lattices and printed dot lattices. Recognize lined, squared, dotted, vertical and blank sheets, and conventional red-margin legal/Cornell layouts. A single diagram edge is insufficient evidence of a paper pattern. Faint rules visible in only the lit part of a sheet require a longer, parallel, phase-consistent family.
- Track rules across strips and local angle searches, allowing modest skew, perspective changes in line pitch and gently curved paper. Remove pixels matching the ruling's local contrast/pigment, using the whole rule family as a reference so a handwritten underline cannot become its own erasure reference. Protect stronger/differently colored ink and crossings. Suppress dots even where they touch writing; preserve punctuation.
- Estimate the paper background locally. Fill enclosed dark cells in the sheet mask so broad writing is not mistaken for missing paper, and refine its silhouette with an envelope that survives underlines. Reject surrounding desk pixels, suppress solid edge punch holes before cropping can leave their rims, and remove isolated specks/edge debris. Reject anomalously broad, short low-contrast skeleton branches and avoid inflating nib width where a crease joins fine writing; preserve genuinely broad/high-contrast pens and bold lettering. Transparent source images are composited onto white before tracing.
- Trace centerlines, loops, widths and pen colors locally in the existing worker, with the synchronous photo-processing fallback retained. No OCR, accounts, network processing or new dependencies are involved. The original file's pixels are not changed.

## Native notebook layout

Imported pages now use the same 794 × 1059 Flexcil-standard templates as Slate's paper picker. Writing is registered to the native line/grid origins and pitch; its width and overall scale follow the same transform. Positions within a ruled band remain continuous, including when a source rule is missing. Source paper textures, printed ruling and the photo itself are not saved as page backgrounds.

The whole drawing fits within the page margins. Dense lined/grid/dot sheets can use Slate's adjustable spacing instead of clipping the ink; spacing stays within the backup schema's bounds. At extreme density, fitting the whole source and matching every native rule cannot both be exact. Review such pages or use closer, separate photographs. Ruled normalization is guided by the source pattern; blank pages retain their relative drawing geometry and fit the page.

**Notebook paper** can override the detected template. Sensitivity, color and paper choices persist in workspace preferences, including through backup/restore. Automatic detection still runs separately for each photo in a mixed batch. Changing the target template does not restore the photographed ruling.

Decode failures are handled immediately for every file in a batch. Creation stays disabled on a failed or incomplete trace, including when an older preview remains visible, so a bad photo cannot silently create a partial notebook.

## Verification and limits

`tests/paper-import.test.ts` covers all seven native paper styles, curved/skewed rules, holes, printed dots versus punctuation, retained diagram edges, template overrides, bounds/schema validity, faint partial ruling, continuous registration and actual native ruler/ink spacing. `tests/handwriting-import.test.ts` retains line, loop, color, width and sensitivity checks. Storage tests verify import preferences survive backup recovery.

`tests/browser/photo-import.spec.ts` exercises the production worker, review/override, reload and preference persistence, mobile mixed-paper import, photo-processing fallback and an invalid batch. Its optional private fixture (`SLATE_HANDWRITING_PHOTO`) exercises the owner's attached photograph without committing the image. That photograph is detected as lined, with 28 source rules, and imports onto a native lined page. Final command results and package checks are recorded in the delivery's `VALIDATION.md`.

This is conservative image analysis, not a verified transcription or a guarantee of pixel-perfect ink recovery. Very faint or blurred writing, ink indistinguishable from printed ruling, heavy creases, correction-tape edges, unusual templates and strong rotation/perspective can leave fragments or lose detail. The owner's sample still contains ambiguous crease/tape details and faint lettering; inspect the preview and adjust sensitivity. Red-margin recognition is deliberately conservative; nonstandard or monochrome legal/Cornell layouts may need the paper override. Photographed handwriting cannot recover pen pressure, stroke order or content absent from the image. Highlighter fills are not reconstructed as highlighter strokes.

The design review's literal-color/type findings in the model, existing overlay CSS and storage fixture are contextual false positives: existing pen pigments, established compact controls, and test data. They remain unchanged; no hook suppressions or design-system exceptions were added. The new paper control uses existing surface/ink/divider tokens, 6px control corners and 44px targets for coarse pointers.
