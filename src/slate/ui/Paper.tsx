import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { PAPER_COLORS, PAPER_STYLES, type Paper, type Page } from "../core/model";
import { drawPaper, drawStroke, releaseStrokeGeometry } from "../ink/render";
import type { PDFDocumentProxy } from "pdfjs-dist";
export function PaperThumbnail({ page }: { page: Page }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const previous = useRef<Page | null>(null);
  useEffect(() => {
    const c = ref.current!;
    const old = previous.current;
    const append =
      old &&
      old.width === page.width &&
      old.height === page.height &&
      old.paper === page.paper &&
      old.strokes.length <= page.strokes.length &&
      old.strokes.every((s, i) => s === page.strokes[i]);
    if (!append) {
      c.width = 130;
      c.height = Math.round((130 * page.height) / page.width);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(130 / page.width, 0, 0, 130 / page.width, 0, 0);
    if (!append) drawPaper(ctx, page);
    page.strokes.slice(append ? old.strokes.length : 0).forEach((s) => {
      drawStroke(ctx, s);
      releaseStrokeGeometry(s);
    });
    previous.current = page;
  }, [page]);
  return <canvas ref={ref} className="paper-thumbnail" />;
}
function TemplatePreview({ paper }: { paper: Paper }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 54 * ratio;
    canvas.height = 72 * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform((54 * ratio) / 794, 0, 0, (54 * ratio) / 794, 0, 0);
    drawPaper(ctx, { id: "", paper, width: 794, height: 1059, strokes: [] });
  }, [paper]);
  return <canvas ref={ref} className="template-canvas" aria-hidden="true" />;
}
export function PaperPicker({ paper, onChange }: { paper: Paper; onChange(paper: Paper): void }) {
  const flexcil = paper.template === "flexcil";
  const color = PAPER_COLORS.find((c) => c.color === paper.color) ?? PAPER_COLORS[0];
  return (
    <div className="paper-picker">
      <h3>Template</h3>
      <div className="paper-styles">
        {PAPER_STYLES.map((style) => {
          const selected =
            flexcil && paper.style === style.id && !!paper.columns === !!style.columns;
          const next: Paper = {
            ...paper,
            style: style.id,
            columns: style.columns || undefined,
            color: color.color,
            lineColor: color.line,
            template: "flexcil",
          };
          return (
            <button
              key={style.name}
              className={selected ? "selected" : ""}
              aria-pressed={selected}
              onClick={() => onChange(next)}
            >
              <TemplatePreview paper={next} />
              {style.name}
            </button>
          );
        })}
      </div>
      <div className="paper-colors">
        {PAPER_COLORS.map((c) => (
          <button
            key={c.name}
            className={paper.color === c.color ? "selected" : ""}
            aria-pressed={paper.color === c.color}
            aria-label={c.name + " paper"}
            title={c.name}
            style={{ background: c.color }}
            onClick={() =>
              onChange({ ...paper, color: c.color, lineColor: c.line, template: "flexcil" })
            }
          >
            {paper.color === c.color && (
              <Check size={16} style={{ color: c.name === "Dark" ? "#fff" : "#4793ef" }} />
            )}
          </button>
        ))}
      </div>
      <p>Your next notebook will use this template.</p>
    </div>
  );
}
export function PdfPage({
  pdf,
  number,
  onText,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  onText(text: string): void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let canceled = false,
      task: { cancel(): void; promise: Promise<unknown> } | undefined;
    pdf
      .getPage(number)
      .then(async (p) => {
        if (canceled) return;
        const viewport = p.getViewport({ scale: Math.min(2, window.devicePixelRatio || 1) });
        const canvas = ref.current!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        task = p.render({ canvas, viewport });
        await task.promise;
        const content = await p.getTextContent();
        if (!canceled) onText(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
      })
      .catch((error) => {
        if (!canceled && error?.name !== "RenderingCancelledException") console.error(error);
      });
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [pdf, number]);
  return (
    <canvas
      ref={ref}
      className="pdf-canvas"
      style={{ width: "100%", height: "100%" }}
      aria-label={"PDF page " + number}
    />
  );
}
