# Notebook creation and navigation, 2026-10-23

Slate 0.1.25 (Android versionCode 26) adds naming dialogs for new Markdown notes and notebooks, refines the editable title field, and adds horizontal page gestures. The shared implementation serves Android, Windows, Linux and independent web.

Creation menus, folder actions, the command palette and keyboard shortcuts now ask for a name before saving. Cancel and Escape leave no new document. Names use the existing file-name validation; duplicate names gain a numeric suffix. The chosen folder is retained while the dialog is open. Linked-note creation keeps its existing behavior.

The title field uses a 34px desktop or 44px touch target, normal UI letter spacing and an inset focus border. Enter saves; Escape restores the saved title. The focus border fits inside the header without the reading heading's outside outline.

The Add page button stays at the lower right of the notebook. It inserts after the current page and inherits its paper. The two creation controls in the left page strip are removed.

A deliberate horizontal finger pull turns pages. At the first page, pulling right inserts a page before it; at the last page, pulling left inserts after it. The hint changes from “Keep swiping” to “Release” once the pull is sufficient. Panning consumes available horizontal scroll first, then requires an additional 30% of the viewport width, bounded to 120–220 CSS pixels. Horizontal movement must exceed vertical movement by a factor of 1.5. Reversing below the threshold or cancelling the touch does not turn or create a page. Vertical scrolling does not create pages.

Gestures reuse the ink surface's existing pointer ownership, palm rejection and pen guard. They run only for a single finger in pan mode: pen input, finger ink, selection and two-finger pinch/pan retain their behavior. PDFs retain their existing annotation and scrolling behavior. Existing pages, strokes, rendering and file formats are unchanged.

## Design review

Operate mode, variance 3 / motion 3 / density 6: refine Slate's quiet study controls with its existing DM Sans, cool surfaces, slate-blue focus and independent paper treatment. No new motion, palette, fonts or dependencies.

| Before | After | Why |
| --- | --- | --- |
| Creation immediately saves an untitled document | Existing modal language asks for a name first | Name or cancel before creating a file |
| Header input inherits heading tracking and an outside focus offset | UI tracking, explicit line height and inset focus border | Border and text fit the compact header |
| Add-page controls occupy the left page strip | One persistent action at the lower right | Accessible while scrolling and with pages hidden |
| No page-pull feedback | Directional text appears during a horizontal pull | Distinguishes an incomplete pull from release-to-create |

The design preflight's inherited findings are contextual false positives for this change: white physical paper and black PDF backgrounds preserve document colors; repeated gradients represent real paper ruling; CodeMirror owns its editor focus/caret; the outline's selection border is existing navigation state; the font inventory includes established reading and code families. The hook's miniature-paper colors, caption sizes and radii are pre-existing notebook values. New controls use existing tokens and documented size/radius steps. No rule suppressions were added.

## Validation and delivery

Completed APK and verification records belong in `releases/2026-10-23-notebook-creation/android`; see the delivery's `VALIDATION.md` for final checks and limitations. Generated packages remain ignored.

TypeScript, scoped source/new-test lint, 107 unit tests and all seven new feature workflows pass. These cover naming/cancellation, title keyboard editing and focus bounds, horizontal insertion/navigation, reload preservation, zoomed panning, cancelled/two-finger gestures, pen/palm ownership and dark phone accessibility. Five additional targeted workflows pass for folder creation/restoration, live Markdown, touch dragging, offline creation and worker-fallback saving.

Broader browser checks are not all green. The old three-point pen-contact expectation also fails with thirteen points against the preserved 0.1.24 independent web release, confirming that mismatch predates this change. Other unresolved wider failures involve phone-toolbar hit targets, fixed ink-prefix expectations and an intermittent library drag failure; the first drag run passed. Available reports are retained in the delivery. Physical Android, Windows and Linux runtime behavior was not tested for this APK-only delivery.

Build from the repository root with JDK 21 and the Android SDK. This Windows host needs a short Java socket/temp directory, supplied only to the build process through `JAVA_TOOL_OPTIONS` (`jdk.net.unixdomain.tmpdir` and `java.io.tmpdir`). The default long temporary socket path caused `Unable to establish loopback connection`; using `C:/t/slate-jvm` resolves it without changing application or Gradle configuration.
