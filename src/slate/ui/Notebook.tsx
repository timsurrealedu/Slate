import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { prepareInkSave } from "../core/ink-save";
import {
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
import { InkToolbar, inkTools, inkColorForPaper } from "./InkToolbar";
import { PaperPicker, PaperThumbnail, PdfPage } from "./Paper";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getAsset } from "../core/storage";
import { downloadBlob } from "../platform/export";
import { loadPdf } from "../documents/files";
const MAX_ZOOM = 10;
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
    [zoomView, setZoomView] = useState({ zoom: 1 });
  const zoom = zoomView.zoom;
  const thumbnails = preferences.notebookPages;
  const [history, setHistory] = useState({ undo: false, redo: false, selection: false }),
    [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [pdfError, setPdfError] = useState(""),
    [pdfText, setPdfText] = useState("");
  const ink = useRef<InkHandle>(null),
    viewport = useRef<HTMLDivElement>(null),
    zoomLabel = useRef<HTMLButtonElement>(null);
  const zoomRef = useRef(zoom);
  const pinch = useRef<{
    paper: HTMLElement;
    rect: DOMRect;
    viewportRect: DOMRect;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    bottomSpace: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    scrollX: number;
    scrollY: number;
    zoom: number;
    frame: number;
  } | null>(null);
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  function startPinch(clientX: number, clientY: number) {
    if (pinch.current) {
      zoomAt(1, clientX, clientY);
      return;
    }
    const el = viewport.current;
    const paper = el?.querySelector<HTMLElement>(".paper-page");
    if (!el || !paper) return;
    const rect = paper.getBoundingClientRect();
    const style = getComputedStyle(el),
      footer = el.querySelector<HTMLElement>(".page-bottom"),
      footerStyle = footer && getComputedStyle(footer);
    const x = (clientX - rect.left) / rect.width,
      y = (clientY - rect.top) / rect.height;
    pinch.current = {
      paper,
      rect,
      viewportRect: el.getBoundingClientRect(),
      x,
      y,
      clientX,
      clientY,
      paddingLeft: parseFloat(style.paddingLeft),
      paddingRight: parseFloat(style.paddingRight),
      paddingTop: parseFloat(style.paddingTop),
      bottomSpace:
        parseFloat(style.paddingBottom) +
        (footer?.offsetHeight || 0) +
        (footerStyle
          ? parseFloat(footerStyle.marginTop) + parseFloat(footerStyle.marginBottom)
          : 0),
      scrollX: el.scrollLeft,
      scrollY: el.scrollTop,
      zoom: zoomRef.current,
      frame: 0,
    };
    paper.style.transformOrigin = "0 0";
    paper.classList.add("pinching");
  }
  function paintPinch() {
    const gesture = pinch.current;
    const el = viewport.current;
    if (!gesture || !el) return;
    gesture.frame = 0;
    const scale = zoomRef.current / gesture.zoom,
      width = gesture.rect.width * scale,
      height = gesture.rect.height * scale,
      innerWidth = el.clientWidth - gesture.paddingLeft - gesture.paddingRight,
      left =
        gesture.viewportRect.left +
        el.clientLeft +
        gesture.paddingLeft +
        Math.max(0, (innerWidth - width) / 2),
      top = gesture.viewportRect.top + el.clientTop + gesture.paddingTop;
    const paperLeft = Math.max(
        left - Math.max(0, width - innerWidth),
        Math.min(left, gesture.clientX - gesture.x * width),
      ),
      paperTop = Math.max(
        top - Math.max(0, height + gesture.paddingTop + gesture.bottomSpace - el.clientHeight),
        Math.min(top, gesture.clientY - gesture.y * height),
      );
    const x = paperLeft - gesture.rect.left + el.scrollLeft - gesture.scrollX,
      y = paperTop - gesture.rect.top + el.scrollTop - gesture.scrollY;
    gesture.paper.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(zoomRef.current * 100)}%`;
  }
  const finishPinch = useCallback((immediate = false) => {
    const gesture = pinch.current;
    if (!gesture) return;
    cancelAnimationFrame(gesture.frame);
    pinch.current = null;
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(zoomRef.current * 100)}%`;
    anchor.current = {
      x: gesture.x,
      y: gesture.y,
      clientX: gesture.clientX,
      clientY: gesture.clientY,
    };
    // Resize the drawing buffer once, after the composited gesture has finished.
    const settle = () => setZoomView({ zoom: zoomRef.current });
    if (immediate) flushSync(settle);
    else settle();
  }, []);
  useEffect(() => {
    if (!active) finishPinch();
  }, [active, finishPinch]);
  function zoomAt(
    factor: number,
    clientX: number,
    clientY: number,
    previousX = clientX,
    previousY = clientY,
  ) {
    const next = Math.min(MAX_ZOOM, Math.max(0.5, zoomRef.current * factor));
    const gesture = pinch.current;
    if (gesture) {
      zoomRef.current = next;
      gesture.clientX = clientX;
      gesture.clientY = clientY;
      if (!gesture.frame) gesture.frame = requestAnimationFrame(paintPinch);
      return;
    }
    const el = viewport.current;
    const paper = el?.querySelector<HTMLElement>(".paper-page");
    if (!el || !paper) return;
    if (next === zoomRef.current && !anchor.current) {
      el.scrollLeft -= clientX - previousX;
      el.scrollTop -= clientY - previousY;
      return;
    }
    const rect = paper.getBoundingClientRect();
    anchor.current = {
      x: anchor.current?.x ?? (previousX - rect.left) / rect.width,
      y: anchor.current?.y ?? (previousY - rect.top) / rect.height,
      clientX,
      clientY,
    };
    zoomRef.current = next;
    setZoomView({ zoom: next });
  }
  function zoomFromCenter(next: number) {
    const el = viewport.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(next / zoomRef.current, rect.left + el.clientWidth / 2, rect.top + el.clientHeight / 2);
  }
  useLayoutEffect(() => {
    const el = viewport.current;
    const paper = el?.querySelector<HTMLElement>(".paper-page");
    const point = anchor.current;
    if (el && paper && point) {
      paper.style.removeProperty("transform");
      paper.style.removeProperty("transform-origin");
      paper.classList.remove("pinching");
      const rect = paper.getBoundingClientRect();
      el.scrollLeft += rect.left + point.x * rect.width - point.clientX;
      el.scrollTop += rect.top + point.y * rect.height - point.clientY;
    }
    anchor.current = null;
  }, [zoomView]);
  const [fit, setFit] = useState(650);
  const page = doc.pages[Math.min(index, doc.pages.length - 1)];
  const paperColor = page?.paper.color || "#ffffff";
  const darkPaper =
    [1, 3, 5].reduce(
      (sum, at, i) =>
        sum + parseInt(paperColor.slice(at, at + 2), 16) * [0.2126, 0.7152, 0.0722][i],
      0,
    ) < 110;
  const current = useRef({ doc, page });
  current.current = { doc, page };
  useEffect(() => {
    const el = viewport.current!;
    const observer = new ResizeObserver(() =>
      setFit(Math.min(760, Math.max(180, el.clientWidth - (el.clientWidth < 500 ? 24 : 80)))),
    );
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(Math.exp(-e.deltaY / 450), e.clientX, e.clientY);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      if (pinch.current) cancelAnimationFrame(pinch.current.frame);
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
          if (e.shiftKey) ink.current?.redo();
          else ink.current?.undo();
        }
        return;
      }
      const entry = inkTools.find(
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
  useEffect(() => {
    prepareInkSave(doc);
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
          onClick={() => void workspace.preferences({ notebookPages: !thumbnails })}
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
          <IconButton
            label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => zoomFromCenter(Math.max(0.5, zoom - 0.1))}
          >
            <Minus size={14} />
          </IconButton>
          <button ref={zoomLabel} title="Fit page width" onClick={() => zoomFromCenter(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => zoomFromCenter(Math.min(MAX_ZOOM, zoom + 0.1))}
          >
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
        <div className="notebook-paper-area">
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
                      color={inkColorForPaper(preferences.inkColor, darkPaper)}
                      width={preferences.inkWidth}
                      touchInk={preferences.touchInk}
                      penPressure={preferences.penPressure}
                      transparent={doc.kind === "pdf"}
                      onChange={(strokes) => updatePage({ strokes })}
                      onHistory={(undo, redo, selection) =>
                        setHistory((previous) =>
                          previous.undo === undo &&
                          previous.redo === redo &&
                          previous.selection === selection
                            ? previous
                            : { undo, redo, selection },
                        )
                      }
                      onPinch={zoomAt}
                      onPinchStart={startPinch}
                      onPinchEnd={finishPinch}
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
          <InkToolbar
            tool={tool}
            onTool={setTool}
            darkPaper={darkPaper}
            history={history}
            ink={ink}
          />
        </div>
      </div>
    </div>
  );
}
