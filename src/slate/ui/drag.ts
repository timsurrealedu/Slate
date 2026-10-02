import type { DragEvent, PointerEvent as ReactPointerEvent } from "react";
export type LibraryItem = { kind: "document" | "folder"; id: string };
const mime = "application/x-slate-item";
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
        if (target) delete target.dataset.dropTarget;
        target =
          document
            .elementFromPoint(next.clientX, next.clientY)
            ?.closest<HTMLElement>("[data-folder-drop]") || null;
        if (target) target.dataset.dropTarget = "true";
      };
      const blockScroll = (next: TouchEvent) => {
        if (active) next.preventDefault();
      };
      const finish = (next: PointerEvent) => {
        if (next.pointerId !== pointer) return;
        clearTimeout(timer);
        label.remove();
        source.draggable = wasDraggable;
        if (target) delete target.dataset.dropTarget;
        window.removeEventListener("pointermove", movePointer);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        window.removeEventListener("touchmove", blockScroll);
        window.removeEventListener("contextmenu", cancelMenu, true);
        if (active) {
          next.preventDefault();
          next.stopPropagation();
          // Consume the compatibility click so a completed move cannot open the source.
          const consumeClick = (click: MouseEvent) => {
            if (source.contains(click.target as Node)) {
              click.preventDefault();
              click.stopPropagation();
            }
          };
          window.addEventListener("click", consumeClick, { once: true, capture: true });
          setTimeout(() => window.removeEventListener("click", consumeClick, true), 500);
          if (next.type === "pointerup" && target)
            move({ kind, id }, target.dataset.folderDrop || null);
        }
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
      event.currentTarget.dataset.dropTarget = "true";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        delete event.currentTarget.dataset.dropTarget;
    },
    onDrop(event: DragEvent<HTMLElement>) {
      const data = event.dataTransfer.getData(mime);
      delete event.currentTarget.dataset.dropTarget;
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
