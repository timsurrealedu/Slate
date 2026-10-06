import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  PenLine,
  Highlighter,
  Eraser,
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  GripVertical,
  MoreHorizontal,
  Fingerprint,
  RotateCcw,
  RotateCw,
  Shrink,
  Expand,
  Trash2,
} from "lucide-react";
import { workspace, useWorkspace } from "../core/workspace";
import type { InkHandle, InkTool } from "../ink/InkSurface";
import { Floating, IconButton, Menu } from "./shared";

const lightInk = ["#385775", "#252d38", "#aa6467", "#7e957b", "#c4a66a"];
const darkInk = ["#c0dbf1", "#fffaf0", "#e6a9af", "#b7d3b3", "#e9d295"];
const inkNames = ["Slate blue", "Graphite", "Rose", "Sage", "Honey"];
export function inkColorForPaper(color: string, darkPaper: boolean) {
  const index = [...lightInk, ...darkInk].indexOf(color) % lightInk.length;
  return (darkPaper ? darkInk : lightInk)[Math.max(0, index)];
}
export const inkTools = [
  { id: "pen", label: "Pen", icon: PenLine, key: "P" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, key: "H" },
  { id: "eraser", label: "Eraser", icon: Eraser, key: "E" },
  { id: "select", label: "Select ink", icon: MousePointer2, key: "V" },
  { id: "hand", label: "Hand", icon: Hand, key: "Space" },
] as const;

export function InkToolbar({
  tool,
  onTool,
  darkPaper,
  history,
  ink,
}: {
  tool: InkTool;
  onTool(tool: InkTool): void;
  darkPaper: boolean;
  history: { undo: boolean; redo: boolean; selection: boolean };
  ink: React.RefObject<InkHandle | null>;
}) {
  const { preferences } = useWorkspace();
  const toolbar = useRef<HTMLDivElement>(null);
  const position = useRef({ left: 0, top: 0 });
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const [widthTool, setWidthTool] = useState<InkTool | null>(null);
  const palette = darkPaper ? darkInk : lightInk;
  const color = inkColorForPaper(preferences.inkColor, darkPaper);

  function place(left: number, top: number) {
    const el = toolbar.current!,
      area = el.parentElement!;
    left = Math.max(12, Math.min(Math.max(12, area.clientWidth - el.offsetWidth - 12), left));
    top = Math.max(12, Math.min(Math.max(12, area.clientHeight - el.offsetHeight - 12), top));
    position.current = { left, top };
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }
  function restore() {
    const el = toolbar.current!,
      area = el.parentElement!,
      saved = preferences.inkToolbarPosition;
    place(
      12 + Math.max(0, area.clientWidth - el.offsetWidth - 24) * (saved?.x ?? 0.5),
      12 + Math.max(0, area.clientHeight - el.offsetHeight - 24) * (saved?.y ?? 1),
    );
  }
  function save() {
    const el = toolbar.current!,
      area = el.parentElement!;
    void workspace.preferences({
      inkToolbarPosition: {
        x: Math.max(
          0,
          Math.min(
            1,
            (position.current.left - 12) / Math.max(1, area.clientWidth - el.offsetWidth - 24),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            1,
            (position.current.top - 12) / Math.max(1, area.clientHeight - el.offsetHeight - 24),
          ),
        ),
      },
    });
  }
  useLayoutEffect(() => {
    const el = toolbar.current!;
    const observer = new ResizeObserver(() => {
      if (!drag.current) restore();
    });
    observer.observe(el);
    observer.observe(el.parentElement!);
    restore();
    return () => observer.disconnect();
  }, [preferences.inkToolbarPosition]);

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    toolbar.current!.removeAttribute("data-dragging");
    if (cancelled) restore();
    else save();
  }
  return (
    <div ref={toolbar} className="ink-toolbar" role="group" aria-label="Ink tools">
      <IconButton
        label="Move ink toolbar"
        className="ink-toolbar-grip"
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          setWidthTool(null);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            ...position.current,
          };
          toolbar.current!.setAttribute("data-dragging", "true");
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          event.preventDefault();
          place(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event, true)}
        onKeyDown={(event) => {
          const delta = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (!delta) return;
          event.preventDefault();
          const step = event.shiftKey ? 5 : 20;
          place(position.current.left + delta[0] * step, position.current.top + delta[1] * step);
          save();
        }}
      >
        <GripVertical size={17} />
      </IconButton>
      <div className="ink-tools">
        {inkTools.map((entry) => {
          const hasWidth = entry.id === "pen" || entry.id === "highlighter";
          const button = (
            <IconButton
              immediateTouch
              label={entry.label + " (" + entry.key + ")"}
              title={hasWidth ? entry.label + ": tap again for thickness" : entry.label}
              className={
                (tool === entry.id ? "active " : "") +
                (entry.id === "hand" || entry.id === "select" ? "secondary-tool" : "")
              }
              aria-pressed={tool === entry.id}
              aria-haspopup={hasWidth ? "dialog" : undefined}
              aria-expanded={hasWidth ? widthTool === entry.id : undefined}
              onClick={() => {
                if (!hasWidth) setWidthTool(null);
                onTool(entry.id);
              }}
            >
              <entry.icon size={20} strokeWidth={1.7} />
            </IconButton>
          );
          return hasWidth ? (
            <Popover.Root
              key={entry.id}
              open={widthTool === entry.id}
              onOpenChange={(open) => setWidthTool(open && tool === entry.id ? entry.id : null)}
            >
              <Popover.Trigger asChild>{button}</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="floating-surface"
                  side="top"
                  sideOffset={8}
                  collisionPadding={12}
                  aria-label={entry.label + " thickness"}
                >
                  <div className="width-picker">
                    <h3>{entry.label} thickness</h3>
                    {[0.6, 1.2, 1.8, 2.4].map((width, i) => (
                      <button
                        key={width}
                        aria-pressed={preferences.inkWidth === width}
                        className={preferences.inkWidth === width ? "selected" : ""}
                        onClick={() => {
                          void workspace.preferences({ inkWidth: width });
                          setWidthTool(null);
                        }}
                      >
                        <span style={{ height: width * 1.5 }} />
                        {["Fine", "Medium", "Bold", "Heavy"][i]}
                      </button>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : (
            <span
              key={entry.id}
              className={
                entry.id === "hand" || entry.id === "select" ? "secondary-tool" : undefined
              }
            >
              {button}
            </span>
          );
        })}
      </div>
      <span className="toolbar-divider" />
      <Floating
        align="center"
        trigger={
          <IconButton label="Ink color" title="Change ink color" className="ink-color-trigger">
            <span className="ink-swatch" style={{ backgroundColor: color }} />
          </IconButton>
        }
      >
        <div className="ink-color-picker" role="group" aria-label="Ink colors">
          {palette.map((value, i) => (
            <Popover.Close asChild key={value}>
              <IconButton
                label={inkNames[i] + " ink"}
                aria-pressed={value === color}
                className={value === color ? "selected" : ""}
                onClick={() => void workspace.preferences({ inkColor: lightInk[i] })}
              >
                <span className="ink-swatch" style={{ backgroundColor: value }} />
              </IconButton>
            </Popover.Close>
          ))}
        </div>
      </Floating>
      <IconButton
        immediateTouch
        label="Undo ink"
        disabled={!history.undo}
        onClick={() => ink.current?.undo()}
      >
        <Undo2 size={19} />
      </IconButton>
      <IconButton
        immediateTouch
        label="Redo ink"
        className="secondary-tool"
        disabled={!history.redo}
        onClick={() => ink.current?.redo()}
      >
        <Redo2 size={19} />
      </IconButton>
      <Menu
        label="Ink options"
        trigger={
          <IconButton label="Ink options">
            <MoreHorizontal size={20} />
          </IconButton>
        }
        items={[
          {
            label: "Select ink",
            icon: <MousePointer2 size={16} />,
            onClick: () => onTool("select"),
          },
          { label: "Pan page", icon: <Hand size={16} />, onClick: () => onTool("hand") },
          {
            label: "Redo ink",
            icon: <Redo2 size={16} />,
            disabled: !history.redo,
            onClick: () => ink.current?.redo(),
          },
          {
            label: preferences.touchInk
              ? "Touch draws. Switch to touch panning"
              : "Touch pans. Switch to touch drawing",
            icon: <Fingerprint size={16} />,
            separator: true,
            onClick: () => void workspace.preferences({ touchInk: !preferences.touchInk }),
          },
          {
            label: "Pen pressure sensitivity",
            icon: <PenLine size={16} />,
            checked: preferences.penPressure,
            onClick: () => void workspace.preferences({ penPressure: !preferences.penPressure }),
          },
          ...(history.selection
            ? [
                {
                  label: "Rotate selection left",
                  icon: <RotateCcw size={16} />,
                  onClick: () => ink.current?.transformSelection(1, -Math.PI / 12),
                  separator: true,
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
                  danger: true,
                  onClick: () => ink.current?.removeSelection(),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
