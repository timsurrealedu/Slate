import { useLayoutEffect, useRef, useId, useMemo, forwardRef, useImperativeHandle } from "react";
import type { Page, Point, Stroke } from "../core/model";
import {
  drawLiveStroke,
  drawStroke,
  releaseStrokeGeometry,
  strokePath,
  strokePathChunks,
} from "./render";
import {
  bounds,
  contains,
  hitStroke,
  intersects,
  translate,
  transform,
  type Rect,
} from "./geometry";
export type InkTool = "pen" | "highlighter" | "eraser" | "select" | "hand";
export interface InkHandle {
  undo(): void;
  redo(): void;
  removeSelection(): void;
  transformSelection(scale: number, angle: number): void;
}
interface Props {
  page: Page;
  tool: InkTool;
  color: string;
  width: number;
  touchInk: boolean;
  penPressure: boolean;
  transparent?: boolean;
  onChange(strokes: Stroke[]): void;
  onHistory?(undo: boolean, redo: boolean, selection: boolean): void;
  onPinch?(factor: number, x: number, y: number, previousX: number, previousY: number): void;
  onPinchStart?(x: number, y: number): void;
  onPinchEnd?(immediate?: boolean): void;
}
interface Gesture {
  pointerType: string;
  id: number;
  start: Point;
  mode: "draw" | "erase" | "select" | "move" | "pan" | "resize" | "rotate";
  box?: Rect;
  stroke?: Stroke;
  original: Stroke[];
  changed?: Stroke[];
  scrollX: number;
  scrollY: number;
  clientX: number;
  clientY: number;
  rawSamples?: Point[];
}
function penContact(e: PointerEvent) {
  return !!(e.buttons & 33) || e.pressure > 0;
}
export const InkSurface = forwardRef<InkHandle, Props>(function InkSurface(props, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    rasterRef = useRef<HTMLCanvasElement>(null),
    liveRasterRef = useRef<HTMLCanvasElement>(null),
    inkRef = useRef<SVGGElement>(null),
    liveInkRef = useRef<SVGGElement>(null),
    propsRef = useRef(props);
  const patternId = useId();
  const paperLines = useMemo(() => {
    const { width, height, paper } = props.page;
    let d = "";
    if (paper.style === "lined" || paper.style === "grid") {
      for (let y = paper.style === "lined" ? 74 : paper.spacing; y < height; y += paper.spacing)
        d += `M${paper.style === "lined" ? 52 : 0},${y}H${paper.style === "lined" ? width - 52 : width}`;
      if (paper.style === "grid")
        for (let x = paper.spacing; x < width; x += paper.spacing) d += `M${x},0V${height}`;
    }
    return d;
  }, [props.page.width, props.page.height, props.page.paper]);
  const runtime = useRef({
    vectorStrokes: null as Stroke[] | null,
    vectorPaths: new Map<string, { element: SVGPathElement; stroke: Stroke }>(),
    liveStroke: null as Stroke | null,
    livePaths: [] as SVGPathElement[],
    liveChunks: [] as string[],
    livePoints: 0,
    liveRasterStroke: null as Stroke | null,
    liveRasterPoints: 0,
    liveRasterPressure: 0.5,
    appendFrom: -1,
    rasterAppendFrom: -1,
    rasterStrokes: null as Stroke[] | null,
    rasterRect: null as Rect | null,
    rasterDirty: true,
    rasterScrolled: false,
    rasterActive: false,
    rasterBounds: new WeakMap<Stroke, Rect | null>(),
    rasterTimer: 0 as ReturnType<typeof setTimeout> | 0,
    pageShape: null as {
      width: number;
      height: number;
      paper: Page["paper"];
      transparent?: boolean;
    } | null,
    inputRect: null as DOMRect | null,
    selectionPainted: false,
    strokes: props.page.strokes,
    history: [] as Stroke[][],
    future: [] as Stroke[][],
    gesture: null as Gesture | null,
    selection: new Set<string>(),
    rect: null as Rect | null,
    frame: 0,
    pan: null as { x: number; y: number } | null,
    touches: new Map<number, { x: number; y: number }>(),
    rejectedTouches: new Set<number>(),
    pinchDistance: 0,
    penUntil: 0,
    twoFinger: null as {
      started: number;
      x: number;
      y: number;
      startX: number;
      startY: number;
      distance: number;
      moved: boolean;
    } | null,
    lastTap: null as { time: number; x: number; y: number } | null,
    pageId: props.page.id,
    pageHistory: new Map<string, { history: Stroke[][]; future: Stroke[][] }>(),
  });
  propsRef.current = props;
  function status() {
    const r = runtime.current;
    propsRef.current.onHistory?.(!!r.history.length, !!r.future.length, !!r.selection.size);
  }
  function commit(strokes: Stroke[], append = false) {
    const r = runtime.current;
    if (append) {
      if (r.appendFrom < 0 && r.vectorStrokes === r.strokes) r.appendFrom = r.strokes.length;
      if (r.rasterAppendFrom < 0 && r.rasterStrokes === r.strokes)
        r.rasterAppendFrom = r.strokes.length;
    } else r.appendFrom = r.rasterAppendFrom = -1;
    r.history.push(r.strokes);
    if (r.history.length > 80) r.history.shift();
    r.future = [];
    r.strokes = strokes;
    propsRef.current.onChange(strokes);
    redrawBase();
    status();
  }
  function resize() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    runtime.current.inputRect = null;
    runtime.current.rasterDirty = true;
    clearLiveInk();
    const { page } = propsRef.current;
    const displayed = canvas.getBoundingClientRect().width;
    if (!displayed) return;
    const logicalWidth = Math.max(page.width, displayed);
    const aspect = page.height / page.width;
    // Bound backing buffers on mobile while CSS keeps the page at the requested zoom.
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(8_000_000 / (logicalWidth * logicalWidth * aspect)),
      4096 / (logicalWidth * Math.max(1, aspect)),
    );
    const width = Math.ceil(logicalWidth * ratio);
    const height = Math.ceil(width * aspect);
    if (canvas.width === width && canvas.height === height) {
      redrawBase();
      return;
    }
    redrawBase(false);
    cancelAnimationFrame(runtime.current.frame);
    runtime.current.frame = 0;
    // Prepare ink before clearing the visible canvas, then publish it in the same frame.
    canvas.width = width;
    canvas.height = height;
    paint();
  }
  function redrawBase(defer = true) {
    if (defer) schedule();
  }
  function rasterMode(active: boolean) {
    const r = runtime.current;
    if (r.rasterTimer) clearTimeout(r.rasterTimer);
    r.rasterTimer = 0;
    r.rasterActive = active;
    if (!active && r.vectorStrokes !== r.strokes) {
      // Keep cached ink visible until its replacement vectors have been published.
      schedule();
      return;
    }
    const ready = active && !!r.rasterRect;
    if (inkRef.current) inkRef.current.style.display = ready ? "none" : "";
    if (rasterRef.current) rasterRef.current.style.visibility = ready ? "visible" : "hidden";
  }
  function sizeRaster(
    raster: HTMLCanvasElement,
    b: DOMRect,
    viewport: DOMRect,
    ctx: CanvasRenderingContext2D,
  ) {
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const whole =
      b.width * b.height * density * density <= 4_000_000 &&
      Math.max(b.width, b.height) * density <= 4096;
    const x = whole ? 0 : Math.max(0, Math.min(b.width - 1, viewport.left - b.left - 192)),
      y = whole ? 0 : Math.max(0, Math.min(b.height - 1, viewport.top - b.top - 192));
    const width = whole
      ? b.width
      : Math.max(1, Math.min(b.width - x, viewport.right - b.left + 192 - x));
    const height = whole
      ? b.height
      : Math.max(1, Math.min(b.height - y, viewport.bottom - b.top + 192 - y));
    const ratio = Math.min(
      density,
      4096 / Math.max(width, height),
      Math.sqrt(4_000_000 / (width * height)),
    );
    const scale = b.width / propsRef.current.page.width;
    const pixelWidth = Math.ceil(width * ratio),
      pixelHeight = Math.ceil(height * ratio);
    if (raster.width !== pixelWidth) raster.width = pixelWidth;
    if (raster.height !== pixelHeight) raster.height = pixelHeight;
    Object.assign(raster.style, {
      left: x + "px",
      top: y + "px",
      width: width + "px",
      height: height + "px",
    });
    const ratioX = raster.width / width,
      ratioY = raster.height / height;
    ctx.setTransform(ratioX * scale, 0, 0, ratioY * scale, -x * ratioX, -y * ratioY);
    return { x: x / scale, y: y / scale, width: width / scale, height: height / scale };
  }
  function clearLiveInk() {
    const r = runtime.current,
      stroke = r.liveRasterStroke;
    if (!stroke) return;
    const box = bounds([stroke]);
    if (box)
      liveRasterRef.current
        ?.getContext("2d")
        ?.clearRect(
          box.x - stroke.width - 2,
          box.y - stroke.width - 2,
          box.width + stroke.width * 2 + 4,
          box.height + stroke.width * 2 + 4,
        );
    r.liveRasterStroke = null;
  }
  function paintInputInk() {
    const r = runtime.current,
      stroke = r.gesture?.stroke,
      raster = liveRasterRef.current;
    if (!stroke || !raster) return;
    const ctx = raster.getContext("2d", { desynchronized: true });
    if (!ctx) {
      paintLiveInk();
      return;
    }
    if (stroke !== r.liveRasterStroke) {
      clearLiveInk();
      const b = r.inputRect ?? canvasRef.current!.getBoundingClientRect();
      sizeRaster(
        raster,
        b,
        canvasRef.current!.closest(".page-viewport")!.getBoundingClientRect(),
        ctx,
      );
      r.liveRasterStroke = stroke;
      r.liveRasterPoints = 0;
      r.liveRasterPressure = stroke.points[0].p;
      // Composite transparency once for the whole stroke, including retracing and batch overlaps.
      raster.style.opacity = stroke.tool === "highlighter" ? "0.3" : "1";
      raster.style.visibility = "visible";
      if (liveInkRef.current) liveInkRef.current.style.display = "none";
    }
    if (r.liveRasterPoints < stroke.points.length) {
      r.liveRasterPressure = drawLiveStroke(ctx, stroke, r.liveRasterPoints, r.liveRasterPressure);
      r.liveRasterPoints = stroke.points.length;
    }
  }
  function paintRaster(strokes: Stroke[], appendFrom: number) {
    const raster = rasterRef.current,
      canvas = canvasRef.current,
      r = runtime.current;
    if (!raster || !canvas) return;
    const ctx = raster.getContext("2d")!;
    let start = appendFrom;
    if (r.rasterScrolled && r.rasterRect && !r.rasterDirty) {
      const page = propsRef.current.page,
        cached = r.rasterRect;
      if (
        cached.x > 0 ||
        cached.y > 0 ||
        cached.width < page.width ||
        cached.height < page.height
      ) {
        const b = canvas.getBoundingClientRect(),
          v = canvas.closest(".page-viewport")!.getBoundingClientRect();
        const scale = b.width / page.width;
        const left = Math.max(0, v.left - b.left) / scale,
          top = Math.max(0, v.top - b.top) / scale;
        const right = Math.min(b.width, v.right - b.left) / scale,
          bottom = Math.min(b.height, v.bottom - b.top) / scale;
        r.rasterDirty =
          left < cached.x ||
          top < cached.y ||
          right > cached.x + cached.width ||
          bottom > cached.y + cached.height;
      }
    }
    r.rasterScrolled = false;
    if (r.rasterDirty || !r.rasterRect) {
      const b = canvas.getBoundingClientRect();
      if (!b.width) return;
      const viewport = canvas.closest(".page-viewport")!.getBoundingClientRect();
      // Ordinary pages fit in the bounded cache. At high zoom, reuse a generous visible slice.
      r.rasterRect = sizeRaster(raster, b, viewport, ctx);
      ctx.save();
      ctx.resetTransform();
      ctx.clearRect(0, 0, raster.width, raster.height);
      ctx.restore();
      r.rasterDirty = false;
      start = 0;
    } else if (strokes !== r.rasterStrokes && start < 0) {
      ctx.save();
      ctx.resetTransform();
      ctx.clearRect(0, 0, raster.width, raster.height);
      ctx.restore();
      start = 0;
    }
    if (strokes !== r.rasterStrokes || start === 0) {
      for (let i = Math.max(0, start); i < strokes.length; i++) {
        const stroke = strokes[i];
        if (!r.rasterBounds.has(stroke)) r.rasterBounds.set(stroke, bounds([stroke]));
        const box = r.rasterBounds.get(stroke);
        if (
          box &&
          intersects(
            {
              x: box.x - strokes[i].width,
              y: box.y - strokes[i].width,
              width: box.width + strokes[i].width * 2,
              height: box.height + strokes[i].width * 2,
            },
            r.rasterRect!,
          )
        )
          drawStroke(ctx, strokes[i]);
      }
      r.rasterStrokes = strokes;
    }
    if (r.rasterActive) {
      if (inkRef.current) inkRef.current.style.display = "none";
      raster.style.visibility = "visible";
    } else {
      if (inkRef.current) inkRef.current.style.display = "";
      raster.style.visibility = "hidden";
    }
  }
  function paintInk() {
    const r = runtime.current,
      g = r.gesture,
      group = inkRef.current,
      live = liveInkRef.current;
    if (!group || !live) return;
    const strokes = g?.changed || r.strokes;
    const changed = strokes !== r.vectorStrokes;
    const appendFrom = strokes !== r.vectorStrokes && !g?.changed ? r.appendFrom : -1;
    if (r.rasterActive && !g?.changed) {
      paintRaster(strokes, r.rasterAppendFrom);
      if (r.rasterStrokes === strokes) r.rasterAppendFrom = -1;
      paintLiveInk();
      return;
    }
    if (strokes !== r.vectorStrokes) {
      if (appendFrom < 0) {
        const ids = new Set(strokes.map((s) => s.id));
        for (const [id, path] of r.vectorPaths) {
          if (!ids.has(id)) {
            path.element.remove();
            r.vectorPaths.delete(id);
          }
        }
      }
      let cursor = appendFrom < 0 ? group.firstChild : null;
      const deadline = performance.now() + 4;
      for (let i = Math.max(0, appendFrom); i < strokes.length; i++) {
        const stroke = strokes[i];
        let path = r.vectorPaths.get(stroke.id);
        if (!path) {
          path = {
            element:
              r.liveStroke === stroke && r.livePaths.length === 1
                ? r.livePaths[0]
                : document.createElementNS("http://www.w3.org/2000/svg", "path"),
            stroke,
          };
          r.vectorPaths.set(stroke.id, path);
          path.element.setAttribute("d", strokePath(stroke));
          path.element.setAttribute("fill", stroke.color);
          path.element.setAttribute("opacity", stroke.tool === "highlighter" ? "0.3" : "1");
        } else if (path.stroke !== stroke) {
          path.stroke = stroke;
          path.element.setAttribute("d", strokePath(stroke));
          path.element.setAttribute("fill", stroke.color);
        }
        // Existing paths stay attached. A pen lift appends only the new stroke.
        if (path.element !== cursor) group.insertBefore(path.element, cursor);
        cursor = path.element.nextSibling;
        if (appendFrom >= 0 && i + 1 < strokes.length && performance.now() >= deadline) {
          for (let j = appendFrom; j <= i; j++) releaseStrokeGeometry(strokes[j]);
          r.appendFrom = i + 1;
          schedule();
          return;
        }
      }
      r.vectorStrokes = strokes;
    }
    paintRaster(strokes, g?.changed ? -1 : r.rasterAppendFrom);
    if (r.rasterStrokes === strokes) r.rasterAppendFrom = -1;
    if (changed)
      for (let i = Math.max(0, appendFrom); i < strokes.length; i++)
        releaseStrokeGeometry(strokes[i]);
    r.appendFrom = -1;
    paintLiveInk();
  }
  function paintLiveInk() {
    const r = runtime.current,
      live = liveInkRef.current;
    if (!live) return;
    const g = r.gesture;
    const stroke = g?.stroke || null;
    // The immediate canvas already owns live ink. Avoid building hidden SVG geometry.
    if (stroke && stroke === r.liveRasterStroke) return;
    if (stroke !== r.liveStroke) {
      live.replaceChildren();
      r.livePaths = [];
      r.liveChunks = [];
      r.livePoints = 0;
      r.liveStroke = stroke;
      if (stroke) {
        live.setAttribute("fill", stroke.color);
        // Apply transparency to the whole stroke, including overlapping chunks.
        live.setAttribute("opacity", stroke.tool === "highlighter" ? "0.3" : "1");
      }
    }
    if (stroke) {
      const chunks = strokePathChunks(stroke);
      for (let i = Math.floor(r.livePoints / 64); i < chunks.length; i++) {
        if (r.liveChunks[i] === chunks[i]) continue;
        const path =
          r.livePaths[i] ?? document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", chunks[i]);
        if (!r.livePaths[i]) live.appendChild(path);
        r.livePaths[i] = path;
        r.liveChunks[i] = chunks[i];
      }
      r.livePoints = stroke.points.length;
    }
  }
  function paint() {
    const canvas = canvasRef.current,
      r = runtime.current;
    r.frame = 0;
    if (!canvas) return;
    if (r.pan) {
      const viewport = canvas.closest(".page-viewport") as HTMLElement;
      viewport.scrollTo({ left: r.pan.x, top: r.pan.y, behavior: "instant" });
      r.pan = null;
      r.inputRect = null;
      r.rasterScrolled = true;
    }
    paintInk();
    if (r.gesture?.stroke) paintInputInk();
    else {
      if (liveRasterRef.current) liveRasterRef.current.style.visibility = "hidden";
      if (liveInkRef.current) liveInkRef.current.style.display = "";
    }
    const g = r.gesture;
    let rect =
      r.rect || (r.selection.size ? bounds(r.strokes.filter((s) => r.selection.has(s.id))) : null);
    if (r.selection.size && (g?.mode === "move" || g?.mode === "resize" || g?.mode === "rotate"))
      rect = bounds((g.changed || g.original).filter((s) => r.selection.has(s.id)));
    // Drawing does not need to clear a page-sized selection buffer on every frame.
    if (!rect && !r.selectionPainted) return;
    r.selectionPainted = !!rect;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(
      canvas.width / propsRef.current.page.width,
      canvas.height / propsRef.current.page.height,
    );
    if (rect) {
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--accent").trim();
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--accent-wash").trim();
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.08;
      ctx.fillRect(rect.x - 4, rect.y - 4, rect.width + 8, rect.height + 8);
      ctx.globalAlpha = 1;
      ctx.strokeRect(rect.x - 4, rect.y - 4, rect.width + 8, rect.height + 8);
      if (r.selection.size && !r.rect) {
        const unit = propsRef.current.page.width / canvas.getBoundingClientRect().width;
        ctx.setLineDash([]);
        ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--panel").trim();
        const corners = [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y],
          [rect.x, rect.y + rect.height],
          [rect.x + rect.width, rect.y + rect.height],
        ];
        for (const [x, y] of corners) {
          ctx.fillRect(x - 5 * unit, y - 5 * unit, 10 * unit, 10 * unit);
          ctx.strokeRect(x - 5 * unit, y - 5 * unit, 10 * unit, 10 * unit);
        }
        const x = rect.x + rect.width / 2,
          y = rect.y - 28 * unit;
        ctx.beginPath();
        ctx.moveTo(x, rect.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 6 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function schedule() {
    if (!runtime.current.frame) runtime.current.frame = requestAnimationFrame(paint);
  }
  function undo() {
    const r = runtime.current,
      old = r.history.pop();
    if (!old) return;
    r.future.push(r.strokes);
    r.appendFrom = r.rasterAppendFrom = -1;
    r.strokes = old;
    r.selection.clear();
    propsRef.current.onChange(old);
    redrawBase();
    status();
  }
  useImperativeHandle(forwardedRef, () => ({
    undo,
    redo() {
      const r = runtime.current;
      const next = r.future.pop();
      if (!next) return;
      r.history.push(r.strokes);
      r.appendFrom = -1;
      r.rasterAppendFrom = -1;
      r.strokes = next;
      r.selection.clear();
      propsRef.current.onChange(next);
      redrawBase();
      status();
    },
    removeSelection() {
      const r = runtime.current;
      if (!r.selection.size) return;
      const next = r.strokes.filter((s) => !r.selection.has(s.id));
      r.selection.clear();
      commit(next);
    },
    transformSelection(scale, angle) {
      const r = runtime.current,
        box = bounds(r.strokes.filter((s) => r.selection.has(s.id)));
      if (!box) return;
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      commit(
        r.strokes.map((s) => (r.selection.has(s.id) ? transform(s, center, scale, angle) : s)),
      );
    },
  }));
  useLayoutEffect(() => {
    const r = runtime.current;
    const changed =
      !r.pageShape ||
      r.pageId !== props.page.id ||
      r.pageShape.width !== props.page.width ||
      r.pageShape.height !== props.page.height ||
      r.pageShape.paper !== props.page.paper ||
      r.pageShape.transparent !== props.transparent;
    if (r.pageId !== props.page.id) {
      r.pageHistory.set(r.pageId, { history: r.history, future: r.future });
      r.pageId = props.page.id;
      const previous = r.pageHistory.get(r.pageId);
      r.history = previous?.history || [];
      r.future = previous?.future || [];
      r.selection.clear();
      r.rect = null;
      r.gesture = null;
      r.touches.clear();
      r.rejectedTouches.clear();
      r.pan = null;
      r.twoFinger = null;
      r.lastTap = null;
      r.appendFrom = r.rasterAppendFrom = -1;
      rasterMode(false);
    }
    r.strokes = props.page.strokes;
    r.pageShape = {
      width: props.page.width,
      height: props.page.height,
      paper: props.page.paper,
      transparent: props.transparent,
    };
    if (changed) {
      r.rasterDirty = true;
      resize();
    } else schedule();
    status();
  }, [
    props.page.id,
    props.page.strokes,
    props.page.paper,
    props.page.width,
    props.page.height,
    props.transparent,
  ]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const viewport = canvas.closest(".page-viewport") as HTMLElement;
    const invalidateInputRect = () => {
      runtime.current.inputRect = null;
      runtime.current.rasterScrolled = true;
      if (runtime.current.gesture?.stroke) clearLiveInk();
      schedule();
    };
    const point = (e: PointerEvent): Point => {
      const b = (runtime.current.inputRect ??= canvas.getBoundingClientRect()),
        p = propsRef.current.page;
      return {
        x: ((e.clientX - b.left) * p.width) / b.width,
        y: ((e.clientY - b.top) * p.height) / b.height,
        p: e.pointerType === "pen" ? e.pressure : 0.5,
        t: e.timeStamp,
      };
    };
    function erase(x: number, y: number) {
      const r = runtime.current,
        g = r.gesture!;
      const radius = (10 * propsRef.current.page.width) / canvas.getBoundingClientRect().width;
      const next = (g.changed || g.original).filter((s) => !hitStroke(s, x, y, radius));
      if (next.length !== (g.changed || g.original).length) {
        g.changed = next;
        redrawBase();
      }
    }
    function capture(e: PointerEvent) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (error) {
        // A forwarded/interrupted stream can lack capture state; window listeners retain its ink.
        if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
      }
    }
    function down(e: PointerEvent, first = e) {
      const r = runtime.current,
        p = propsRef.current;
      const onPaper = e.target === canvas;
      if (
        !onPaper &&
        (e.pointerType !== "touch" || (e.target as Element).closest("button,input,a,[role=button]"))
      )
        return;
      if (e.pointerType === "pen" && !penContact(e)) return;
      if (e.pointerType === "pen" && r.gesture && r.gesture.pointerType !== "touch") finish();
      if (
        e.pointerType === "touch" &&
        (r.gesture?.pointerType === "pen" ||
          performance.now() < r.penUntil ||
          e.width > 40 ||
          e.height > 40)
      ) {
        // A contact rejected near a pen stays a palm until it lifts, including between letters.
        r.rejectedTouches.add(e.pointerId);
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (e.pointerType === "pen" || (e.pointerType === "touch" && p.touchInk)) {
        // Settle entry motion before capturing coordinates: paper must stay under the nib.
        const shell = canvas.closest(".document-shell");
        for (const animation of shell?.getAnimations() || []) {
          const last = (animation.effect as KeyframeEffect | null)?.getKeyframes().at(-1);
          if (animation.playState === "running" && last?.transform === "none") animation.finish();
        }
        const app = canvas.closest(".slate-app");
        for (const element of app?.querySelectorAll(".workspace-topbar-slot, .workspace-topbar") ||
          [])
          for (const animation of element.getAnimations())
            if (animation.playState === "running") animation.finish();
      }
      r.inputRect = null;
      if (e.pointerType === "pen" && r.gesture?.pointerType === "touch") {
        // A palm that lands before the nib must not leave ink or shift the paper.
        const g = r.gesture;
        if (g.mode === "pan") {
          r.pan = null;
          if (e.timeStamp - g.start.t < 350)
            viewport.scrollTo({ left: g.scrollX, top: g.scrollY, behavior: "instant" });
          r.rasterScrolled = true;
        }
        r.gesture = null;
        r.rect = null;
        r.lastTap = null;
        redrawBase();
      }
      if (e.pointerType === "pen") {
        if (r.twoFinger) p.onPinchEnd?.(true);
        r.penUntil = performance.now() + 350;
        for (const id of r.touches.keys()) r.rejectedTouches.add(id);
        r.touches.clear();
        r.twoFinger = null;
        r.lastTap = null;
        r.pinchDistance = 0;
      }
      if (e.pointerType === "touch") {
        r.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (r.touches.size === 2) {
          // A second finger cancels provisional ink; it never commits a stray dot.
          r.gesture = null;
          r.rect = null;
          redrawBase();
          const [a, b] = [...r.touches.values()];
          r.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          const x = (a.x + b.x) / 2,
            y = (a.y + b.y) / 2;
          rasterMode(false);
          p.onPinchStart?.(x, y);
          r.twoFinger = {
            started: e.timeStamp,
            x,
            y,
            startX: x,
            startY: y,
            distance: r.pinchDistance,
            moved: false,
          };
          capture(e);
          return;
        }
        if (r.twoFinger) return;
        if (r.gesture && r.gesture.id !== e.pointerId) return;
      }
      if (r.gesture || (e.button !== 0 && e.pointerType !== "pen")) return;
      e.preventDefault();
      capture(e);
      canvas.focus({ preventScroll: true });
      const start = point(first),
        selection = r.selection.size
          ? bounds(r.strokes.filter((s) => r.selection.has(s.id)))
          : null;
      const unit = p.page.width / r.inputRect!.width;
      const near = (x: number, y: number) => Math.hypot(start.x - x, start.y - y) < 12 * unit;
      const resizeHandle =
        selection &&
        [
          [selection.x, selection.y],
          [selection.x + selection.width, selection.y],
          [selection.x, selection.y + selection.height],
          [selection.x + selection.width, selection.y + selection.height],
        ].some(([x, y]) => near(x, y));
      const rotateHandle =
        selection && near(selection.x + selection.width / 2, selection.y - 28 * unit);
      const mode =
        p.tool === "hand" || (e.pointerType === "touch" && (!p.touchInk || !onPaper))
          ? "pan"
          : e.buttons === 32 || p.tool === "eraser"
            ? "erase"
            : p.tool === "select"
              ? rotateHandle
                ? "rotate"
                : resizeHandle
                  ? "resize"
                  : selection && contains(selection, start.x, start.y)
                    ? "move"
                    : "select"
              : "draw";
      r.gesture = {
        pointerType: e.pointerType,
        id: e.pointerId,
        start,
        mode,
        original: r.strokes,
        box: selection || undefined,
        scrollX: viewport?.scrollLeft || 0,
        scrollY: viewport?.scrollTop || 0,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      if (mode === "draw")
        r.gesture.stroke = {
          id: crypto.randomUUID(),
          tool: p.tool === "highlighter" ? "highlighter" : "pen",
          color: p.color,
          width: p.tool === "highlighter" ? 14 + ((p.width - 0.6) / 0.6) * 2 : p.width,
          points: [start],
          rendering: "precise",
          pressureSensitive: p.penPressure,
        };
      rasterMode(mode === "draw" || mode === "pan");
      if (mode === "draw") paintInputInk();
      if (mode === "erase") erase(start.x, start.y);
      if (mode === "select") {
        r.selection.clear();
        r.rect = { x: start.x, y: start.y, width: 0, height: 0 };
      }
      if (mode === "move" || mode === "resize" || mode === "rotate") {
        r.gesture.changed = r.strokes;
        redrawBase();
      }
      schedule();
    }
    function move(e: PointerEvent) {
      const r = runtime.current;
      const coalesced = e.getCoalescedEvents?.();
      // Recover a contact from its first received hardware point when down was not delivered.
      if (e.pointerType === "pen" && penContact(e) && (!r.gesture || r.gesture.id !== e.pointerId))
        down(e, coalesced?.[0] || e);
      if (r.rejectedTouches.has(e.pointerId)) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (e.pointerType === "pen" && penContact(e)) r.penUntil = performance.now() + 350;
      if (r.touches.has(e.pointerId)) {
        r.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (r.touches.size > 1) {
          e.preventDefault();
          const [a, b] = [...r.touches.values()],
            distance = Math.hypot(a.x - b.x, a.y - b.y);
          const two = r.twoFinger;
          const x = (a.x + b.x) / 2,
            y = (a.y + b.y) / 2;
          if (two) {
            if (
              Math.hypot(x - two.startX, y - two.startY) > 8 ||
              Math.abs(distance - two.distance) > 8
            )
              two.moved = true;
            if (propsRef.current.onPinch && r.pinchDistance > 0 && distance > 10) {
              propsRef.current.onPinch(distance / r.pinchDistance, x, y, two.x, two.y);
            } else if (viewport) {
              r.pan = {
                x: (r.pan?.x ?? viewport.scrollLeft) - x + two.x,
                y: (r.pan?.y ?? viewport.scrollTop) - y + two.y,
              };
              schedule();
            }
            two.x = x;
            two.y = y;
          }
          r.pinchDistance = distance;
          return;
        }
        if (r.twoFinger) return;
      }
      const g = r.gesture;
      if (!g || g.id !== e.pointerId) return;
      if (e.cancelable) e.preventDefault();
      if (g.mode === "pan") {
        if (viewport) {
          r.pan = { x: g.scrollX - e.clientX + g.clientX, y: g.scrollY - e.clientY + g.clientY };
          schedule();
        }
        return;
      }
      // The parent is a processed summary, not an extra hardware sample.
      const samples = coalesced?.length ? coalesced : [e];
      const raw = e.type === "pointermove" ? g.rawSamples || [] : [];
      let rawIndex = 0;
      for (const sample of samples) {
        if (e.pointerType === "pen" && !penContact(e) && !penContact(sample)) continue;
        const next = point(sample);
        if (g.mode === "draw") {
          // Compare hardware samples, not parent dispatch times, when raw and move batches overlap.
          while (rawIndex < raw.length && raw[rawIndex].t < next.t) rawIndex++;
          let duplicate = false;
          for (let i = rawIndex; i < raw.length && raw[i].t === next.t; i++) {
            const seen = raw[i];
            if (seen.x === next.x && seen.y === next.y && seen.p === next.p) {
              rawIndex = i + 1;
              duplicate = true;
              break;
            }
          }
          if (duplicate) continue;
          if (e.type === "pointerrawupdate") (g.rawSamples ??= []).push(next);
          const points = g.stroke!.points,
            last = points[points.length - 1];
          // A delayed sample must not draw backwards through already received input.
          if (next.t < last.t) continue;
          if (next.x !== last.x || next.y !== last.y || next.p !== last.p) points.push(next);
        } else if (g.mode === "erase") erase(next.x, next.y);
        else if (g.mode === "select")
          r.rect = {
            x: Math.min(next.x, g.start.x),
            y: Math.min(next.y, g.start.y),
            width: Math.abs(next.x - g.start.x),
            height: Math.abs(next.y - g.start.y),
          };
        else if (g.mode === "move")
          g.changed = g.original.map((s) =>
            r.selection.has(s.id) ? translate(s, next.x - g.start.x, next.y - g.start.y) : s,
          );
        else if ((g.mode === "resize" || g.mode === "rotate") && g.box) {
          const center = { x: g.box.x + g.box.width / 2, y: g.box.y + g.box.height / 2 };
          const angle =
            Math.atan2(next.y - center.y, next.x - center.x) -
            Math.atan2(g.start.y - center.y, g.start.x - center.x);
          const scale = Math.min(
            8,
            Math.max(
              0.1,
              Math.hypot(next.x - center.x, next.y - center.y) /
                Math.max(1, Math.hypot(g.start.x - center.x, g.start.y - center.y)),
            ),
          );
          g.changed = g.original.map((s) =>
            r.selection.has(s.id)
              ? transform(
                  s,
                  center,
                  g.mode === "resize" ? scale : 1,
                  g.mode === "rotate" ? angle : 0,
                )
              : s,
          );
        }
      }
      if (e.type === "pointermove") g.rawSamples = undefined;
      // A barrel button can remain pressed across nib lifts, yielding move instead of up/down.
      if (e.pointerType === "pen" && !penContact(e)) {
        finish();
        return;
      }
      // Paint only new ink now; completed ink, vectors and UI work remain frame-batched.
      if (g.mode === "draw") paintInputInk();
      schedule();
    }
    function raw(event: Event) {
      const e = event as PointerEvent;
      if (
        e.pointerType === "pen" &&
        (!runtime.current.gesture || runtime.current.gesture.mode === "draw")
      )
        move(e);
    }
    function finish(e?: PointerEvent) {
      const r = runtime.current;
      if (e) {
        if (r.rejectedTouches.has(e.pointerId)) {
          if (e.type === "pointerup" || e.type === "pointercancel")
            r.rejectedTouches.delete(e.pointerId);
          return;
        }
        const touch = r.touches.has(e.pointerId);
        r.touches.delete(e.pointerId);
        if (r.touches.size < 2) r.pinchDistance = 0;
        if (touch && r.twoFinger) {
          if (r.touches.size === 0) {
            propsRef.current.onPinchEnd?.();
            const two = r.twoFinger;
            if (!two.moved && e.timeStamp - two.started < 250) {
              const previous = r.lastTap;
              if (
                previous &&
                e.timeStamp - previous.time < 450 &&
                Math.hypot(two.x - previous.x, two.y - previous.y) < 40
              ) {
                undo();
                r.lastTap = null;
              } else r.lastTap = { time: e.timeStamp, x: two.x, y: two.y };
            } else r.lastTap = null;
            r.twoFinger = null;
          }
          return;
        }
      }
      const g = r.gesture;
      if (!g || (e && g.id !== e.pointerId)) return;
      if (g.pointerType === "pen") r.penUntil = performance.now() + 350;
      if (e?.type === "pointerup" && g.mode === "draw" && g.stroke) {
        const last = g.stroke.points[g.stroke.points.length - 1],
          next = point(e);
        // Lift-off reports zero pressure; keep the contact's width at its final coordinate.
        if (!e.pressure) next.p = last.p;
        if (next.x !== last.x || next.y !== last.y) g.stroke.points.push(next);
        paintInputInk();
      }
      r.gesture = null;
      if (g.mode === "draw" && g.stroke) {
        commit([...g.original, g.stroke], true);
        r.rasterTimer = setTimeout(() => rasterMode(false), 1500);
      } else if (g.mode === "pan") {
        r.rasterTimer = setTimeout(() => rasterMode(false), 250);
      } else if (
        g.changed &&
        g.changed !== g.original &&
        (g.mode === "erase" || g.mode === "move" || g.mode === "resize" || g.mode === "rotate")
      )
        commit(g.changed);
      else if (g.mode === "select" && r.rect) {
        for (const s of r.strokes) {
          const b = bounds([s]);
          if (b && intersects(b, r.rect)) r.selection.add(s.id);
        }
        r.rect = null;
        status();
      }
      redrawBase();
    }
    function cancel(e: PointerEvent) {
      const r = runtime.current;
      if (r.rejectedTouches.delete(e.pointerId)) return;
      if (
        r.gesture?.id === e.pointerId &&
        r.gesture.pointerType === "pen" &&
        r.gesture.mode === "draw"
      ) {
        finish(e);
        return;
      }
      if (!r.touches.has(e.pointerId) && r.gesture?.id !== e.pointerId) return;
      if (r.twoFinger) propsRef.current.onPinchEnd?.();
      r.touches.delete(e.pointerId);
      r.twoFinger = null;
      r.lastTap = null;
      r.pinchDistance = 0;
      r.pan = null;
      if (r.gesture?.id === e.pointerId) {
        r.gesture = null;
        r.rect = null;
        redrawBase();
      }
    }
    const wheel = (e: WheelEvent) => {
      if (runtime.current.gesture?.pointerType === "pen" && runtime.current.gesture.mode === "draw")
        e.preventDefault();
    };
    const start = (e: PointerEvent) => down(e);
    const lostCapture = (e: PointerEvent) => {
      // Capture ownership can change while the nib is still down. Window input continues it.
      if (runtime.current.gesture?.pointerType !== "pen") finish(e);
    };
    viewport.addEventListener("pointerdown", start, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerrawupdate", raw, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", cancel, true);
    viewport.addEventListener("lostpointercapture", lostCapture);
    viewport.addEventListener("wheel", wheel, { passive: false, capture: true });
    viewport?.addEventListener("scroll", invalidateInputRect, { passive: true });
    return () => {
      observer.disconnect();
      if (runtime.current.rasterTimer) clearTimeout(runtime.current.rasterTimer);
      cancelAnimationFrame(runtime.current.frame);
      runtime.current.frame = 0;
      viewport.removeEventListener("pointerdown", start, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerrawupdate", raw, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
      viewport.removeEventListener("lostpointercapture", lostCapture);
      viewport.removeEventListener("wheel", wheel, true);
      viewport?.removeEventListener("scroll", invalidateInputRect);
    };
  }, []);
  return (
    <>
      <svg
        className="ink-vector"
        viewBox={`0 0 ${props.page.width} ${props.page.height}`}
        aria-hidden="true"
      >
        {!props.transparent && (
          <>
            <rect
              width={props.page.width}
              height={props.page.height}
              fill={props.page.paper.color}
            />
            <path
              d={paperLines}
              fill="none"
              stroke={props.page.paper.lineColor}
              strokeWidth={0.65}
            />
            {props.page.paper.style === "dot" && (
              <>
                <defs>
                  <pattern
                    id={patternId}
                    x={props.page.paper.spacing / 2}
                    y={props.page.paper.spacing / 2}
                    width={props.page.paper.spacing}
                    height={props.page.paper.spacing}
                    patternUnits="userSpaceOnUse"
                  >
                    <circle
                      cx={props.page.paper.spacing / 2}
                      cy={props.page.paper.spacing / 2}
                      r={1}
                      fill={props.page.paper.lineColor}
                    />
                  </pattern>
                </defs>
                <rect
                  x={props.page.paper.spacing - 1}
                  y={props.page.paper.spacing - 1}
                  width={props.page.width - props.page.paper.spacing + 1}
                  height={props.page.height - props.page.paper.spacing + 1}
                  fill={`url(#${patternId})`}
                />
              </>
            )}
          </>
        )}
        <g ref={inkRef} />
      </svg>
      <canvas ref={rasterRef} className="ink-raster" aria-hidden="true" />
      <svg
        className="ink-live-vector"
        viewBox={`0 0 ${props.page.width} ${props.page.height}`}
        aria-hidden="true"
      >
        <g ref={liveInkRef} />
      </svg>
      <canvas ref={liveRasterRef} className="ink-raster ink-live-raster" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className={"ink-canvas ink-tool-" + props.tool}
        tabIndex={0}
        aria-label="Handwriting page. Choose an ink tool to write, or use Hand to move the page."
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      />
    </>
  );
});
