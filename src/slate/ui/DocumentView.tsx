import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  List,
  ListChecks,
  Link2,
  Image,
  Code2,
  BookOpen,
  TextCursorInput,
  Heading2,
  Sigma,
  Table2,
  Settings2,
  ListOrdered,
} from "lucide-react";
import type { SlateDocument } from "../core/model";
import { workspace, useWorkspace } from "../core/workspace";
import { MarkdownEditor, type MarkdownHandle, type EditorMode } from "../markdown/MarkdownEditor";
import { Notebook } from "./Notebook";
import { IconButton, Floating } from "./shared";
import { TableComposer, EquationComposer } from "./MarkdownInsert";
import { tableAt } from "../markdown/tables";
import { sanitizeDocx } from "../markdown/render";
export function DocumentView({
  doc,
  active,
  onLink,
  onToast,
  onImage,
  editorRef,
}: {
  doc: SlateDocument;
  active: boolean;
  onLink(name: string): void;
  onToast(text: string, undo?: () => void): void;
  onImage(): void;
  editorRef?: React.RefObject<MarkdownHandle | null>;
}) {
  const { documents, preferences } = useWorkspace();
  const localRef = useRef<MarkdownHandle>(null),
    ref = editorRef || localRef;
  const [mode, setMode] = useState<EditorMode>("live");
  const [composer, setComposer] = useState<"table" | "equation" | null>(null);
  const [table, setTable] = useState<ReturnType<typeof tableAt>>(null);
  function editTable(position = ref.current?.selection().from || 0) {
    setTable(tableAt(doc.content, position));
    setComposer("table");
  }
  useEffect(() => {
    if (!active) return;
    const edit = (event: Event) => editTable((event as CustomEvent<number>).detail);
    window.addEventListener("slate-edit-table", edit);
    return () => window.removeEventListener("slate-edit-table", edit);
  }, [doc.content, active]);
  if (doc.kind === "notebook" || doc.kind === "pdf")
    return <Notebook doc={doc} active={active} onToast={onToast} />;
  if (doc.kind === "docx")
    return (
      <div className="docx-surface">
        <div className="docx-reading-label">
          <BookOpen size={16} />
          Reading document<span>Original file preserved</span>
        </div>
        <div className="reading-scroll">
          <article
            className="prose reading-prose docx-prose"
            onClick={(e) => {
              const link = (e.target as HTMLElement).closest("a");
              if (link && /^https?:/.test(link.href)) {
                e.preventDefault();
                window.open(link.href, "_blank", "noopener,noreferrer");
              }
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeDocx(doc.content) }}
          />
        </div>
      </div>
    );
  return (
    <div className="note-workspace">
      <div className="markdown-toolbar">
        <div className="editor-modes" aria-label="Markdown mode">
          {[
            { id: "live", name: "Live preview", icon: TextCursorInput },
            { id: "source", name: "Source", icon: Code2 },
            { id: "reading", name: "Reading", icon: BookOpen },
          ].map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? "active" : ""}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id as EditorMode)}
            >
              <m.icon size={15} strokeWidth={1.7} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
        {mode !== "reading" && (
          <div className="format-tools" aria-label="Formatting">
            <IconButton label="Heading" onClick={() => ref.current?.insert("## ")}>
              <Heading2 size={17} />
            </IconButton>
            <IconButton label="Bold" onClick={() => ref.current?.insert("**", "**")}>
              <Bold size={16} />
            </IconButton>
            <IconButton label="Italic" onClick={() => ref.current?.insert("*", "*")}>
              <Italic size={16} />
            </IconButton>
            <span className="toolbar-divider" />
            <IconButton label="Bullet list" onClick={() => ref.current?.insert("- ")}>
              <List size={17} />
            </IconButton>
            <IconButton label="Task list" onClick={() => ref.current?.insert("- [ ] ")}>
              <ListChecks size={17} />
            </IconButton>
            <IconButton label="Link to note" onClick={() => ref.current?.insert("[[", "]]")}>
              <Link2 size={17} />
            </IconButton>
            <IconButton label="Insert equation" onClick={() => setComposer("equation")}>
              <Sigma size={17} />
            </IconButton>
            <IconButton label="Insert or edit table" onClick={() => editTable()}>
              <Table2 size={17} />
            </IconButton>
            <IconButton label="Insert local image" onClick={onImage}>
              <Image size={17} />
            </IconButton>
          </div>
        )}
        <div className="editor-options">
          <IconButton
            label="Show line numbers"
            aria-pressed={preferences.lineNumbers}
            onClick={() => void workspace.preferences({ lineNumbers: !preferences.lineNumbers })}
          >
            <ListOrdered size={17} />
          </IconButton>
          <Floating
            trigger={
              <IconButton label="Note layout">
                <Settings2 size={17} />
              </IconButton>
            }
          >
            <div className="note-layout-controls">
              <h3>Note layout</h3>
              <label>
                Column width{" "}
                <input
                  type="range"
                  min={360}
                  max={1600}
                  step={10}
                  value={preferences.editorWidth}
                  onChange={(e) =>
                    void workspace.preferences({ editorWidth: Number(e.target.value) })
                  }
                />
                <output>{preferences.editorWidth}px</output>
              </label>
              <label>
                Left margin{" "}
                <input
                  type="range"
                  min={0}
                  max={160}
                  step={4}
                  value={preferences.editorMarginLeft}
                  onChange={(e) =>
                    void workspace.preferences({ editorMarginLeft: Number(e.target.value) })
                  }
                />
                <output>{preferences.editorMarginLeft}px</output>
              </label>
              <label>
                Right margin{" "}
                <input
                  type="range"
                  min={0}
                  max={160}
                  step={4}
                  value={preferences.editorMarginRight}
                  onChange={(e) =>
                    void workspace.preferences({ editorMarginRight: Number(e.target.value) })
                  }
                />
                <output>{preferences.editorMarginRight}px</output>
              </label>
              <label>
                Column position{" "}
                <select
                  value={preferences.editorAlignment}
                  onChange={(e) =>
                    void workspace.preferences({
                      editorAlignment: e.target.value as "left" | "center" | "right",
                    })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Centered</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <button
                className="quiet-button"
                onClick={() =>
                  void workspace.preferences({
                    editorWidth: 850,
                    editorMarginLeft: 50,
                    editorMarginRight: 50,
                    editorAlignment: "center",
                  })
                }
              >
                Reset layout
              </button>
            </div>
          </Floating>
        </div>
      </div>
      <MarkdownEditor
        ref={ref}
        id={doc.id}
        title={doc.title}
        content={doc.content}
        mode={mode}
        noteTitles={documents.filter((d) => d.id !== doc.id && !d.trashedAt).map((d) => d.title)}
        size={preferences.editorSize}
        preferences={preferences}
        sourcePath={doc.source?.path}
        onChange={(content) => workspace.update(doc.id, { content })}
        onLink={onLink}
      />
      {composer === "table" && (
        <TableComposer
          initial={table?.cells}
          onClose={() => setComposer(null)}
          onInsert={(text) => {
            if (table) ref.current?.replace(table.from, table.to, text);
            else ref.current?.insert("\n\n" + text + "\n\n");
            setComposer(null);
          }}
        />
      )}
      {composer === "equation" && (
        <EquationComposer
          onClose={() => setComposer(null)}
          onInsert={(text) => {
            ref.current?.insert(text);
            setComposer(null);
          }}
        />
      )}
      <div className="note-footnote">
        <span>
          {mode === "reading"
            ? "Reading mode"
            : mode === "source"
              ? "Markdown source"
              : "Markdown, with a little clarity."}
        </span>
        <span>
          {doc.content.trim().split(/\s+/).filter(Boolean).length} words<span>·</span>
          {Math.max(1, Math.ceil(doc.content.trim().split(/\s+/).length / 200))} min read
        </span>
      </div>
    </div>
  );
}
