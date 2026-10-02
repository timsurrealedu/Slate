import { useEffect, useState } from "react";

export function useDrawerGestures({
  compact,
  sidebar,
  context,
  hasDocument,
  onSidebar,
  onContext,
}: {
  compact: boolean;
  sidebar: boolean;
  context: boolean;
  hasDocument: boolean;
  onSidebar(open: boolean): void;
  onContext(open: boolean): void;
}) {
  const [side, setSide] = useState<"left" | "right" | null>(null);
  useEffect(() => {
    if (!compact) return;
    let gesture: {
      side: "left" | "right";
      x: number;
      y: number;
      width: number;
      initial: number;
      progress: number;
      lastX: number;
      time: number;
      velocity: number;
      locked: boolean;
    } | null = null;
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (gesture)
        document.documentElement.style.setProperty("--drawer-progress", String(gesture.progress));
    };
    const finish = (cancelled = false, time = performance.now()) => {
      if (!gesture) return;
      const current = gesture;
      cancelAnimationFrame(frame);
      paint();
      gesture = null;
      if (current.locked) {
        const velocity =
          time - current.time > 100 ? 0 : current.velocity * (current.side === "left" ? 1 : -1);
        const open = cancelled
          ? !!current.initial
          : Math.abs(velocity) > 0.35
            ? velocity > 0
            : current.progress > 0.4;
        (current.side === "left" ? onSidebar : onContext)(open);
        if (open) (current.side === "left" ? onContext : onSidebar)(false);
        setSide(null);
      }
    };
    const down = (event: TouchEvent) => {
      const target = event.target as HTMLElement,
        touch = event.touches[0];
      if (
        event.touches.length !== 1 ||
        target.closest("input,textarea,[role=menu],.settings-modal")
      )
        return;
      const drawer = target.closest(".navigation-modal,.context-modal");
      const edge = target.closest<HTMLElement>("[data-drawer-edge]")?.dataset.drawerEdge;
      const currentSide = drawer
        ? drawer.classList.contains("navigation-modal")
          ? "left"
          : "right"
        : edge === "right" && hasDocument
          ? "right"
          : edge === "left" || (!sidebar && !context && target.closest(".library-pane"))
            ? "left"
            : null;
      if (!currentSide) return;
      const initial = currentSide === "left" ? Number(sidebar) : Number(context);
      gesture = {
        side: currentSide,
        x: touch.clientX,
        y: touch.clientY,
        width: Math.min(currentSide === "left" ? 265 : 300, innerWidth * 0.85),
        initial,
        progress: initial,
        lastX: touch.clientX,
        time: event.timeStamp,
        velocity: 0,
        locked: false,
      };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1) {
        finish(true);
        return;
      }
      const touch = event.touches[0],
        dx = touch.clientX - gesture.x,
        dy = touch.clientY - gesture.y;
      if (!gesture.locked) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          gesture = null;
          return;
        }
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        const direction = dx * (gesture.side === "left" ? 1 : -1);
        if ((!gesture.initial && direction < 0) || (gesture.initial && direction > 0)) {
          gesture = null;
          return;
        }
        gesture.locked = true;
        document.documentElement.style.setProperty("--drawer-progress", String(gesture.initial));
        setSide(gesture.side);
      }
      if (event.cancelable) event.preventDefault();
      gesture.progress = Math.max(
        0,
        Math.min(1, gesture.initial + (dx * (gesture.side === "left" ? 1 : -1)) / gesture.width),
      );
      gesture.velocity =
        (touch.clientX - gesture.lastX) / Math.max(1, event.timeStamp - gesture.time);
      gesture.lastX = touch.clientX;
      gesture.time = event.timeStamp;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const end = (event: TouchEvent) => finish(false, event.timeStamp);
    const cancel = () => finish(true);
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", cancel);
    };
  }, [compact, sidebar, context, hasDocument, onSidebar, onContext]);
  return side;
}
