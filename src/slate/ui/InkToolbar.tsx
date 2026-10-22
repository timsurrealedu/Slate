import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Copy,
  Eraser,
  GripVertical,
  Hand,
  Lasso,
  Minus,
  PanelTop,
  PictureInPicture2,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { workspace, useWorkspace } from "../core/workspace";
import { isHighlighter, type Brush, type PenSlot, type Point } from "../core/model";
import type { InkHandle, InkTool } from "../ink/InkSurface";
import { drawBrush, UNIT } from "../ink/flexcil";
import { IconButton } from "./shared";

const lightInk = ["#385775", "#252d38", "#aa6467", "#7e957b", "#c4a66a"];
const darkInk = ["#c0dbf1", "#fffaf0", "#e6a9af", "#b7d3b3", "#e9d295"];
export function inkColorForPaper(color: string, darkPaper: boolean) {
  const index = [...lightInk, ...darkInk].indexOf(color.toLowerCase());
  // Only Slate's paired palette adapts to dark paper; other inks keep their exact color.
  return index < 0 ? color : (darkPaper ? darkInk : lightInk)[index % lightInk.length];
}
export const inkTools = [
  { id: "pen", label: "Pen", key: "P" },
  { id: "eraser", label: "Eraser", key: "E" },
  { id: "select", label: "Lasso", key: "V" },
  { id: "hand", label: "Hand", key: "Space" },
] as const;
const BRUSHES: { id: Brush; name: string }[] = [
  { id: "ballpoint", name: "Ballpoint pen" },
  { id: "fountain", name: "Fountain pen" },
  { id: "calligraphy", name: "Slanted fountain pen" },
  { id: "pencil", name: "Pencil" },
  { id: "marker", name: "Square highlighter" },
  { id: "highlighter", name: "Highlighter" },
];
const COLORS = [
  "#000000", "#171717", "#333333", "#5c5c5c", "#8e8e8e", "#ffffff",
  "#e02020", "#ff53ad", "#fa6400", "#f7b500", "#ffed2a", "#6dd400",
  "#00da58", "#44d7b6", "#32c5ff", "#02c7fd", "#2d91ff", "#0069db",
  "#6236ff", "#ac8af5", "#b620e0", "#8b572a", "#385775", "#aa6467",
]; // prettier-ignore
const widthRange = (brush: Brush) => (isHighlighter(brush) ? [1, 40] : [0.1, 20]);
const formatWidth = (width: number) => (Math.round(width * 10) / 10).toFixed(1);

// Flexcil's toolbar pens: a body whose tip and band take the ink color.
export function PenGlyph({ brush, color }: { brush: Brush; color: string }) {
  const tip =
    brush === "highlighter" ? (
      <path d="M6 15 L6 8 Q11 3 16 8 L16 15 Z" fill={color} />
    ) : brush === "marker" ? (
      <path d="M6 15 L6 6 L16 3 L16 15 Z" fill={color} />
    ) : brush === "pencil" ? (
      <>
        <path d="M6 15 L11 2 L16 15 Z" fill="#e8c9a0" />
        <path d="M9.4 6 L11 2 L12.6 6 Z" fill={color} />
      </>
    ) : brush === "calligraphy" ? (
      <path d="M7 15 L9 4 L14 1 L15 15 Z" fill={color} />
    ) : brush === "fountain" ? (
      <path
        d="M6.5 15 Q7 7 11 1 Q15 7 15.5 15 Z M10.6 6 L11.4 6 L11.4 11 L10.6 11 Z"
        fill={color}
        fillRule="evenodd"
      />
    ) : (
      <>
        <path d="M6.5 15 L10 4 L12 4 L15.5 15 Z" fill="#d9d9d9" />
        <path d="M10 4 L11 1 L12 4 Z" fill={color} />
      </>
    );
  const body = isHighlighter(brush) ? "#f2f2f2" : "#fafafa";
  return (
    <svg className="pen-glyph" viewBox="0 0 22 44" aria-hidden="true">
      {tip}
      <rect
        x="5"
        y="15"
        width="12"
        height="29"
        rx="1.5"
        fill={body}
        stroke="#c9c9c9"
        strokeWidth="0.75"
      />
      <rect x="5" y="19" width="12" height="4" fill={color} stroke="#c9c9c9" strokeWidth="0.75" />
    </svg>
  );
}

function sampleStroke(slot: PenSlot, width: number, height: number) {
  // An S curve with Flexcil-like pressure and speed variation for the preview.
  const points: Point[] = [];
  let t = 0;
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    t += 6 + 10 * Math.abs(Math.cos(u * Math.PI * 2));
    points.push({
      x: 18 + u * (width - 36),
      y: height / 2 - Math.sin(u * Math.PI * 2) * (height * 0.22),
      p: 0.25 + 0.65 * Math.sin(u * Math.PI),
      t,
    });
  }
  return {
    id: "preview",
    tool: isHighlighter(slot.brush) ? ("highlighter" as const) : ("pen" as const),
    color: slot.color,
    width: slot.width * UNIT,
    points: slot.straight ? [points[0], { ...points[60], y: points[0].y }] : points,
    brush: slot.brush,
    pressureSensitive: true,
    ...(slot.opacity < 1 ? { opacity: slot.opacity } : {}),
  };
}
function PenPreview({ slot }: { slot: PenSlot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 240,
      height = canvas.clientHeight || 72;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawBrush(ctx, sampleStroke(slot, width, height));
  }, [slot]);
  return <canvas ref={ref} className="pen-preview" aria-label="Pen preview" />;
}

function PenEditor({
  slot,
  onChange,
  onRemove,
  onDuplicate,
}: {
  slot: PenSlot;
  onChange(slot: PenSlot): void;
  onRemove?(): void;
  onDuplicate(): void;
}) {
  const [min, max] = widthRange(slot.brush);
  const set = (patch: Partial<PenSlot>) => onChange({ ...slot, ...patch });
  const marker = isHighlighter(slot.brush);
  return (
    <div className="pen-editor">
      <div className="pen-types" role="radiogroup" aria-label="Pen type">
        {BRUSHES.map((b) => (
          <button
            key={b.id}
            role="radio"
            aria-checked={slot.brush === b.id}
            aria-label={b.name}
            title={b.name}
            className={slot.brush === b.id ? "selected" : ""}
            onClick={() => {
              const [lo, hi] = widthRange(b.id);
              const switching = isHighlighter(b.id) !== marker;
              set({
                brush: b.id,
                width: switching
                  ? isHighlighter(b.id)
                    ? 10
                    : 1
                  : Math.min(hi, Math.max(lo, slot.width)),
                opacity: switching ? (isHighlighter(b.id) ? 0.47 : 1) : slot.opacity,
                smooth: switching ? (isHighlighter(b.id) ? 0 : 0.2) : slot.smooth,
              });
            }}
          >
            <PenGlyph brush={b.id} color={slot.color} />
          </button>
        ))}
      </div>
      <PenPreview slot={slot} />
      <div className="pen-setting">
        <span>Thickness</span>
        <IconButton
          label="Thinner"
          onClick={() => set({ width: Math.max(min, Math.round((slot.width - 0.1) * 10) / 10) })}
        >
          <Minus size={14} />
        </IconButton>
        <output>{formatWidth(slot.width)}</output>
        <IconButton
          label="Thicker"
          onClick={() => set({ width: Math.min(max, Math.round((slot.width + 0.1) * 10) / 10) })}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      <input
        type="range"
        aria-label="Thickness"
        min={min}
        max={max}
        step={0.1}
        value={slot.width}
        onChange={(e) => set({ width: Number(e.target.value) })}
      />
      <div className="pen-setting">
        <span>Opacity</span>
        <output>{Math.round(slot.opacity * 100)}%</output>
      </div>
      <input
        type="range"
        aria-label="Opacity"
        min={5}
        max={100}
        value={Math.round(slot.opacity * 100)}
        onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
      />
      <label className="pen-setting pen-switch">
        <span>Straight line</span>
        <input
          type="checkbox"
          role="switch"
          checked={slot.straight}
          onChange={(e) => set({ straight: e.target.checked })}
        />
      </label>
      {!marker && (
        <>
          <div className="pen-setting">
            <span>Stroke stabilization</span>
            <output>{Math.round(slot.smooth * 100)}</output>
          </div>
          <input
            type="range"
            aria-label="Stroke stabilization"
            min={0}
            max={100}
            disabled={slot.straight}
            value={Math.round(slot.smooth * 100)}
            onChange={(e) => set({ smooth: Number(e.target.value) / 100 })}
          />
        </>
      )}
      <div className="pen-colors" role="radiogroup" aria-label="Ink color">
        {COLORS.map((color) => (
          <button
            key={color}
            role="radio"
            aria-checked={slot.color === color}
            aria-label={"Color " + color}
            className={slot.color === color ? "selected" : ""}
            style={{ backgroundColor: color }}
            onClick={() => set({ color })}
          />
        ))}
        <label className="pen-custom-color" title="Custom color">
          <input
            type="color"
            aria-label="Custom color"
            value={slot.color}
            onChange={(e) => set({ color: e.target.value })}
          />
        </label>
      </div>
      <div className="pen-actions">
        <button className="quiet-button" onClick={onDuplicate}>
          <Copy size={14} /> Add pen
        </button>
        {onRemove && (
          <button className="quiet-button danger" onClick={onRemove}>
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

export function InkToolbar({
  tool,
  onTool,
  history,
  ink,
  start,
  end,
}: {
  tool: InkTool;
  onTool(tool: InkTool): void;
  history: { undo: boolean; redo: boolean; selection: boolean };
  ink: React.RefObject<InkHandle | null>;
  start?: ReactNode;
  end?: ReactNode;
}) {
  const { preferences } = useWorkspace();
  const pens = preferences.pens,
    active = Math.min(preferences.activePen, pens.length - 1);
  const [editing, setEditing] = useState<number | null>(null);
  const savePens = (next: PenSlot[], activePen = active) =>
    void workspace.preferences({ pens: next, activePen });
  const floating = preferences.inkToolbarMode === "floating";
  const bar = useRef<HTMLDivElement>(null),
    position = useRef({ left: 0, top: 0 }),
    drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  // A floating bar stays inside the paper area; its place is saved as a fraction of the free space.
  function place(left: number, top: number) {
    const el = bar.current!,
      area = el.parentElement!;
    left = Math.max(8, Math.min(Math.max(8, area.clientWidth - el.offsetWidth - 8), left));
    top = Math.max(8, Math.min(Math.max(8, area.clientHeight - el.offsetHeight - 8), top));
    position.current = { left, top };
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }
  function restore() {
    const el = bar.current!,
      area = el.parentElement!,
      saved = preferences.inkToolbarPosition;
    place(
      8 + Math.max(0, area.clientWidth - el.offsetWidth - 16) * (saved?.x ?? 0.5),
      8 + Math.max(0, area.clientHeight - el.offsetHeight - 16) * (saved?.y ?? 0),
    );
  }
  function save() {
    const el = bar.current!,
      area = el.parentElement!;
    const fraction = (value: number, free: number) =>
      Math.max(0, Math.min(1, (value - 8) / Math.max(1, free)));
    void workspace.preferences({
      inkToolbarPosition: {
        x: fraction(position.current.left, area.clientWidth - el.offsetWidth - 16),
        y: fraction(position.current.top, area.clientHeight - el.offsetHeight - 16),
      },
    });
  }
  useLayoutEffect(() => {
    const el = bar.current!;
    if (!floating) {
      el.style.transform = "";
      return;
    }
    const observer = new ResizeObserver(() => {
      if (!drag.current) restore();
    });
    observer.observe(el);
    observer.observe(el.parentElement!);
    restore();
    return () => observer.disconnect();
  }, [floating, preferences.inkToolbarPosition]);
  function endDrag(event: React.PointerEvent, cancelled = false) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    bar.current!.removeAttribute("data-dragging");
    if (cancelled) restore();
    else save();
  }
  return (
    <div
      ref={bar}
      className={"fx-toolbar" + (floating ? " floating" : "")}
      role="toolbar"
      aria-label="Writing tools"
    >
      {floating && (
        <IconButton
          label="Move toolbar"
          className="fx-grip"
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            event.preventDefault();
            setEditing(null);
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              ...position.current,
            };
            bar.current!.setAttribute("data-dragging", "true");
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) return;
            event.preventDefault();
            place(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
          }}
          onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)}
          onLostPointerCapture={(event) => endDrag(event, true)}
          onKeyDown={(event) => {
            const delta = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[event.key];
            if (!delta) return;
            event.preventDefault();
            const step = event.shiftKey ? 5 : 20;
            place(position.current.left + delta[0] * step, position.current.top + delta[1] * step);
            save();
          }}
        >
          <GripVertical size={17} />
        </IconButton>
      )}
      <div className="fx-toolbar-side">
        {start}
        <IconButton
          immediateTouch
          label="Undo ink"
          disabled={!history.undo}
          onClick={() => ink.current?.undo()}
        >
          <Undo2 size={19} />
        </IconButton>
        <IconButton
          immediateTouch
          label="Redo ink"
          disabled={!history.redo}
          onClick={() => ink.current?.redo()}
        >
          <Redo2 size={19} />
        </IconButton>
      </div>
      <div className="fx-toolbar-center">
        <IconButton
          immediateTouch
          label="Lasso (V)"
          aria-pressed={tool === "select"}
          className={tool === "select" ? "active" : ""}
          onClick={() => onTool("select")}
        >
          <Lasso size={19} strokeWidth={1.7} />
        </IconButton>
        <Popover.Root
          open={editing === -1}
          onOpenChange={(open) => setEditing(open && tool === "eraser" ? -1 : null)}
        >
          <Popover.Trigger asChild>
            <IconButton
              immediateTouch
              label="Eraser (E)"
              aria-pressed={tool === "eraser"}
              aria-haspopup="dialog"
              className={tool === "eraser" ? "active" : ""}
              onClick={() => onTool("eraser")}
            >
              <Eraser size={19} strokeWidth={1.7} />
            </IconButton>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="floating-surface"
              side="bottom"
              sideOffset={8}
              collisionPadding={12}
              aria-label="Eraser size"
            >
              <div className="pen-editor eraser-editor">
                <div className="pen-setting">
                  <span>Eraser size</span>
                  <output>{formatWidth(preferences.eraserWidth)}</output>
                </div>
                <input
                  type="range"
                  aria-label="Eraser size"
                  min={1}
                  max={40}
                  step={0.5}
                  value={preferences.eraserWidth}
                  onChange={(e) =>
                    void workspace.preferences({ eraserWidth: Number(e.target.value) })
                  }
                />
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <IconButton
          immediateTouch
          label="Hand (Space)"
          aria-pressed={tool === "hand"}
          className={tool === "hand" ? "active" : ""}
          onClick={() => onTool("hand")}
        >
          <Hand size={19} strokeWidth={1.7} />
        </IconButton>
        <span className="toolbar-divider" />
        <div className="fx-pens" role="radiogroup" aria-label="Pens">
          {pens.map((slot, i) => {
            const selected = tool === "pen" && i === active;
            return (
              <Popover.Root
                key={i}
                open={editing === i}
                onOpenChange={(open) => setEditing(open && selected ? i : null)}
              >
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-haspopup="dialog"
                    aria-label={`${BRUSHES.find((b) => b.id === slot.brush)!.name}, ${formatWidth(slot.width)}`}
                    title={selected ? "Tap again to edit this pen" : undefined}
                    className={"fx-pen" + (selected ? " selected" : "")}
                    onClick={(event) => {
                      if (!selected) {
                        event.preventDefault();
                        if (i !== active) void workspace.preferences({ activePen: i });
                        onTool("pen");
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (i !== active) void workspace.preferences({ activePen: i });
                      onTool("pen");
                      setEditing(i);
                    }}
                  >
                    <PenGlyph brush={slot.brush} color={slot.color} />
                    <span className="fx-pen-width">{formatWidth(slot.width)}</span>
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="floating-surface"
                    side="bottom"
                    sideOffset={6}
                    collisionPadding={12}
                    aria-label="Edit pen"
                  >
                    <PenEditor
                      slot={slot}
                      onChange={(next) => savePens(pens.map((p, j) => (j === i ? next : p)))}
                      onDuplicate={() => {
                        if (pens.length >= 40) return;
                        const next = [...pens];
                        next.splice(i + 1, 0, { ...slot });
                        savePens(next, i + 1);
                        setEditing(null);
                      }}
                      onRemove={
                        pens.length > 1
                          ? () => {
                              savePens(
                                pens.filter((_, j) => j !== i),
                                Math.max(0, i - 1),
                              );
                              setEditing(null);
                            }
                          : undefined
                      }
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            );
          })}
        </div>
      </div>
      <div className="fx-toolbar-side end">
        {end}
        <IconButton
          label={floating ? "Dock toolbar above the page" : "Float toolbar over the page"}
          onClick={() =>
            void workspace.preferences({ inkToolbarMode: floating ? "docked" : "floating" })
          }
        >
          {floating ? <PanelTop size={18} /> : <PictureInPicture2 size={18} />}
        </IconButton>
      </div>
    </div>
  );
}
