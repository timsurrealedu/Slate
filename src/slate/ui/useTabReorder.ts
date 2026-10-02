import { useLayoutEffect, useRef } from "react";

export function useTabReorder(tabs: string[], reorder: (id: string, index: number) => void) {
  const nav = useRef<HTMLElement>(null);
  const drag = useRef<{
    id: string;
    pointer: number;
    start: number;
    x: number;
    grab: number;
    offset: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const positions = useRef(new Map<string, number>());
  const elements = () => [...(nav.current?.querySelectorAll<HTMLElement>("[data-tab-id]") || [])];
  function paint() {
    const current = drag.current;
    if (!current?.moved) return;
    const element = elements().find((tab) => tab.dataset.tabId === current.id);
    if (!element) return;
    const left = element.getBoundingClientRect().left - current.offset;
    current.offset = current.x - current.grab - left;
    element.style.transform = `translateX(${current.offset}px)`;
    element.classList.add("dragging");
  }
  useLayoutEffect(() => {
    for (const element of elements()) {
      const id = element.dataset.tabId!;
      if (id !== drag.current?.id) {
        const previous = positions.current.get(id),
          left = element.getBoundingClientRect().left;
        if (
          previous !== undefined &&
          previous !== left &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          element.animate(
            [{ transform: `translateX(${previous - left}px)` }, { transform: "none" }],
            { duration: 150, easing: "ease-out" },
          );
      }
    }
    positions.current.clear();
    paint();
  }, [tabs]);
  function finish() {
    if (drag.current?.moved) suppressClick.current = true;
    for (const element of elements()) {
      element.style.removeProperty("transform");
      element.classList.remove("dragging");
    }
    drag.current = null;
  }
  return {
    ref: nav,
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (
        event.button !== 0 ||
        event.pointerType === "touch" ||
        (event.target as HTMLElement).closest(".icon-button")
      )
        return;
      const element = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-id]");
      if (!element) return;
      suppressClick.current = false;
      drag.current = {
        id: element.dataset.tabId!,
        pointer: event.pointerId,
        start: event.clientX,
        x: event.clientX,
        grab: event.clientX - element.getBoundingClientRect().left,
        offset: 0,
        moved: false,
      };
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      current.x = event.clientX;
      if (!current.moved) {
        if (Math.abs(current.x - current.start) < 5) return;
        current.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      if (current.x > bounds.right - 32) event.currentTarget.scrollLeft += 12;
      else if (current.x < bounds.left + 32) event.currentTarget.scrollLeft -= 12;
      const others = elements().filter((tab) => tab.dataset.tabId !== current.id);
      const index = others.filter(
        (tab) => current.x > tab.getBoundingClientRect().left + tab.offsetWidth / 2,
      ).length;
      if (tabs.indexOf(current.id) !== index) {
        positions.current = new Map(
          elements().map((tab) => [tab.dataset.tabId!, tab.getBoundingClientRect().left]),
        );
        reorder(current.id, index);
      }
      paint();
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
