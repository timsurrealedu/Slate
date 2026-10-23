import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Page } from "../core/model";
import {
  DEFAULT_HANDWRITING,
  type HandwritingOptions,
  type HandwritingPage,
  type Raster,
} from "../import/handwriting";
import { decodePhoto, traceHandwriting } from "../import/photo";
import { drawPaper, drawStroke } from "../ink/render";
import { IconButton, Modal } from "./shared";

function InkPreview({ page }: { page: Page }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      ratio = Math.min(2, window.devicePixelRatio || 1),
      width = canvas.getBoundingClientRect().width || 320;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round((width * ratio * page.height) / page.width);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform((width * ratio) / page.width, 0, 0, (width * ratio) / page.width, 0, 0);
    drawPaper(ctx, page);
    for (const stroke of page.strokes) drawStroke(ctx, stroke);
  }, [page]);
  return (
    <canvas
      ref={ref}
      className="photo-import-ink"
      style={{ aspectRatio: page.width + " / " + page.height }}
      role="img"
      aria-label={"Traced handwriting, " + page.strokes.length + " strokes"}
    />
  );
}

export function PhotoImport({
  files,
  onClose,
  onCreate,
  preferences,
  onPreferences,
}: {
  files: File[] | null;
  onClose(): void;
  onCreate(title: string, pages: Page[]): Promise<void>;
  preferences?: HandwritingOptions;
  onPreferences(options: HandwritingOptions): void;
}) {
  const [options, setOptions] = useState<HandwritingOptions>(preferences || DEFAULT_HANDWRITING);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<(HandwritingPage | undefined)[]>([]);
  const [tracing, setTracing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const photos = useRef<
    Promise<{ raster: Raster; error?: never } | { error: Error; raster?: never }>[]
  >([]);
  useEffect(() => {
    if (!files && preferences) setOptions(preferences);
  }, [files, preferences]);
  useEffect(() => {
    const list = files || [];
    // Attach failures immediately, including later files in a mixed batch.
    photos.current = list.map((file) =>
      decodePhoto(file).then(
        (raster) => ({ raster }),
        (error) => ({ error }),
      ),
    );
    const next = list.map((file) => URL.createObjectURL(file));
    setUrls(next);
    setIndex(0);
    setResults([]);
    setError("");
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  useEffect(() => {
    if (!files?.length) return;
    let live = true;
    // Results traced with other settings are stale until this run replaces them.
    setTracing(true);
    // Slider drags settle before the photos are traced again.
    const timer = setTimeout(async () => {
      setTracing(true);
      try {
        for (let i = 0; i < photos.current.length; i++) {
          const photo = await photos.current[i];
          if (!live) return;
          if (photo.error) throw photo.error;
          const result = await traceHandwriting(photo.raster!, options);
          if (!live) return;
          setResults((previous) => Object.assign([...previous], { [i]: result }));
        }
        setError("");
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not read this photo.");
      } finally {
        if (live) setTracing(false);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [files, options]);
  const count = files?.length || 0,
    page = results[index]?.page,
    ready = count > 0 && results.filter(Boolean).length === count && !tracing && !error;
  const strokes = results.reduce((sum, r) => sum + (r?.page.strokes.length || 0), 0);
  const papers = {
    lined: "Lined",
    grid: "Squared",
    dot: "Dotted",
    blank: "Blank",
    cornell: "Cornell",
    legal: "Legal",
    vertical: "Vertical",
  } as const;
  function changeOptions(next: HandwritingOptions) {
    setOptions(next);
    onPreferences(next);
  }
  async function create() {
    if (!files || !ready) return;
    setCreating(true);
    try {
      await onCreate(
        files[0].name.replace(/\.[^.]+$/, "") || "Handwritten notes",
        results.map((r) => r!.page),
      );
    } finally {
      setCreating(false);
    }
  }
  return (
    <Modal
      open={!!files}
      onOpenChange={(open) => !open && !creating && onClose()}
      title="Notebook from photos"
      description="Paper ruling is replaced with a notebook template. Writing and drawings become editable ink, fitted to the page. Photos stay on this device and are not kept."
      className="photo-import"
    >
      <div className="photo-import-preview">
        <figure>
          {urls[index] && <img src={urls[index]} alt={"Photo " + (index + 1)} />}
          <figcaption>Photo</figcaption>
        </figure>
        <figure aria-busy={tracing}>
          {page ? (
            <InkPreview page={page} />
          ) : (
            <div className="photo-import-pending">{error || "Reading handwriting…"}</div>
          )}
          <figcaption>
            {page
              ? page.strokes.length
                ? papers[results[index]!.detection.style] +
                  " paper detected · " +
                  page.strokes.length +
                  " strokes"
                : "No handwriting found. Raise the ink sensitivity."
              : "Ink"}
          </figcaption>
        </figure>
      </div>
      <label className="settings-field">
        <span>Notebook paper</span>
        <select
          value={options.paper || "auto"}
          disabled={creating}
          onChange={(e) =>
            changeOptions({ ...options, paper: e.target.value as HandwritingOptions["paper"] })
          }
        >
          <option value="auto">Match photo automatically</option>
          {Object.entries(papers).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {count > 1 && (
        <div className="photo-import-pager">
          <IconButton
            label="Previous photo"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <span>
            Photo {index + 1} of {count}
          </span>
          <IconButton
            label="Next photo"
            disabled={index === count - 1}
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight size={16} />
          </IconButton>
        </div>
      )}
      <label className="settings-field">
        <span>Ink sensitivity</span>
        <span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(options.sensitivity * 100)}
            disabled={creating}
            onChange={(e) =>
              changeOptions({ ...options, sensitivity: Number(e.target.value) / 100 })
            }
          />
          <output>{Math.round(options.sensitivity * 100)}</output>
        </span>
      </label>
      <label className="settings-field">
        <span>Keep ink colors</span>
        <input
          type="checkbox"
          role="switch"
          checked={options.colors}
          disabled={creating}
          onChange={(e) => changeOptions({ ...options, colors: e.target.checked })}
        />
      </label>
      {error && page && <p className="photo-import-error">{error}</p>}
      <div className="modal-actions">
        <button className="quiet-button" onClick={onClose} disabled={creating}>
          Cancel
        </button>
        <button
          className="primary-button"
          onClick={() => void create()}
          disabled={!ready || creating}
        >
          {creating ? "Creating…" : tracing ? "Reading…" : "Create notebook"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {ready
          ? strokes + " strokes traced from " + count + (count === 1 ? " photo" : " photos")
          : ""}
      </p>
    </Modal>
  );
}
