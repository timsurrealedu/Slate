import { useEffect, useRef, useState } from "react";
import {
  PenLine,
  Highlighter,
  Eraser,
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  Plus,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Fingerprint,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  RotateCw,
  Shrink,
  Expand,
} from "lucide-react";
import { newPage, duplicatePage, type Page, type Paper, type SlateDocument } from "../core/model";
import { workspace, useWorkspace } from "../core/workspace";
import { InkSurface, type InkHandle, type InkTool } from "../ink/InkSurface";
import { Floating, IconButton, Menu, ContextActions } from "./shared";
import { PaperPicker, PaperThumbnail, PdfPage } from "./Paper";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getAsset } from "../core/storage";
import { downloadBlob } from "../platform/export";
import { loadPdf } from "../documents/files";
const lightInk = ["#385775", "#252d38", "#aa6467", "#7e957b", "#c4a66a"];
const darkInk = ["#c0dbf1", "#fffaf0", "#e6a9af", "#b7d3b3", "#e9d295"];
const inkNames = ["Slate blue", "Graphite", "Rose", "Sage", "Honey"];
const tools: { id: InkTool; label: string; icon: typeof PenLine; key: string }[] = [
  { id: "pen", label: "Pen", icon: PenLine, key: "P" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, key: "H" },
  { id: "eraser", label: "Eraser", icon: Eraser, key: "E" },
  { id: "select", label: "Select ink", icon: MousePointer2, key: "V" },
  { id: "hand", label: "Hand", icon: Hand, key: "Space" },
];
export function Notebook({
  doc,
  active,
  onToast,
}: {
  active: boolean;
  doc: SlateDocument;
  onToast(text: string, undo?: () => void): void;
}) {
  const { preferences } = useWorkspace();
  const [index, setIndex] = useState(0),
    [tool, setTool] = useState<InkTool>("pen"),
    [color, setColor] = useState("#385775"),
    [width, setWidth] = useState(2.2),
    [zoom, setZoom] = useState(1),
    [thumbnails, setThumbnails] = useState(true);
  const [history, setHistory] = useState({ undo: false, redo: false, selection: false }),
    [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [pdfError, setPdfError] = useState(""),
    [pdfText, setPdfText] = useState("");
  const ink = useRef<InkHandle>(null),
    viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(650);
  const page = doc.pages[Math.min(index, doc.pages.length - 1)];
  const paperColor = page?.paper.color || "#ffffff";
  const darkPaper =
    [1, 3, 5].reduce(
      (sum, at, i) =>
        sum + parseInt(paperColor.slice(at, at + 2), 16) * [0.2126, 0.7152, 0.0722][i],
      0,
    ) < 110;
  useEffect(() => {
    const from = darkPaper ? lightInk : darkInk,
      to = darkPaper ? darkInk : lightInk;
    setColor((current) => {
      const i = from.indexOf(current);
      return i >= 0 ? to[i] : current;
    });
  }, [darkPaper]);

  const current = useRef({ doc, page });
  current.current = { doc, page };
  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(() =>
      setFit(Math.min(760, Math.max(180, el.clientWidth - (el.clientWidth < 500 ? 24 : 80)))),
    );
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(3, Math.max(0.5, z * Math.exp(-e.deltaY / 450))));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(() => {
    if (index >= doc.pages.length) setIndex(Math.max(0, doc.pages.length - 1));
  }, [doc.pages.length]);
  useEffect(() => {
    if (!active) return;
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable=true],[role=dialog]"))
        return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? ink.current?.redo() : ink.current?.undo();
        }
        return;
      }
      const entry = tools.find(
        (t) =>
          t.key.toLowerCase() === e.key.toLowerCase() || (t.key === "Space" && e.code === "Space"),
      );
      if (entry) {
        e.preventDefault();
        setTool(entry.id);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && history.selection) {
        e.preventDefault();
        ink.current?.removeSelection();
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        setIndex((i) => Math.min(doc.pages.length - 1, i + 1));
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [history.selection, doc.pages.length, active]);
  useEffect(() => {
    if (doc.kind !== "pdf" || !doc.assetId) return;
    let canceled = false,
      loaded: PDFDocumentProxy | undefined;
    setPdfError("");
    setPdf(null);
    getAsset(doc.assetId)
      .then(async (blob) => {
        if (!blob)
          throw new Error("The original PDF is missing. Restore it from a workspace backup.");
        loaded = await loadPdf(blob);
        if (!canceled) setPdf(loaded);
        else await loaded.destroy();
      })
      .catch((error) => {
        if (!canceled) setPdfError(error.message);
      });
    return () => {
      canceled = true;
      void loaded?.destroy();
    };
  }, [doc.id]);
  function updatePage(patch: Partial<Page>) {
    const { doc: d, page: p } = current.current;
    workspace.update(d.id, {
      pages: d.pages.map((item) => (item.id === p.id ? { ...item, ...patch } : item)),
    });
  }
  function setPaper(paper: Paper) {
    updatePage({ paper });
    void workspace.preferences({ paper });
  }
  function add() {
    const pages = [...doc.pages];
    pages.splice(index + 1, 0, newPage(page?.paper || preferences.paper));
    workspace.update(doc.id, { pages });
    setIndex(index + 1);
  }
  function duplicate() {
    const pages = [...doc.pages];
    pages.splice(index + 1, 0, duplicatePage(page));
    workspace.update(doc.id, { pages });
    setIndex(index + 1);
    onToast("Page duplicated");
  }
  function move(direction: number) {
    const target = index + direction;
    if (target < 0 || target >= doc.pages.length) return;
    const pages = [...doc.pages];
    [pages[index], pages[target]] = [pages[target], pages[index]];
    workspace.update(doc.id, { pages });
    setIndex(target);
  }
  function remove() {
    const removed = structuredClone(page),
      position = index;
    workspace.update(doc.id, { pages: doc.pages.filter((p) => p.id !== page.id) });
    setIndex((i) => Math.max(0, i - 1));
    onToast("Page removed", () => {
      const current = workspace.get().documents.find((d) => d.id === doc.id);
      if (!current || current.pages.some((p) => p.id === removed.id)) return;
      const pages = [...current.pages];
      pages.splice(Math.min(position, pages.length), 0, removed);
      workspace.update(doc.id, { pages });
    });
  }
  function changeIndex(next: number) {
    setIndex(next);
    viewport.current?.scrollTo({ top: 0, left: 0 });
  }
  return (
    <div className="notebook-workspace">
      <div className="notebook-controls">
        <IconButton
          label={thumbnails ? "Hide pages" : "Show pages"}
          aria-pressed={thumbnails}
          onClick={() => setThumbnails(!thumbnails)}
        >
          {thumbnails ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </IconButton>
        <span className="notebook-page-label">
          Page {index + 1} <span>of {doc.pages.length}</span>
        </span>
        <div className="controls-spacer" />
        {doc.kind !== "pdf" && page && (
          <Floating
            trigger={
              <button className="quiet-button">
                <span className={"mini-paper mini-" + page.paper.style} />
                <span>Paper</span>
                <ChevronDown size={14} />
              </button>
            }
          >
            <PaperPicker paper={page.paper} onChange={setPaper} />
          </Floating>
        )}
        <div className="zoom-control">
          <IconButton label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <Minus size={14} />
          </IconButton>
          <button title="Fit page width" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      {doc.flexcil && (
        <div className="flexcil-status" role="status">
          <span>
            Flexcil handwriting is preserved in the source file; its format is not decoded yet.
          </span>
          <button
            className="quiet-button"
            onClick={async () => {
              try {
                const blob = await getAsset(doc.flexcil!.originalId);
                if (!blob)
                  throw new Error(
                    "The original Flexcil file is missing. Restore a workspace backup.",
                  );
                await downloadBlob(blob, doc.title + ".flx");
              } catch (error) {
                onToast(error instanceof Error ? error.message : "Could not export the original.");
              }
            }}
          >
            Export original Flexcil
          </button>
        </div>
      )}
      <div className="notebook-body">
        {thumbnails && (
          <aside className="page-strip" aria-label="Notebook pages">
            <div className="page-strip-heading">
              <span>Pages</span>
              {doc.kind !== "pdf" && (
                <IconButton label="Add page" onClick={add}>
                  <Plus size={16} />
                </IconButton>
              )}
            </div>
            {doc.pages.map((p, i) => (
              <ContextActions
                key={p.id}
                items={[
                  {
                    label: "Open page",
                    icon: <ChevronRight size={16} />,
                    onClick: () => changeIndex(i),
                  },
                  ...(doc.kind !== "pdf"
                    ? [
                        {
                          label: "Duplicate page",
                          icon: <Copy size={16} />,
                          onClick: () => {
                            const pages = [...doc.pages];
                            pages.splice(i + 1, 0, duplicatePage(p));
                            workspace.update(doc.id, { pages });
                            setIndex(i + 1);
                          },
                        },
                      ]
                    : []),
                ]}
              >
                <button
                  key={p.id}
                  className={"page-thumb " + (i === index ? "active" : "")}
                  aria-label={"Go to page " + (i + 1)}
                  aria-current={i === index ? "page" : undefined}
                  onClick={() => changeIndex(i)}
                  draggable={doc.kind !== "pdf"}
                  onDragStart={(e) => e.dataTransfer.setData("text/slate-page", String(i))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("text/slate-page");
                    if (!raw) return;
                    const from = Number(raw);
                    if (!Number.isInteger(from)) return;
                    const pages = [...doc.pages];
                    const [moved] = pages.splice(from, 1);
                    if (!moved) return;
                    pages.splice(i, 0, moved);
                    workspace.update(doc.id, { pages });
                    setIndex(i);
                  }}
                >
                  {doc.kind === "pdf" ? (
                    <div className="pdf-thumb">
                      <span>PDF</span>
                      <strong>{i + 1}</strong>
                      <span>{p.strokes.length ? "Annotated" : "Page"}</span>
                    </div>
                  ) : (
                    <PaperThumbnail page={p} />
                  )}
                  <span>{i + 1}</span>
                </button>
              </ContextActions>
            ))}
            {doc.kind !== "pdf" && (
              <button className="add-page-thumb" onClick={add}>
                <Plus size={20} />
                <span>Add page</span>
              </button>
            )}
          </aside>
        )}
        <div ref={viewport} className="page-viewport">
          {pdfError ? (
            <div className="document-error">
              <h2>Couldn’t open this PDF</h2>
              <p>{pdfError}</p>
            </div>
          ) : doc.kind === "pdf" && !pdf ? (
            <div className="page-loading" aria-label="Opening PDF" />
          ) : (
            page && (
              <ContextActions
                touch={false}
                items={[
                  {
                    label: "Undo ink",
                    icon: <Undo2 size={16} />,
                    onClick: () => ink.current?.undo(),
                    disabled: !history.undo,
                  },
                  {
                    label: "Redo ink",
                    icon: <Redo2 size={16} />,
                    onClick: () => ink.current?.redo(),
                    disabled: !history.redo,
                  },
                  {
                    label: "Select ink",
                    icon: <MousePointer2 size={16} />,
                    onClick: () => setTool("select"),
                    separator: true,
                  },
                  { label: "Pan page", icon: <Hand size={16} />, onClick: () => setTool("hand") },
                  ...(history.selection
                    ? [
                        {
                          label: "Rotate selection left",
                          icon: <RotateCcw size={16} />,
                          onClick: () => ink.current?.transformSelection(1, -Math.PI / 12),
                        },
                        {
                          label: "Rotate selection right",
                          icon: <RotateCw size={16} />,
                          onClick: () => ink.current?.transformSelection(1, Math.PI / 12),
                        },
                        {
                          label: "Make selection smaller",
                          icon: <Shrink size={16} />,
                          onClick: () => ink.current?.transformSelection(0.9, 0),
                        },
                        {
                          label: "Make selection larger",
                          icon: <Expand size={16} />,
                          onClick: () => ink.current?.transformSelection(1.1, 0),
                        },
                        {
                          label: "Delete selected ink",
                          icon: <Trash2 size={16} />,
                          onClick: () => ink.current?.removeSelection(),
                          danger: true,
                        },
                      ]
                    : []),
                ]}
              >
                <div
                  className="paper-page"
                  style={{
                    width: fit * zoom,
                    height: (fit * zoom * page.height) / page.width,
                    backgroundColor: doc.kind === "pdf" ? "#fff" : page.paper.color,
                  }}
                >
                  {doc.kind === "pdf" && pdf && (
                    <PdfPage pdf={pdf} number={index + 1} onText={setPdfText} />
                  )}
                  <InkSurface
                    ref={ink}
                    page={page}
                    tool={tool}
                    color={color}
                    width={width}
                    touchInk={preferences.touchInk}
                    transparent={doc.kind === "pdf"}
                    onChange={(strokes) => updatePage({ strokes })}
                    onHistory={(undo, redo, selection) => setHistory({ undo, redo, selection })}
                    onPinch={(factor) => setZoom((z) => Math.max(0.5, Math.min(3, z * factor)))}
                  />
                  {doc.example && index === 0 && doc.kind !== "pdf" && (
                    <span className="example-page-label">Editable example</span>
                  )}
                </div>
              </ContextActions>
            )
          )}
          {pdfText && doc.kind === "pdf" && (
            <div className="sr-only" aria-label={"Text of PDF page " + (index + 1)}>
              {pdfText}
            </div>
          )}
          <div className="page-bottom">
            <IconButton
              label="Previous page"
              disabled={index === 0}
              onClick={() => changeIndex(index - 1)}
            >
              <ChevronLeft size={17} />
            </IconButton>
            <span>
              {index + 1} / {doc.pages.length}
            </span>
            <IconButton
              label="Next page"
              disabled={index >= doc.pages.length - 1}
              onClick={() => changeIndex(index + 1)}
            >
              <ChevronRight size={17} />
            </IconButton>
            {doc.kind !== "pdf" && (
              <Menu
                trigger={
                  <IconButton label="Page actions">
                    <MoreHorizontal size={17} />
                  </IconButton>
                }
                items={[
                  { label: "Duplicate page", icon: <Copy size={16} />, onClick: duplicate },
                  {
                    label: "Move earlier",
                    icon: <ArrowUp size={16} />,
                    onClick: () => move(-1),
                    disabled: index === 0,
                  },
                  {
                    label: "Move later",
                    icon: <ArrowDown size={16} />,
                    onClick: () => move(1),
                    disabled: index === doc.pages.length - 1,
                  },
                  {
                    label: "Remove page",
                    icon: <Trash2 size={16} />,
                    onClick: remove,
                    danger: true,
                    disabled: doc.pages.length < 2,
                    separator: true,
                  },
                ]}
              />
            )}
          </div>
        </div>
      </div>
      <div className="ink-toolbar" aria-label="Ink tools">
        <div className="ink-tools">
          {tools.map((t) => (
            <IconButton
              immediateTouch
              key={t.id}
              label={t.label + " (" + t.key + ")"}
              aria-pressed={tool === t.id}
              className={tool === t.id ? "active" : ""}
              onClick={() => setTool(t.id)}
            >
              <t.icon size={20} strokeWidth={1.7} />
            </IconButton>
          ))}
        </div>
        <span className="toolbar-divider" />
        <div className="ink-colors">
          {(darkPaper ? darkInk : lightInk).map((c, i) => (
            <button
              key={c}
              aria-pressed={color === c}
              aria-label={inkNames[i] + " ink"}
              title={inkNames[i]}
              className={color === c ? "selected" : ""}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <Floating
          trigger={
            <button className="stroke-width" aria-label="Pen thickness" title="Pen thickness">
              <span style={{ height: Math.max(2, width * 1.3) }} />
              <ChevronDown size={12} />
            </button>
          }
        >
          <div className="width-picker">
            <h3>Pen thickness</h3>
            {[1.2, 2.2, 3.8, 5.5].map((w) => (
              <button key={w} className={width === w ? "selected" : ""} onClick={() => setWidth(w)}>
                <span style={{ height: w * 1.5 }} />
                {w === 1.2 ? "Fine" : w === 2.2 ? "Medium" : w === 3.8 ? "Bold" : "Heavy"}
              </button>
            ))}
          </div>
        </Floating>
        <span className="toolbar-divider" />
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
        {history.selection && (
          <Floating
            trigger={
              <IconButton label="Transform selected ink">
                <RotateCw size={18} />
              </IconButton>
            }
          >
            <div className="selection-transforms">
              <p>Drag a corner to resize or the round handle to rotate.</p>
              <button
                className="quiet-button"
                onClick={() => ink.current?.transformSelection(1, -Math.PI / 12)}
              >
                <RotateCcw size={16} />
                Rotate left 15°
              </button>
              <button
                className="quiet-button"
                onClick={() => ink.current?.transformSelection(1, Math.PI / 12)}
              >
                <RotateCw size={16} />
                Rotate right 15°
              </button>
              <button
                className="quiet-button"
                onClick={() => ink.current?.transformSelection(0.9, 0)}
              >
                <Shrink size={16} />
                Make smaller
              </button>
              <button
                className="quiet-button"
                onClick={() => ink.current?.transformSelection(1.1, 0)}
              >
                <Expand size={16} />
                Make larger
              </button>
            </div>
          </Floating>
        )}
        {history.selection && (
          <IconButton
            immediateTouch
            label="Delete selected ink"
            onClick={() => ink.current?.removeSelection()}
          >
            <Trash2 size={18} />
          </IconButton>
        )}
        <IconButton
          immediateTouch
          label={
            preferences.touchInk
              ? "Touch draws. Switch to touch panning"
              : "Touch pans. Switch to touch drawing"
          }
          aria-pressed={preferences.touchInk}
          className={"touch-toggle " + (preferences.touchInk ? "active" : "")}
          onClick={() => void workspace.preferences({ touchInk: !preferences.touchInk })}
        >
          <Fingerprint size={19} />
        </IconButton>
      </div>
    </div>
  );
}
