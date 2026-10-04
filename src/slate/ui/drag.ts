import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
export type LibraryItem = { kind: "document" | "folder"; id: string };
const mime = "application/x-slate-item";
let cancelDrag: (() => void) | undefined;

function clearDropTargets(except?: HTMLElement) {
  document.querySelectorAll<HTMLElement>('[data-drop-target="true"]').forEach((target) => {
    if (target !== except) delete target.dataset.dropTarget;
  });
}

function highlight(target: HTMLElement) {
  clearDropTargets(target);
  target.dataset.dropTarget = "true";
}

function trackDrag(cleanup = () => {}) {
  cancelDrag?.();
  clearDropTargets();
  const end = () => {
    if (cancelDrag !== end) return;
    cancelDrag = undefined;
    window.removeEventListener("dragend", end, true);
    window.removeEventListener("drop", end, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", end);
    window.removeEventListener("pagehide", end);
    document.removeEventListener("visibilitychange", hidden);
    clearDropTargets();
    cleanup();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") end();
  };
  const hidden = () => {
    if (document.hidden) end();
  };
  cancelDrag = end;
  // Capture terminal events even when a drop target stops propagation.
  window.addEventListener("dragend", end, true);
  window.addEventListener("drop", end, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", end);
  window.addEventListener("pagehide", end);
  document.addEventListener("visibilitychange", hidden);
  return end;
}

export function dragItem(
  kind: LibraryItem["kind"],
  id: string,
  move?: (item: LibraryItem, parentId: string | null) => void,
) {
  return {
    draggable: true,
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (
        event.pointerType !== "touch" ||
        !move ||
        (event.target as HTMLElement).closest(".icon-button")
      )
        return;
      event.stopPropagation();
      event.preventDefault();
      cancelDrag?.();
      const source = event.currentTarget,
        wasDraggable = source.draggable;
      source.draggable = false;
      const start = { x: event.clientX, y: event.clientY },
        pointer = event.pointerId;
      let active = false,
        target: HTMLElement | null = null;
      const label = document.createElement("div");
      label.className = "touch-drag-label";
      label.textContent = kind === "folder" ? "Move folder" : "Move note";
      const timer = setTimeout(() => {
        active = true;
        document.body.append(label);
        label.style.transform = `translate(${start.x + 16}px, ${start.y + 16}px)`;
      }, 400);
      const cancelMenu = (next: Event) => {
        if (active) {
          next.preventDefault();
          next.stopPropagation();
        }
      };
      const movePointer = (next: PointerEvent) => {
        if (next.pointerId !== pointer) return;
        if (!active) {
          if (Math.hypot(next.clientX - start.x, next.clientY - start.y) > 8) clearTimeout(timer);
          return;
        }
        next.preventDefault();
        label.style.transform = `translate(${next.clientX + 16}px, ${next.clientY + 16}px)`;
        target =
          document
            .elementFromPoint(next.clientX, next.clientY)
            ?.closest<HTMLElement>("[data-folder-drop]") || null;
        if (target) highlight(target);
        else clearDropTargets();
      };
      const blockScroll = (next: TouchEvent) => {
        if (active) next.preventDefault();
      };
      const cleanup = () => {
        clearTimeout(timer);
        label.remove();
        source.draggable = wasDraggable;
        window.removeEventListener("pointermove", movePointer);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        window.removeEventListener("touchmove", blockScroll);
        window.removeEventListener("contextmenu", cancelMenu, true);
        if (active) {
          // A move or cancellation must not open the source through a compatibility click.
          const consumeClick = (click: MouseEvent) => {
            if (source.contains(click.target as Node)) {
              click.preventDefault();
              click.stopPropagation();
            }
          };
          window.addEventListener("click", consumeClick, { once: true, capture: true });
          setTimeout(() => window.removeEventListener("click", consumeClick, true), 500);
        }
        active = false;
        target = null;
      };
      const end = trackDrag(cleanup);
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== pointer) return;
        const destination = active && next.type === "pointerup" ? target : null;
        if (active) {
          next.preventDefault();
          next.stopPropagation();
        }
        end();
        if (destination) move({ kind, id }, destination.dataset.folderDrop || null);
      };
      window.addEventListener("pointermove", movePointer, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      window.addEventListener("touchmove", blockScroll, { passive: false });
      window.addEventListener("contextmenu", cancelMenu, true);
    },
    onDragStart(event: DragEvent<HTMLElement>) {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(mime, JSON.stringify({ kind, id }));
      trackDrag();
    },
    onDragEnd() {
      cancelDrag?.();
      clearDropTargets();
    },
  };
}
export function dropInto(
  parentId: string | null,
  move: (item: LibraryItem, parentId: string | null) => void,
) {
  return {
    "data-folder-drop": parentId || "",
    onDragOver(event: DragEvent<HTMLElement>) {
      if (!event.dataTransfer.types.includes(mime)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      highlight(event.currentTarget);
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        delete event.currentTarget.dataset.dropTarget;
    },
    onDrop(event: DragEvent<HTMLElement>) {
      const data = event.dataTransfer.getData(mime);
      cancelDrag?.();
      clearDropTargets();
      if (!data) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const item = JSON.parse(data);
        if ((item.kind === "document" || item.kind === "folder") && typeof item.id === "string")
          move(item, parentId);
      } catch {
        /* Ignore unsupported external drag data. */
      }
    },
  };
}
