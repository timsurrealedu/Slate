import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import type { Page, Point, Stroke } from "../core/model";
import { drawPaper, drawStroke } from "./render";
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
  transparent?: boolean;
  onChange(strokes: Stroke[]): void;
  onHistory?(undo: boolean, redo: boolean, selection: boolean): void;
  onPinch?(factor: number): void;
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
}
export const InkSurface = forwardRef<InkHandle, Props>(function InkSurface(props, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    propsRef = useRef(props);
  const runtime = useRef({
    base: null as HTMLCanvasElement | null,
    strokes: props.page.strokes,
    history: [] as Stroke[][],
    future: [] as Stroke[][],
    gesture: null as Gesture | null,
    selection: new Set<string>(),
    rect: null as Rect | null,
    frame: 0,
    touches: new Map<number, { x: number; y: number }>(),
    pinchDistance: 0,
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
  function commit(strokes: Stroke[]) {
    const r = runtime.current;
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
    const { page } = propsRef.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(page.width, canvas.getBoundingClientRect().width) * ratio;
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil((width * page.height) / page.width);
    const base = document.createElement("canvas");
    base.width = canvas.width;
    base.height = canvas.height;
    runtime.current.base = base;
    redrawBase();
  }
  function redrawBase() {
    const r = runtime.current,
      base = r.base;
    if (!base) return;
    const ctx = base.getContext("2d")!;
    ctx.clearRect(0, 0, base.width, base.height);
    ctx.save();
    ctx.scale(base.width / propsRef.current.page.width, base.height / propsRef.current.page.height);
    if (!propsRef.current.transparent) drawPaper(ctx, propsRef.current.page);
    const g = r.gesture;
    for (const s of g?.mode === "erase" ? g.changed || r.strokes : r.strokes)
      if (!(
        (g?.mode === "move" || g?.mode === "resize" || g?.mode === "rotate") &&
        r.selection.has(s.id)
      ))
        drawStroke(ctx, s);
    ctx.restore();
    schedule();
  }
  function paint() {
    const canvas = canvasRef.current,
      r = runtime.current;
    r.frame = 0;
    if (!canvas || !r.base) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(r.base, 0, 0);
    ctx.save();
    ctx.scale(
      canvas.width / propsRef.current.page.width,
      canvas.height / propsRef.current.page.height,
    );
    const g = r.gesture;
    if (g?.stroke) drawStroke(ctx, g.stroke);
    if (g?.mode === "move" || g?.mode === "resize" || g?.mode === "rotate")
      for (const s of g.changed || []) if (r.selection.has(s.id)) drawStroke(ctx, s);
    let rect = r.rect || bounds(r.strokes.filter((s) => r.selection.has(s.id)));
    if (g?.mode === "move" || g?.mode === "resize" || g?.mode === "rotate")
      rect = bounds((g.changed || g.original).filter((s) => r.selection.has(s.id)));
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
  useEffect(() => {
    const r = runtime.current;
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
      r.twoFinger = null;
      r.lastTap = null;
    }
    r.strokes = props.page.strokes;
    resize();
    status();
  }, [
    props.page.id,
    props.page.strokes,
    props.page.paper,
    props.page.width,
    props.page.height,
    props.transparent,
  ]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const viewport = canvas.closest(".page-viewport") as HTMLElement;
    const point = (e: PointerEvent): Point => {
      const b = canvas.getBoundingClientRect(),
        p = propsRef.current.page;
      return {
        x: Math.max(0, Math.min(p.width, ((e.clientX - b.left) * p.width) / b.width)),
        y: Math.max(0, Math.min(p.height, ((e.clientY - b.top) * p.height) / b.height)),
        p: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5,
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
    function down(e: PointerEvent) {
      const r = runtime.current,
        p = propsRef.current;
      if (e.pointerType === "touch" && r.gesture?.pointerType === "pen") return;
      if (e.pointerType === "pen" && r.gesture?.pointerType === "touch") {
        finish();
        r.touches.clear();
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
          r.twoFinger = {
            started: e.timeStamp,
            x,
            y,
            startX: x,
            startY: y,
            distance: r.pinchDistance,
            moved: false,
          };
          canvas.setPointerCapture(e.pointerId);
          return;
        }
        if (r.twoFinger) return;
        if (r.gesture && r.gesture.id !== e.pointerId) return;
      }
      if (r.gesture || (e.button !== 0 && e.pointerType !== "pen")) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      const start = point(e),
        selection = bounds(r.strokes.filter((s) => r.selection.has(s.id)));
      const unit = p.page.width / canvas.getBoundingClientRect().width;
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
        p.tool === "hand" || (e.pointerType === "touch" && !p.touchInk)
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
          width: p.tool === "highlighter" ? Math.max(p.width * 5, 14) : p.width,
          points: [start],
        };
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
            if (viewport) {
              viewport.scrollLeft -= x - two.x;
              viewport.scrollTop -= y - two.y;
            }
            two.x = x;
            two.y = y;
          }
          if (r.pinchDistance > 0 && distance > 10)
            propsRef.current.onPinch?.(distance / r.pinchDistance);
          r.pinchDistance = distance;
          return;
        }
        if (r.twoFinger) return;
      }
      const g = r.gesture;
      if (!g || g.id !== e.pointerId) return;
      e.preventDefault();
      if (g.mode === "pan") {
        if (viewport) {
          viewport.scrollLeft = g.scrollX - e.clientX + g.clientX;
          viewport.scrollTop = g.scrollY - e.clientY + g.clientY;
        }
        return;
      }
      const samples = e.getCoalescedEvents?.() || [e];
      for (const sample of samples.length ? samples : [e]) {
        const next = point(sample);
        if (g.mode === "draw") {
          const points = g.stroke!.points,
            last = points[points.length - 1];
          if (Math.hypot(next.x - last.x, next.y - last.y) > 0.25) points.push(next);
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
      schedule();
    }
    function finish(e?: PointerEvent) {
      const r = runtime.current;
      if (e) {
        r.touches.delete(e.pointerId);
        if (r.touches.size < 2) r.pinchDistance = 0;
        if (r.twoFinger) {
          if (r.touches.size === 0) {
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
      r.gesture = null;
      if (g.mode === "draw" && g.stroke) commit([...g.original, g.stroke]);
      else if (
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
      r.touches.delete(e.pointerId);
      r.twoFinger = null;
      r.lastTap = null;
      r.pinchDistance = 0;
      if (r.gesture?.id === e.pointerId) {
        r.gesture = null;
        r.rect = null;
        redrawBase();
      }
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", finish);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(runtime.current.frame);
      runtime.current.frame = 0;
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", finish);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", finish);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      className={"ink-canvas ink-tool-" + props.tool}
      tabIndex={0}
      aria-label="Handwriting page. Choose an ink tool to write, or use Hand to move the page."
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    />
  );
});
