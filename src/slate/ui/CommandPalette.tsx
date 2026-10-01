import { useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Plus,
  NotebookPen,
  Upload,
  Moon,
  Settings,
  Library,
  Command,
} from "lucide-react";
import { Modal, KindIcon } from "./shared";
import { useVisibleWorkspace } from "../core/workspace";
import type { SlateDocument } from "../core/model";
interface Props {
  open: boolean;
  onClose(): void;
  onOpen(doc: SlateDocument): void;
  onCreate(notebook: boolean): void;
  onImport(): void;
  onTheme(): void;
  onSettings(): void;
  onLibrary(): void;
}
interface Result {
  id: string;
  excerpt: string;
}
export function CommandPalette(props: Props) {
  const { documents } = useVisibleWorkspace();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [selected, setSelected] = useState(0);
  const worker = useRef<Worker | null>(null),
    cache = useRef(new Map<string, { title: string; content: string; trashedAt: number | null }>()),
    requestId = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL("../core/search.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (event) => {
      if (event.data.requestId === requestId.current) {
        setResults(event.data.results);
        setSelected(0);
      }
    };
    return () => w.terminate();
  }, []);
  useEffect(() => {
    const ids = new Set(documents.map((doc) => doc.id));
    const removed = [...cache.current.keys()].filter((id) => !ids.has(id));
    for (const id of removed) cache.current.delete(id);
    const changed = documents
      .filter((d) => {
        const previous = cache.current.get(d.id);
        if (
          previous?.title === d.title &&
          previous.content === d.content &&
          previous.trashedAt === d.trashedAt
        )
          return false;
        cache.current.set(d.id, { title: d.title, content: d.content, trashedAt: d.trashedAt });
        return true;
      })
      .map((d) => ({
        id: d.id,
        title: d.title,
        content: d.kind === "docx" ? d.content.replace(/<[^>]*>/g, " ") : d.content,
        trashedAt: d.trashedAt,
        updatedAt: d.updatedAt,
      }));
    if (changed.length || removed.length)
      worker.current?.postMessage({ type: "index", documents: changed, removed });
  }, [documents]);
  useEffect(() => {
    if (props.open) {
      setQuery("");
      setSelected(0);
    }
  }, [props.open]);
  useEffect(() => {
    requestId.current++;
    if (query.trim())
      worker.current?.postMessage({ type: "search", query, requestId: requestId.current });
    else setResults([]);
    setSelected(0);
  }, [query]);
  const commands = [
    {
      name: "New Markdown",
      icon: Plus,
      action: () => props.onCreate(false),
      shortcut: "Ctrl N",
    },
    {
      name: "New Notebook",
      icon: NotebookPen,
      action: () => props.onCreate(true),
      shortcut: "Ctrl Shift N",
    },
    { name: "Import document", icon: Upload, action: props.onImport, shortcut: "" },
    { name: "Toggle light / dark theme", icon: Moon, action: props.onTheme, shortcut: "" },
    { name: "Open settings", icon: Settings, action: props.onSettings, shortcut: "" },
    { name: "Go to library", icon: Library, action: props.onLibrary, shortcut: "" },
  ].filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()));
  const matched = query
    ? results
        .map((r) => ({ doc: documents.find((d) => d.id === r.id), excerpt: r.excerpt }))
        .filter((r): r is { doc: SlateDocument; excerpt: string } => !!r.doc)
    : [...documents]
        .filter((d) => !d.trashedAt)
        .sort((a, b) => b.openedAt - a.openedAt)
        .slice(0, 8)
        .map((doc) => ({ doc, excerpt: "" }));
  const options = [
    ...matched.map((r) => ({
      name: r.doc.title,
      excerpt:
        r.excerpt ||
        (r.doc.kind === "note"
          ? "Markdown note"
          : r.doc.kind === "notebook"
            ? r.doc.pages.length + " pages"
            : r.doc.kind.toUpperCase()),
      icon: <KindIcon kind={r.doc.kind} />,
      action: () => props.onOpen(r.doc),
      shortcut: "",
    })),
    ...commands.map((c) => ({
      name: c.name,
      excerpt: "Command",
      icon: <c.icon size={18} />,
      action: c.action,
      shortcut: c.shortcut,
    })),
  ];
  const activate = (i: number) => {
    const option = options[i];
    if (!option) return;
    props.onClose();
    option.action();
  };
  return (
    <Modal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title="Find a note or take an action"
      className="command-modal"
    >
      <div className="command-input">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Search workspace"
          role="combobox"
          aria-controls="command-results"
          aria-expanded="true"
          aria-activedescendant={options.length ? "command-option-" + selected : undefined}
          placeholder="Search your notes, pages and ideas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(options.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              activate(selected);
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div
        className="command-results"
        id="command-results"
        role="listbox"
        aria-label="Search results"
      >
        {!options.length ? (
          <div className="search-empty">
            <Search size={28} />
            <p>No notes found for “{query}”</p>
            <span>Try a title, a phrase, or a command.</span>
          </div>
        ) : (
          options.map((option, i) => (
            <button
              role="option"
              aria-selected={selected === i}
              id={"command-option-" + i}
              key={option.name + i}
              className={"command-option " + (selected === i ? "selected" : "")}
              onMouseEnter={() => setSelected(i)}
              onClick={() => activate(i)}
            >
              {option.icon}
              <span>
                <strong>{option.name}</strong>
                <small>{option.excerpt}</small>
              </span>
              {option.shortcut && <kbd>{option.shortcut}</kbd>}
              {selected === i && <CornerDownLeft size={14} />}
            </button>
          ))
        )}
      </div>
      <div className="command-footer">
        <span>
          <ArrowUp size={12} />
          <ArrowDown size={12} /> to navigate
        </span>
        <span>
          <CornerDownLeft size={12} /> to open
        </span>
        <span>Search stays on this device</span>
      </div>
    </Modal>
  );
}
