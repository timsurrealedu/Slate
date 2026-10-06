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
export function PaperPicker({ paper, onChange }: { paper: Paper; onChange(paper: Paper): void }) {
  return (
    <div className="paper-picker">
      <h3>Paper</h3>
      <div className="paper-styles">
        {PAPER_STYLES.map((style) => (
          <button
            key={style.id}
            className={paper.style === style.id ? "selected" : ""}
            aria-pressed={paper.style === style.id}
            onClick={() => onChange({ ...paper, style: style.id })}
          >
            <span
              className={"template-preview template-" + style.id}
              style={
                {
                  backgroundColor: paper.color,
                  "--paper-line": paper.lineColor,
                } as React.CSSProperties
              }
            />
            {style.name}
          </button>
        ))}
      </div>
      <div className="paper-colors">
        {PAPER_COLORS.map((color) => (
          <button
            key={color.name}
            className={paper.color === color.color ? "selected" : ""}
            aria-pressed={paper.color === color.color}
            aria-label={color.name + " paper"}
            title={color.name}
            style={{ background: color.color }}
            onClick={() => onChange({ ...paper, color: color.color, lineColor: color.line })}
          >
            {paper.color === color.color && (
              <Check size={16} style={{ color: color.name === "Dark" ? "#fff" : "#385775" }} />
            )}
          </button>
        ))}
      </div>
      <label className="field-row">
        Line spacing
        <select
          value={paper.spacing}
          onChange={(e) => onChange({ ...paper, spacing: Number(e.target.value) })}
        >
          <option value={18}>Small</option>
          <option value={24}>Medium</option>
          <option value={30}>Large</option>
          <option value={36}>Extra large</option>
        </select>
      </label>
      <p>Your next notebook will use this paper.</p>
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
