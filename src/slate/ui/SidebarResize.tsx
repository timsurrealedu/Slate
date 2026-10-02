import { useState } from "react";
import { workspace } from "../core/workspace";
export function SidebarResize({ width }: { width: number }) {
  const [current, setCurrent] = useState(width);
  const clamp = (value: number) => Math.max(180, Math.min(480, value));
  return (
    <div
      className="sidebar-resize"
      role="separator"
      aria-label="Resize library sidebar"
      aria-orientation="vertical"
      aria-valuemin={180}
      aria-valuemax={480}
      aria-valuenow={current}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const value =
          event.key === "Home"
            ? 180
            : event.key === "End"
              ? 480
              : clamp(current + (event.key === "ArrowLeft" ? -16 : 16));
        setCurrent(value);
        void workspace.preferences({ sidebarWidth: value });
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget,
          app = handle.closest(".slate-app") as HTMLElement;
        const left = app.getBoundingClientRect().left;
        handle.setPointerCapture(event.pointerId);
        let value = width;
        const move = (next: PointerEvent) => {
          value = clamp(next.clientX - left);
          app.style.setProperty("--sidebar-width", value + "px");
          setCurrent(value);
        };
        const finish = () => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("lostpointercapture", finish);
          void workspace.preferences({ sidebarWidth: value });
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("lostpointercapture", finish, { once: true });
      }}
    />
  );
}
