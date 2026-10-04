import { useEffect, useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export function MobileDrawer({
  side,
  open,
  dragging,
  title,
  onOpenChange,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  dragging: boolean;
  title: string;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  if (dragging) swiped.current = true;
  useEffect(() => {
    if (open && !dragging) content.current?.focus({ preventScroll: true });
  }, [open, dragging]);
  return (
    <Dialog.Root open={open || dragging} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ pointerEvents: open || dragging ? "auto" : "none" }}
          className="modal-overlay drawer-overlay"
          data-dragging={dragging}
          data-swipe={swiped.current}
        />
        <Dialog.Content
          style={{ pointerEvents: open || dragging ? "auto" : "none" }}
          ref={content}
          className={`modal-content mobile-drawer drawer-${side} ${side === "left" ? "navigation-modal" : "context-modal"}`}
          data-dragging={dragging}
          data-swipe={swiped.current}
          onAnimationEnd={() => {
            if (!open && !dragging) swiped.current = false;
          }}
          onOpenAutoFocus={(event) => {
            if (dragging) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {side === "left"
              ? "Browse folders and open notes."
              : "View the outline and linked notes."}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
