import { useMemo, useState } from "react";
import {
  Plus,
  PenLine,
  ArrowUpRight,
  Folder,
  ChevronDown,
  LayoutGrid,
  List,
  MoreHorizontal,
  Star,
  Trash2,
  FileText,
  NotebookPen,
  Search,
  RotateCcw,
} from "lucide-react";
import type { SlateDocument, Folder as SlateFolder } from "../core/model";
import { renderMarkdown } from "../markdown/render";
import { PaperThumbnail } from "./Paper";
import { IconButton, KindIcon, Menu, relativeDate, kindName } from "./shared";
export type LibraryView = "library" | "recent" | "starred" | "trash" | string;
interface Props {
  documents: SlateDocument[];
  folders: SlateFolder[];
  view: LibraryView;
  onOpen(doc: SlateDocument): void;
  onFolder(id: string): void;
  onNewFolder(): void;
  onStar(doc: SlateDocument): void;
  onTrash(doc: SlateDocument): void;
  onMove(doc: SlateDocument): void;
  onRestore(doc: SlateDocument): void;
  onSearch(): void;
}
export function Library(props: Props) {
  const [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("modified"),
    [grid, setGrid] = useState(false);
  const folder = props.view.startsWith("folder:")
    ? props.folders.find((f) => f.id === props.view.slice(7))
    : undefined;
  const title =
    folder?.name ||
    (
      {
        library: "Your library",
        recent: "Recently opened",
        starred: "Starred",
        trash: "Trash",
      } as Record<string, string>
    )[props.view] ||
    "Your library";
  const docs = useMemo(() => {
    const list = props.documents
      .filter((d) => (props.view === "trash" ? !!d.trashedAt : !d.trashedAt))
      .filter((d) =>
        folder ? d.folderId === folder.id : props.view === "starred" ? d.starred : true,
      )
      .filter((d) =>
        filter === "all"
          ? true
          : filter === "documents"
            ? d.kind === "pdf" || d.kind === "docx"
            : d.kind === filter,
      );
    return list.sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "created"
          ? b.createdAt - a.createdAt
          : props.view === "recent"
            ? b.openedAt - a.openedAt
            : b.updatedAt - a.updatedAt,
    );
  }, [props.documents, props.view, props.folders, filter, sort, folder]);
  const recent = [...docs].sort((a, b) => b.openedAt - a.openedAt).slice(0, 4);
  function menu(doc: SlateDocument) {
    if (props.view === "trash")
      return [
        {
          label: "Restore document",
          icon: <RotateCcw size={16} />,
          onClick: () => props.onRestore(doc),
        },
      ];
    return [
      {
        label: doc.starred ? "Remove from Starred" : "Add to Starred",
        icon: <Star size={16} />,
        onClick: () => props.onStar(doc),
      },
      { label: "Move to folder", icon: <Folder size={16} />, onClick: () => props.onMove(doc) },
      {
        label: "Move to Trash",
        icon: <Trash2 size={16} />,
        onClick: () => props.onTrash(doc),
        danger: true,
        separator: true,
      },
    ];
  }
  function card(doc: SlateDocument) {
    const folder = props.folders.find((f) => f.id === doc.folderId);
    return (
      <div
        className={"document-card kind-" + doc.kind}
        key={doc.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/slate-document", doc.id)}
      >
        <button
          className="document-open"
          onClick={() => props.onOpen(doc)}
          aria-label={"Open " + doc.title}
        >
          <div className="document-preview" aria-hidden="true">
            {doc.kind === "notebook" ? (
              <div className="notebook-preview">
                <div className="notebook-cover-label">
                  <NotebookPen size={17} />
                  <span>NOTEBOOK</span>
                </div>
                <h3>{doc.title}</h3>
                <div className="notebook-paper-preview">
                  {doc.pages[0] && <PaperThumbnail page={doc.pages[0]} />}
                </div>
                <span className="preview-page-count">{doc.pages.length} pages</span>
              </div>
            ) : doc.kind === "note" ? (
              <div className="note-preview">
                <span className="preview-fold" />
                <div
                  className="prose mini-prose"
                  inert
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(doc.content.split("\n").slice(0, 22).join("\n")),
                  }}
                />
              </div>
            ) : (
              <div className="file-preview">
                <KindIcon kind={doc.kind} size={34} />
                <h3>{doc.title}</h3>
                <span>{doc.kind.toUpperCase()}</span>
              </div>
            )}
          </div>
          <span className="document-card-title">
            <KindIcon kind={doc.kind} size={15} />
            <strong>{doc.title}</strong>
            {doc.starred && <Star size={12} fill="currentColor" />}
          </span>
          <span className="document-card-meta">
            {folder?.name || "Unfiled"}
            <span>·</span>
            {relativeDate(doc.updatedAt)}
          </span>
        </button>
        <Menu
          trigger={
            <IconButton label={"Actions for " + doc.title} className="card-actions">
              <MoreHorizontal size={17} />
            </IconButton>
          }
          items={menu(doc)}
        />
      </div>
    );
  }
  return (
    <div className="library-scroll">
      <div className="library-content">
        <div className="library-heading">
          <div>
            <h1>{title}</h1>
            <p>
              {props.view === "trash"
                ? "Removed documents stay here until you restore them."
                : folder
                  ? "Keep your notes, notebooks and readings together."
                  : props.view === "starred"
                    ? "The ideas you want close at hand."
                    : "A little space for everything you’re learning."}
            </p>
          </div>
        </div>
        {props.view === "library" && !grid && filter === "all" && docs.length > 0 && (
          <section className="recent-section">
            <div className="section-heading">
              <h2>Pick up where you left off</h2>
              <span>Recently opened</span>
            </div>
            <div className="document-grid">{recent.map(card)}</div>
          </section>
        )}
        {props.view === "library" && filter === "all" && (
          <section className="folders-section">
            <div className="section-heading">
              <h2>Folders</h2>
              <IconButton label="New folder" onClick={props.onNewFolder}>
                <Plus size={17} />
              </IconButton>
            </div>
            <div className="folder-grid">
              {props.folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => props.onFolder(f.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const doc = props.documents.find(
                      (d) => d.id === e.dataTransfer.getData("text/slate-document"),
                    );
                    if (doc) {
                      void import("../core/workspace").then(({ workspace }) =>
                        workspace.update(doc.id, { folderId: f.id }),
                      );
                    }
                  }}
                >
                  <Folder size={22} strokeWidth={1.5} style={{ color: f.color }} />
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      {props.documents.filter((d) => d.folderId === f.id && !d.trashedAt).length}{" "}
                      documents
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="collection-section">
          <div className="collection-toolbar">
            <div className="type-filters" aria-label="Document types">
              {[
                { id: "all", name: "All documents" },
                { id: "note", name: "Notes" },
                { id: "notebook", name: "Notebooks" },
                { id: "documents", name: "Documents" },
              ].map((f) => (
                <button
                  key={f.id}
                  className={filter === f.id ? "active" : ""}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="collection-options">
              <select
                aria-label="Sort documents"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="modified">Last modified</option>
                <option value="name">Name</option>
                <option value="created">Date created</option>
              </select>
              <div className="view-toggle">
                <IconButton
                  label="List view"
                  aria-pressed={!grid}
                  className={!grid ? "active" : ""}
                  onClick={() => setGrid(false)}
                >
                  <List size={17} />
                </IconButton>
                <IconButton
                  label="Grid view"
                  aria-pressed={grid}
                  className={grid ? "active" : ""}
                  onClick={() => setGrid(true)}
                >
                  <LayoutGrid size={16} />
                </IconButton>
              </div>
            </div>
          </div>
          {!docs.length ? (
            <div className="empty-state">
              <FileText size={36} strokeWidth={1.1} />
              <h2>
                {props.view === "trash"
                  ? "A clean slate"
                  : props.view === "starred"
                    ? "Keep a good idea close"
                    : "A place to begin"}
              </h2>
              <p>
                {props.view === "trash"
                  ? "Documents you remove will appear here."
                  : props.view === "starred"
                    ? "Star a note or notebook to find it here."
                    : "Create a note, open a notebook, or import a reading."}
              </p>
            </div>
          ) : grid ? (
            <div className="document-grid collection-grid">{docs.map(card)}</div>
          ) : (
            <div className="document-table" role="table" aria-label="Documents">
              <div className="document-table-header" role="row">
                <span role="columnheader">Name</span>
                <span role="columnheader">Type</span>
                <span role="columnheader">Folder</span>
                <span role="columnheader">Modified</span>
                <span />
              </div>
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="document-row"
                  role="row"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/slate-document", doc.id)}
                >
                  <div role="cell" className="name-cell">
                    <button className="document-name" onClick={() => props.onOpen(doc)}>
                      <span className={"document-kind-icon " + doc.kind}>
                        <KindIcon kind={doc.kind} size={18} />
                      </span>
                      <strong>{doc.title}</strong>
                      {doc.starred && <Star size={12} />}{" "}
                      {doc.example && <span className="example-label">Example</span>}
                    </button>
                  </div>
                  <span className="row-type" role="cell">
                    {kindName(doc.kind)}
                  </span>
                  <span className="row-folder" role="cell">
                    {props.folders.find((f) => f.id === doc.folderId)?.name || "Unfiled"}
                  </span>
                  <span className="row-date" role="cell">
                    {relativeDate(doc.updatedAt)}
                  </span>
                  <div role="cell">
                    <Menu
                      trigger={
                        <IconButton label={"Actions for " + doc.title}>
                          <MoreHorizontal size={17} />
                        </IconButton>
                      }
                      items={menu(doc)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="collection-footnote">
            <span>
              {docs.length} {docs.length === 1 ? "document" : "documents"}
            </span>
            <span>Yours, on this device.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
