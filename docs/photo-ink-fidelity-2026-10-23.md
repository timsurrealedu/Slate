# Photo ink fidelity — 2026-10-23

Slate 0.1.24 / Android versionCode 25 improves the paper-aware importer introduced in 0.1.23. Completed packages are in `releases/2026-10-23-photo-ink-fidelity-final`.

The previous conversion varied the color and width of fragments from one pen, filled small letter counters, lost some punctuation during thinning, and applied the live ballpoint spline to already traced image geometry. Shadows at intersections could become thick strokes. The owner's sample showed all of these problems.

## Changes

- Estimate paper color continuously across analysis cells. Classify pen pigment relative to local paper and contrast, then reconcile uncertain fragments with established page/component colors. Keep distinct colored pens and supported neutral writing.
- Estimate nibs from connected ink components and a supported pen palette. Short branches and swollen intersections cannot establish separate nib widths. Distinct colors retain their own nib estimates; consistently broad lettering remains broad. Dots retain their measured size. A minimum rendered diameter of 1.2 page units keeps fine ink readable at fitted-page scale.
- Refine sampling when most source ink is only a pixel or two wide. Detect paper on the source raster, then carry its ruler into the finer working raster, preserving dotted-paper detection and original pixel data.
- Use local ink cores to limit halos. Preserve counters rather than filling small holes. Retain every connected ink component when symmetric thinning would otherwise erase a dot. Keep actual connections between adjacent crossings.
- Save imported paths with Slate's existing precise renderer and constant width. This avoids a second spline fitting pass. Segment-aware iterative simplification preserves hairpin tips without recursion on complex paths. Canvas, SVG, export, selection, transforms, undo, persistence and backup use the existing stroke model.
- Continue tilted ruling through the frame edges and interpolate missing periodic rules. Preserve stronger/differently pigmented ink over those rules. Exclude repeated punch binding margins, pale rims and supported material artifacts conservatively.
- Remove an invalid expanded-state attribute from pen radios; popup controls retain their dialog association and selection state.

The matched native notebook template, isotropic fitting, ruler registration, saved import preferences, offline worker and synchronous fallback remain. Existing notebooks and live handwriting are not re-rendered or migrated. Re-import source photos to obtain the improved conversion.

## Sample comparison

Using the supplied 740 × 986 photograph, the same real Slate Canvas renderer produces:

| Property                                     |                0.1.23 |          0.1.24 |
| -------------------------------------------- | --------------------: | --------------: |
| Detected paper / horizontal rules            |            Lined / 28 |      Lined / 28 |
| Regular stroke colors                        |                     4 |          1 blue |
| Regular stroke widths                        |                     9 |               1 |
| Regular rendered diameter                    | 0.83–12.74 page units | 1.20 page units |
| Closed traced paths with at least six points |                    53 |             136 |

These are geometry/appearance measurements, not OCR accuracy or a claim that every symbol is correct. Before/after rendered crops accompany the delivery. The private source image is not committed or included in the application bundle.

## Validation and limits

Regression fixtures cover all seven paper types; source immutability; native placement; faint navy; distinct colors and nibs; fine and broad writing; small closed counters, subscripts and punctuation; ruling concealed by ink; frame-edge ruling and torn binding material. Production browser/native results, platform asset/signature checks and runtime limits are recorded in the delivery's `VALIDATION.md`.

This remains offline geometric tracing. It cannot recover writing hidden under opaque correction tape, original pen pressure/order, or detail absent from a blurry photograph. Some ambiguous crease/ink pixels can still require the ordinary eraser after import. Review the preview, particularly for small math and damaged paper; a verified transcription is not claimed.
