import { useMemo, useState } from "react";
import {
  Plus,
  Folder,
  LayoutGrid,
  List,
  MoreHorizontal,
  Star,
  FileText,
  NotebookPen,
  Search,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import type { SlateDocument, Folder as SlateFolder } from "../core/model";
import { renderMarkdownPreview } from "../markdown/render";
import { PaperThumbnail } from "./Paper";
import {
  IconButton,
  KindIcon,
  Menu,
  ContextActions,
  relativeDate,
  kindName,
  type MenuAction,
} from "./shared";
import { folderName, folderChildren, folderTrail } from "../core/folders";
import { documentTags } from "../markdown/metadata";
import { dragItem, dropInto, type LibraryItem } from "./drag";
import { parentFolder } from "../core/folders";
export type LibraryView = "library" | "recent" | "starred" | "trash" | string;
interface Props {
  documents: SlateDocument[];
  folders: SlateFolder[];
  view: LibraryView;
  onOpen(doc: SlateDocument): void;
  onFolder(id: string): void;
  onNewFolder(parentId?: string | null): void;
  onLibrary(): void;
  onCreate(notebook: boolean): void;
  onRenameDocument(doc: SlateDocument): void;
  onRenameFolder(folder: SlateFolder): void;
  documentActions(doc: SlateDocument): MenuAction[];
  folderActions(folder: SlateFolder): MenuAction[];
  onRestore(doc: SlateDocument): void;
  onSearch(): void;
  onMove(item: LibraryItem, parentId: string | null): void;
  onRestoreFolder(folder: SlateFolder): void;
}
export function Library(props: Props) {
  const [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("modified"),
    [grid, setGrid] = useState(false);
  const folder = props.view.startsWith("folder:")
    ? props.folders.find((f) => f.id === props.view.slice(7))
    : undefined;
  const tag = props.view.startsWith("tag:") ? props.view.slice(4) : null;
  const children = folderChildren(props.folders, folder?.id || null);
  const title =
    (folder ? folderName(folder) : tag ? "#" + tag : "") ||
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
        folder
          ? d.folderId === folder.id
          : tag
            ? documentTags(d).some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase())
            : props.view === "library"
              ? !d.folderId
              : props.view === "starred"
                ? d.starred
                : true,
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
  }, [props.documents, props.view, filter, sort, folder, tag]);
  const recent = props.documents
    .filter((doc) => !doc.trashedAt)
    .sort((a, b) => b.openedAt - a.openedAt)
    .slice(0, 4);
  function folderSummary(folder: SlateFolder) {
    const documents = props.documents.filter(
      (doc) => doc.folderId === folder.id && !doc.trashedAt,
    ).length;
    const children = folderChildren(props.folders, folder.id).length;
    return (
      documents +
      (documents === 1 ? " document" : " documents") +
      (children ? " · " + children + (children === 1 ? " folder" : " folders") : "")
    );
  }
  function menu(doc: SlateDocument) {
    if (props.view === "trash")
      return [
        {
          label: "Restore document",
          icon: <RotateCcw size={16} />,
          onClick: () => props.onRestore(doc),
        },
      ];
    return props.documentActions(doc);
  }
  function card(doc: SlateDocument) {
    const folder = props.folders.find((f) => f.id === doc.folderId);
    return (
      <ContextActions key={doc.id} items={menu(doc)}>
        <div
          className={"document-card kind-" + doc.kind}
          key={doc.id}
          {...(doc.trashedAt ? {} : dragItem("document", doc.id, props.onMove))}
        >
          <button
            className="document-open"
            onClick={() => props.onOpen(doc)}
            aria-label={"Open " + doc.title}
            onKeyDown={(event) => {
              if (event.key === "F2") {
                event.preventDefault();
                props.onRenameDocument(doc);
              }
            }}
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
                      __html: renderMarkdownPreview(doc.content),
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
      </ContextActions>
    );
  }
  return (
    <ContextActions
      items={[
        {
          label: "New Markdown",
          icon: <FileText size={16} />,
          onClick: () => props.onCreate(false),
        },
        {
          label: "New Notebook",
          icon: <NotebookPen size={16} />,
          onClick: () => props.onCreate(true),
        },
        {
          label: "New folder",
          icon: <Folder size={16} />,
          onClick: () => props.onNewFolder(folder?.id || null),
        },
        { label: "Find anything", icon: <Search size={16} />, onClick: props.onSearch },
      ]}
    >
      <div
        className="library-scroll"
        {...(props.view === "library" || folder ? dropInto(folder?.id || null, props.onMove) : {})}
      >
        <div className="library-content">
          {folder && (
            <nav className="folder-breadcrumbs" aria-label="Folder path">
              <button onClick={props.onLibrary} {...dropInto(null, props.onMove)}>
                Library
              </button>
              {folderTrail(folder, props.folders).map((item) => (
                <span key={item.id}>
                  <ChevronRight size={14} />
                  <button
                    aria-current={item.id === folder.id ? "page" : undefined}
                    onClick={() => props.onFolder(item.id)}
                    {...dropInto(item.id, props.onMove)}
                  >
                    {folderName(item)}
                  </button>
                </span>
              ))}
            </nav>
          )}
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
          {props.view === "library" && !grid && filter === "all" && recent.length > 0 && (
            <section className="recent-section">
              <div className="section-heading">
                <h2>Pick up where you left off</h2>
                <span>Recently opened</span>
              </div>
              <div className="document-grid">{recent.map(card)}</div>
            </section>
          )}
          {(props.view === "library" || folder) && (
            <section className="folders-section">
              <div className="section-heading">
                <h2>Folders</h2>
                <IconButton
                  label="New folder"
                  onClick={() => props.onNewFolder(folder?.id || null)}
                >
                  <Plus size={17} />
                </IconButton>
              </div>
              <div className="folder-grid">
                {children.map((f) => (
                  <ContextActions key={f.id} items={props.folderActions(f)}>
                    <div
                      className="library-folder"
                      {...dragItem("folder", f.id, props.onMove)}
                      {...dropInto(f.id, props.onMove)}
                    >
                      <button
                        key={f.id}
                        onClick={() => props.onFolder(f.id)}
                        aria-label={"Open folder " + folderName(f)}
                        onKeyDown={(event) => {
                          if (event.key === "F2") {
                            event.preventDefault();
                            props.onRenameFolder(f);
                          }
                        }}
                      >
                        <Folder size={22} strokeWidth={1.5} style={{ color: f.color }} />
                        <span>
                          <strong>{folderName(f)}</strong>
                          <small>{folderSummary(f)}</small>
                        </span>
                      </button>
                      <Menu
                        label="Folder actions"
                        trigger={
                          <IconButton
                            label={"Actions for folder " + folderName(f)}
                            className="library-folder-actions"
                          >
                            <MoreHorizontal size={17} />
                          </IconButton>
                        }
                        items={props.folderActions(f)}
                      />
                    </div>
                  </ContextActions>
                ))}
              </div>
            </section>
          )}
          <section className="collection-section">
            {props.view === "trash" &&
              props.folders
                .filter(
                  (folder) => folder.trashedAt && !parentFolder(folder, props.folders)?.trashedAt,
                )
                .map((folder) => (
                  <div key={folder.id} className="trashed-folder">
                    <Folder size={20} />
                    <span>{folderName(folder)}</span>
                    <button className="quiet-button" onClick={() => props.onRestoreFolder(folder)}>
                      Restore folder
                    </button>
                  </div>
                ))}
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
                      : tag
                        ? "No notes with this tag"
                        : folder
                          ? "No documents here yet"
                          : children.length
                            ? "No documents at this level"
                            : "A place to begin"}
                </h2>
                <p>
                  {props.view === "trash"
                    ? "Documents you remove will appear here."
                    : props.view === "starred"
                      ? "Star a note or notebook to find it here."
                      : tag
                        ? "Add this tag to a note’s properties or text to find it here."
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
                  <ContextActions key={doc.id} items={menu(doc)}>
                    <div
                      key={doc.id}
                      className="document-row"
                      role="row"
                      {...(doc.trashedAt ? {} : dragItem("document", doc.id, props.onMove))}
                    >
                      <div role="cell" className="name-cell">
                        <button
                          className="document-name"
                          onClick={() => props.onOpen(doc)}
                          onKeyDown={(event) => {
                            if (event.key === "F2") {
                              event.preventDefault();
                              props.onRenameDocument(doc);
                            }
                          }}
                        >
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
                  </ContextActions>
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
    </ContextActions>
  );
}
