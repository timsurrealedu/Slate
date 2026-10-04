import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Context from "@radix-ui/react-context-menu";
import * as Popover from "@radix-ui/react-popover";
import { X, FileText, NotebookPen, File, FileType } from "lucide-react";
import type { DocumentKind } from "../core/model";
export function SlateMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M9 7h16l-3 5H6l3-5Zm-3 8h16l-3 5H3l3-5Zm13 8h7l-3 5h-7l3-5Z" fill="currentColor" />
    </svg>
  );
}
export function IconButton({
  label,
  children,
  className = "",
  immediateTouch = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  immediateTouch?: boolean;
}) {
  const press = useRef<{ id: number; x: number; y: number } | null>(null),
    handled = useRef({ id: -1, time: 0 });
  return (
    <button
      type="button"
      className={"icon-button " + className}
      aria-label={label}
      title={label}
      {...props}
      onPointerDown={(event) => {
        if (immediateTouch && event.pointerType === "touch" && event.isPrimary)
          press.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        props.onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event);
        const start = press.current;
        press.current = null;
        if (
          !immediateTouch ||
          props.disabled ||
          event.pointerType !== "touch" ||
          start?.id !== event.pointerId ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
        )
          return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          return;
        // Browsers can suppress a compatibility click just after canvas panning.
        // Activate ink controls on release and consume that contact's later click.
        handled.current = { id: event.pointerId, time: performance.now() };
        props.onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
      }}
      onPointerCancel={(event) => {
        press.current = null;
        props.onPointerCancel?.(event);
      }}
      onClick={(event) => {
        const native = event.nativeEvent as PointerEvent;
        if (
          immediateTouch &&
          handled.current.id >= 0 &&
          event.detail > 0 &&
          performance.now() - handled.current.time < 700 &&
          ((native.pointerType === "touch" && native.pointerId === handled.current.id) ||
            !native.pointerType)
        ) {
          handled.current = { id: -1, time: 0 };
          return;
        }
        props.onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
export function KindIcon({ kind, size = 18 }: { kind: DocumentKind; size?: number }) {
  const Icon =
    kind === "note"
      ? FileText
      : kind === "notebook"
        ? NotebookPen
        : kind === "pdf"
          ? File
          : FileType;
  return <Icon size={size} strokeWidth={1.7} />;
}
export const kindName = (kind: DocumentKind) =>
  kind === "note"
    ? "Markdown note"
    : kind === "notebook"
      ? "Notebook"
      : kind === "pdf"
        ? "PDF document"
        : "Word document";
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
  onInteractOutside,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  onInteractOutside?: Dialog.DialogContentProps["onInteractOutside"];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={"modal-content " + className}
          onInteractOutside={onInteractOutside}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="modal-description">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick(): void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}
export function Menu({
  trigger,
  items,
  label = "Document actions",
}: {
  trigger: ReactNode;
  items: MenuAction[];
  label?: string;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown-menu" sideOffset={7} align="end" aria-label={label}>
          {items.map((item, i) => (
            <span key={i}>
              {item.separator && <Dropdown.Separator className="menu-separator" />}
              <Dropdown.Item
                className={"menu-item " + (item.danger ? "danger" : "")}
                disabled={item.disabled}
                onSelect={item.onClick}
              >
                {item.icon}
                {item.label}
              </Dropdown.Item>
            </span>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Floating({
  trigger,
  children,
  align = "end",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="floating-surface" sideOffset={8} align={align}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function ContextActions({
  children,
  items,
  touch = true,
}: {
  children: ReactNode;
  items: MenuAction[];
  touch?: boolean;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  return (
    <Context.Root>
      <Context.Trigger
        asChild
        ref={trigger}
        onContextMenu={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          if (!touch && event.pointerType !== "mouse") event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = trigger.current?.getBoundingClientRect();
          trigger.current?.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: (bounds?.left || 0) + 20,
              clientY: (bounds?.top || 0) + 20,
            }),
          );
        }}
      >
        {children}
      </Context.Trigger>
      <Context.Portal>
        <Context.Content className="dropdown-menu" aria-label="Context actions">
          {items.map((item, index) => (
            <span key={index}>
              {item.separator && <Context.Separator className="menu-separator" />}
              <Context.Item
                className={"menu-item " + (item.danger ? "danger" : "")}
                disabled={item.disabled}
                onSelect={item.onClick}
              >
                {item.icon}
                {item.label}
              </Context.Item>
            </span>
          ))}
        </Context.Content>
      </Context.Portal>
    </Context.Root>
  );
}
export function relativeDate(time: number) {
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(time);
}
