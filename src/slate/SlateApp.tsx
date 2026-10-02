import { useSlateApp } from "./useSlateApp";
import { useState } from "react";
import { FileTitle } from "./markdown/FileTitle";
import { SidebarResize } from "./ui/SidebarResize";
import { MobileDrawer } from "./ui/MobileDrawer";
import { useDrawerGestures } from "./ui/useDrawerGestures";
import { useTabReorder } from "./ui/useTabReorder";
import type { LibraryItem } from "./ui/drag";
import { workspace } from "./core/workspace";
import { Navigation } from "./ui/Navigation";
import { Library } from "./ui/Library";
import { DocumentView } from "./ui/DocumentView";
import { ContextPanel } from "./ui/ContextPanel";
import { CommandPalette } from "./ui/CommandPalette";
import { Settings } from "./ui/Settings";
import { FolderDialog, MoveDialog, RevisionDialog, RenameDialog } from "./ui/WorkspaceDialogs";
import {
  SlateMark,
  IconButton,
  Menu,
  Modal,
  KindIcon,
  ContextActions,
  type MenuAction,
} from "./ui/shared";
import { folderName } from "./core/folders";
import type { SlateDocument, Folder as SlateFolder } from "./core/model";
import {
  PanelLeftOpen,
  Plus,
  ChevronDown,
  ChevronRight,
  Upload,
  FileText,
  NotebookPen,
  Star,
  MoreHorizontal,
  Download,
  Folder,
  Trash2,
  History,
  PanelRightOpen,
  PanelRightClose,
  Check,
  HardDrive,
  Settings as SettingsIcon,
  X,
  Search,
  Library as LibraryIcon,
  AlertCircle,
  ArrowLeft,
  FolderOpen,
  RefreshCw,
  Pencil,
} from "lucide-react";
export default function SlateApp() {
  const app = useSlateApp();
  const tabDrag = useTabReorder(app.tabs, app.reorderTab);
  const drawerSide = useDrawerGestures({
    compact: app.compact,
    sidebar: app.sidebar,
    context: app.context && !!app.selected,
    hasDocument: !!app.selected,
    onSidebar: app.setSidebar,
    onContext: app.setContext,
  });
  const [newNoteFolder, setNewNoteFolder] = useState<string | null>(null);
  async function move(item: LibraryItem, parentId: string | null) {
    try {
      if (item.kind === "folder") await workspace.moveFolder(item.id, parentId);
      else await workspace.moveDocument(item.id, parentId);
      app.notify(item.kind === "folder" ? "Folder moved" : "File moved");
    } catch (error) {
      app.notify(
        error instanceof Error ? error.message : "Could not move this item.",
        undefined,
        true,
      );
    }
  }
  async function restoreFolder(folder: SlateFolder) {
    try {
      await workspace.restoreFolder(folder.id);
      app.notify("Folder restored");
    } catch (error) {
      app.notify(
        error instanceof Error ? error.message : "Could not restore this folder.",
        undefined,
        true,
      );
    }
  }
  const documentActions = (doc: SlateDocument): MenuAction[] =>
    doc.trashedAt
      ? [
          {
            label: "Restore document",
            icon: <RefreshCw size={16} />,
            onClick: () => app.restoreDoc(doc),
          },
        ]
      : [
          {
            label: "Open",
            icon: <KindIcon kind={doc.kind} size={16} />,
            onClick: () => app.open(doc),
          },
          {
            label: "Rename file",
            icon: <Pencil size={16} />,
            onClick: () => app.setRenameDoc(doc),
          },
          {
            label: doc.starred ? "Remove from Starred" : "Add to Starred",
            icon: <Star size={16} />,
            onClick: () => app.star(doc),
          },
          {
            label: "Move to folder",
            icon: <Folder size={16} />,
            onClick: () => app.setMoveDoc(doc),
          },
          {
            label: "Version history",
            icon: <History size={16} />,
            onClick: () => app.setHistoryDoc(doc),
          },
          {
            label: "Move to Trash",
            icon: <Trash2 size={16} />,
            onClick: () => app.trash(doc),
            danger: true,
            separator: true,
          },
        ];
  const folderActions = (folder: SlateFolder): MenuAction[] => [
    {
      label: "Open folder",
      icon: <FolderOpen size={16} />,
      onClick: () => app.goLibrary("folder:" + folder.id),
    },
    {
      label: "Rename folder",
      icon: <Pencil size={16} />,
      onClick: () => app.setFolderDialog({ folder }),
    },
    {
      label: "New note",
      icon: <FileText size={16} />,
      onClick: () => setNewNoteFolder(folder.id),
    },
    {
      label: "New subfolder",
      icon: <Plus size={16} />,
      onClick: () => app.setFolderDialog({ parentId: folder.id }),
    },
    {
      label: "Delete folder",
      icon: <Trash2 size={16} />,
      danger: true,
      separator: true,
      onClick: () => {
        void workspace
          .trashFolder(folder.id)
          .then(() =>
            app.notify("Folder and its notes moved to Trash", () => void restoreFolder(folder)),
          )
          .catch((error) => app.notify(error.message, undefined, true));
      },
    },
  ];
  const navigation = (
    <Navigation
      view={app.view}
      active={app.active}
      documents={app.documents}
      folders={app.folders}
      name={app.vault?.name || app.preferences.workspaceName}
      dark={app.dark}
      onView={app.goLibrary}
      onOpen={app.open}
      onSearch={() => app.setSearch(true)}
      onSettings={() => app.setSettings(true)}
      onTheme={app.theme}
      onNewFolder={() => app.setFolderDialog({})}
      onRenameFolder={(folder) => app.setFolderDialog({ folder })}
      onRenameDocument={app.setRenameDoc}
      documentActions={documentActions}
      folderActions={folderActions}
      onClose={() => app.setSidebar(false)}
      onMove={(item, parentId) => void move(item, parentId)}
    />
  );
  const doc = app.selected;
  const docFolder = app.folders.find((f) => f.id === doc?.folderId);
  const title = app.view.startsWith("folder:")
    ? folderName(
        app.folders.find((f) => f.id === app.view.slice(7)) || {
          id: "",
          name: "Library",
          color: "",
        },
      )
    : app.view.startsWith("tag:")
      ? "#" + app.view.slice(4)
      : (
          {
            library: "Library",
            recent: "Recent",
            starred: "Starred",
            trash: "Trash",
          } as Record<string, string>
        )[app.view];
  return (
    <div
      className={
        "slate-app " +
        (app.sidebar && !app.compact ? "with-sidebar" : "without-sidebar") +
        (doc ? " has-document" : "")
      }
      style={{ "--sidebar-width": app.preferences.sidebarWidth + "px" } as React.CSSProperties}
      data-platform={/Android/i.test(navigator.userAgent) ? "android" : "desktop"}
    >
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      {!app.compact && app.sidebar && (
        <aside className="sidebar" aria-label="Library navigation">
          {navigation}
          <SidebarResize width={app.preferences.sidebarWidth} />
        </aside>
      )}
      {app.compact && (
        <MobileDrawer
          side="left"
          open={app.sidebar}
          dragging={drawerSide === "left"}
          onOpenChange={app.setSidebar}
          title="Library"
        >
          {navigation}
        </MobileDrawer>
      )}
      {app.compact && doc && (
        <MobileDrawer
          side="right"
          open={app.context}
          dragging={drawerSide === "right"}
          title="Document context"
          onOpenChange={app.setContext}
        >
          <ContextPanel
            doc={doc}
            documents={app.documents}
            onOpen={app.open}
            onLink={(name) => void app.openLink(name)}
            onHeading={(line) => {
              app.getEditor(doc.id).current?.goToLine(line);
              app.setContext(false);
            }}
            onClose={() => app.setContext(false)}
          />
        </MobileDrawer>
      )}
      {app.compact && (
        <>
          <button
            className="drawer-edge drawer-edge-left"
            data-drawer-edge="left"
            aria-label="Show library"
            onClick={() => app.setSidebar(true)}
          />
          {doc && (
            <button
              className="drawer-edge drawer-edge-right"
              data-drawer-edge="right"
              aria-label="Show document context"
              onClick={() => app.setContext(true)}
            />
          )}
        </>
      )}
      <div className="workspace-shell">
        <div className="workspace-topbar-slot" aria-hidden={!!doc} inert={!!doc}>
          <div className="chrome-clip">
            <header className="workspace-topbar">
              <span className="mobile-workspace-mark">
                <SlateMark size={26} />
              </span>
              <div className="workspace-breadcrumb">
                {!app.sidebar && !app.compact && (
                  <IconButton label="Show library" onClick={() => app.setSidebar(true)}>
                    <PanelLeftOpen size={19} />
                  </IconButton>
                )}
                {app.compact && doc ? (
                  <IconButton label="Back to library" onClick={() => app.goLibrary()}>
                    <ArrowLeft size={18} />
                  </IconButton>
                ) : null}
                <button onClick={() => app.goLibrary("library")}>
                  {app.compact && !doc ? (
                    <SlateMark size={23} />
                  ) : (
                    app.vault?.name || app.preferences.workspaceName
                  )}
                </button>
                <ChevronRight size={13} />
                {doc ? (
                  <button
                    onClick={() => app.goLibrary(docFolder ? "folder:" + docFolder.id : "library")}
                  >
                    {docFolder?.name || "Unfiled"}
                  </button>
                ) : (
                  <span>{title || "Library"}</span>
                )}
              </div>
              <div className="topbar-actions">
                <span
                  className={"local-status " + (app.error ? "save-error" : "")}
                  title={app.error || "Your workspace is stored locally"}
                >
                  {app.error ? (
                    <AlertCircle size={14} />
                  ) : app.saving || app.busy ? (
                    <span className="saving-indicator" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>
                    {app.busy
                      ? "Importing…"
                      : app.error
                        ? "Save needs attention"
                        : app.saving
                          ? "Saving…"
                          : "Saved on this device"}
                  </span>
                </span>
                {app.canCancelImport && (
                  <button className="quiet-button" onClick={app.cancelImport}>
                    Cancel import
                  </button>
                )}
                <IconButton
                  label="Search workspace"
                  className="compact-search"
                  onClick={() => app.setSearch(true)}
                >
                  <Search size={18} />
                </IconButton>
                <Menu
                  label="Vault options"
                  trigger={
                    <button
                      aria-label="Vault options"
                      title="Vault options"
                      className="quiet-button vault-button"
                      disabled={!!app.busy}
                    >
                      <FolderOpen size={16} />
                      <span>{app.vault ? "Vault" : "Open vault"}</span>
                      <ChevronDown size={13} />
                    </button>
                  }
                  items={[
                    {
                      label: "Open vault folder",
                      icon: <FolderOpen size={16} />,
                      onClick: () => void app.openVault(),
                    },
                    {
                      label: "Import documents",
                      icon: <Upload size={16} />,
                      onClick: () => app.fileInput.current?.click(),
                    },
                    ...(app.vault
                      ? [
                          {
                            label: "Refresh vault files",
                            icon: <RefreshCw size={16} />,
                            onClick: () => void app.openVault(false, true),
                          },
                          {
                            label: "Open local workspace",
                            icon: <HardDrive size={16} />,
                            onClick: () => void app.openVault(true),
                          },
                        ]
                      : []),
                  ]}
                />
                <Menu
                  trigger={
                    <button
                      aria-label="New note"
                      title="New note"
                      className="primary-button new-note-button"
                      disabled={!!app.busy}
                    >
                      <Plus size={17} />
                      <span>New note</span>
                      <ChevronDown size={13} />
                    </button>
                  }
                  label="Create document"
                  items={[
                    {
                      label: "Markdown",
                      icon: <FileText size={17} />,
                      onClick: () => void app.create("note"),
                    },
                    {
                      label: "Notebook",
                      icon: <NotebookPen size={17} />,
                      onClick: () => void app.create("notebook"),
                    },
                  ]}
                />
              </div>
            </header>
          </div>
        </div>
        {app.tabs.length > 0 && (
          <nav className="document-tabs" aria-label="Open documents" {...tabDrag}>
            <button
              aria-label="Library"
              className={"library-tab " + (!app.active ? "active" : "")}
              aria-current={!app.active ? "page" : undefined}
              onClick={() => app.goLibrary()}
            >
              <LibraryIcon size={16} />
              <span>Library</span>
            </button>
            {app.tabs.map((id) => {
              const item = app.documents.find((d) => d.id === id && !d.trashedAt);
              if (!item) return null;
              return (
                <ContextActions
                  key={id}
                  items={[
                    ...documentActions(item),
                    {
                      label: "Move tab left",
                      disabled: app.tabs.indexOf(id) === 0,
                      onClick: () => app.reorderTab(id, app.tabs.indexOf(id) - 1),
                    },
                    {
                      label: "Move tab right",
                      disabled: app.tabs.indexOf(id) === app.tabs.length - 1,
                      onClick: () => app.reorderTab(id, app.tabs.indexOf(id) + 1),
                    },
                    {
                      label: "Close tab",
                      icon: <X size={16} />,
                      onClick: () => app.closeTab(id),
                      separator: true,
                    },
                  ]}
                >
                  <div
                    className={"document-tab " + (app.active === id ? "active" : "")}
                    data-tab-id={id}
                    key={id}
                  >
                    <button
                      title={item.title}
                      aria-current={app.active === id ? "page" : undefined}
                      onClick={() => app.open(item)}
                      onKeyDown={(event) => {
                        if (
                          event.altKey &&
                          event.shiftKey &&
                          (event.key === "ArrowLeft" || event.key === "ArrowRight")
                        ) {
                          event.preventDefault();
                          app.reorderTab(
                            id,
                            app.tabs.indexOf(id) + (event.key === "ArrowLeft" ? -1 : 1),
                          );
                        }
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1) app.closeTab(id);
                      }}
                    >
                      <KindIcon kind={item.kind} size={15} />
                      <span>{item.title}</span>
                    </button>
                    <IconButton label={"Close " + item.title} onClick={() => app.closeTab(id)}>
                      <X size={13} />
                    </IconButton>
                  </div>
                </ContextActions>
              );
            })}
          </nav>
        )}
        {app.error && (
          <div className="save-error-banner" role="alert">
            <AlertCircle size={18} />
            <span>{app.error} Your unsaved work is still open here.</span>
            <button
              onClick={() => {
                if (app.conflictId)
                  void workspace
                    .saveConflictCopy(app.conflictId)
                    .then((copy) => {
                      if (copy) app.open(copy);
                    })
                    .catch((error) => app.notify(error.message, undefined, true));
                else void (app.documents.length ? workspace.retry() : workspace.load());
              }}
            >
              {app.conflictId ? "Save a local copy" : "Retry save"}
            </button>
            <button onClick={() => app.setSettings(true)}>Export backup</button>
          </div>
        )}
        {app.update && (
          <div className="update-banner">
            <span>A new version of Slate is ready.</span>
            <button onClick={() => void app.activateUpdate()}>Save & update</button>
          </div>
        )}
        <main id="main-content" className="main-workspace" tabIndex={-1}>
          {!app.ready ? (
            <div className="workspace-skeleton" aria-label="Opening your local workspace">
              <div />
              <div />
              <div />
            </div>
          ) : (
            <>
              <div hidden={!!doc} className="library-pane">
                <Library
                  documents={app.documents}
                  folders={app.folders}
                  view={app.view}
                  onOpen={app.open}
                  onFolder={(id) => app.goLibrary("folder:" + id)}
                  onNewFolder={(parentId) => app.setFolderDialog({ parentId })}
                  onLibrary={() => app.goLibrary("library")}
                  onCreate={(notebook) => void app.create(notebook ? "notebook" : "note")}
                  onRenameDocument={app.setRenameDoc}
                  onRenameFolder={(folder) => app.setFolderDialog({ folder })}
                  documentActions={documentActions}
                  folderActions={folderActions}
                  onRestore={app.restoreDoc}
                  onSearch={() => app.setSearch(true)}
                  onMove={(item, parentId) => void move(item, parentId)}
                  onRestoreFolder={(folder) => void restoreFolder(folder)}
                />
              </div>
              {doc && (
                <div className="document-titlebar">
                  {!app.compact && !app.sidebar && (
                    <IconButton label="Show library" onClick={() => app.setSidebar(true)}>
                      <PanelLeftOpen size={19} />
                    </IconButton>
                  )}
                  {app.compact && (
                    <IconButton label="Back to library" onClick={() => app.goLibrary()}>
                      <ArrowLeft size={19} />
                    </IconButton>
                  )}
                  <h1 className="sr-only">{doc.title}</h1>
                  <span className="document-title-icon">
                    <KindIcon kind={doc.kind} size={18} />
                  </span>
                  {app.compact ? (
                    <span className="document-name">{doc.title}</span>
                  ) : (
                    <FileTitle
                      title={doc.title}
                      label="Document title"
                      rename={(value) => workspace.renameDocument(doc.id, value)}
                    />
                  )}
                  <div className="document-title-actions">
                    <IconButton
                      label={doc.starred ? "Remove from Starred" : "Add to Starred"}
                      aria-pressed={doc.starred}
                      className={doc.starred ? "starred-button" : ""}
                      onClick={() => app.star(doc)}
                    >
                      <Star size={17} fill={doc.starred ? "currentColor" : "none"} />
                    </IconButton>
                    <IconButton
                      label={app.context ? "Hide document context" : "Show document context"}
                      aria-pressed={app.context}
                      onClick={() => app.setContext(!app.context)}
                    >
                      {app.context ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                    </IconButton>
                    <Menu
                      trigger={
                        <IconButton label="Document actions">
                          <MoreHorizontal size={19} />
                        </IconButton>
                      }
                      items={[
                        ...(app.compact
                          ? [
                              {
                                label: doc.starred ? "Remove from Starred" : "Add to Starred",
                                icon: <Star size={16} />,
                                onClick: () => app.star(doc),
                              },
                            ]
                          : []),
                        ...(!app.compact
                          ? [
                              {
                                label: "Rename file",
                                icon: <Pencil size={16} />,
                                onClick: () => app.setRenameDoc(doc),
                              },
                            ]
                          : []),
                        {
                          label:
                            doc.kind === "note"
                              ? "Export Markdown"
                              : doc.kind === "notebook"
                                ? "Export notebook as PDF"
                                : "Export original file",
                          icon: <Download size={16} />,
                          onClick: () => void app.exportSelected(),
                        },
                        ...(doc.kind === "pdf"
                          ? [
                              {
                                label: "Export annotated PDF",
                                icon: <Download size={16} />,
                                onClick: () => void app.exportSelected(true),
                              },
                            ]
                          : []),
                        {
                          label: "Move to folder",
                          icon: <Folder size={16} />,
                          onClick: () => app.setMoveDoc(doc),
                        },
                        {
                          label: "Version history",
                          icon: <History size={16} />,
                          onClick: () => app.setHistoryDoc(doc),
                        },
                        {
                          label: "Move to Trash",
                          icon: <Trash2 size={16} />,
                          danger: true,
                          separator: true,
                          onClick: () => app.trash(doc),
                        },
                      ]}
                    />
                  </div>
                </div>
              )}
              <div
                className={
                  "document-stage " + (app.context && doc && !app.compact ? "with-context" : "")
                }
                hidden={!doc}
              >
                <div className="document-panes">
                  {app.tabs.map((id) => {
                    const item = app.documents.find((d) => d.id === id && !d.trashedAt);
                    return (
                      item && (
                        <section
                          key={id}
                          className="document-pane"
                          hidden={id !== app.active}
                          aria-label={item.title}
                        >
                          <DocumentView
                            doc={item}
                            active={id === app.active}
                            editorRef={app.getEditor(id)}
                            onLink={(name) => void app.openLink(name)}
                            onTag={(name) => app.goLibrary("tag:" + name)}
                            onToast={app.notify}
                            onImage={() => app.imageInput.current?.click()}
                          />
                        </section>
                      )
                    );
                  })}
                </div>
                {doc && app.context && !app.compact && (
                  <ContextPanel
                    key={doc.id}
                    doc={doc}
                    documents={app.documents}
                    onOpen={app.open}
                    onLink={(name) => void app.openLink(name)}
                    onHeading={(line) => app.getEditor(doc.id).current?.goToLine(line)}
                    onClose={() => app.setContext(false)}
                  />
                )}
              </div>
            </>
          )}
        </main>
        <div className="mobile-navigation-slot" aria-hidden={!!doc} inert={!!doc}>
          <div className="chrome-clip">
            <nav className="mobile-navigation" aria-label="Mobile workspace">
              <button
                className={!doc ? "active" : ""}
                aria-haspopup={!doc && app.view === "library" ? "dialog" : undefined}
                title={!doc && app.view === "library" ? "Open library navigation" : "Library"}
                onClick={() =>
                  !doc && app.view === "library" ? app.setSidebar(true) : app.goLibrary("library")
                }
              >
                <LibraryIcon size={20} />
                <span>Library</span>
              </button>
              <button onClick={() => app.setSearch(true)}>
                <Search size={20} />
                <span>Search</span>
              </button>
              <button onClick={() => app.setSettings(true)}>
                <SettingsIcon size={20} />
                <span>Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
      <input
        hidden
        type="file"
        ref={app.fileInput}
        multiple
        accept=".md,.markdown,.txt,.pdf,.docx,.flex,.flx"
        className="sr-only"
        aria-label="Import local documents"
        onChange={(e) => void app.importFiles(e.target.files)}
      />
      <input
        hidden
        type="file"
        ref={app.imageInput}
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label="Import local image"
        onChange={(e) => void app.importImage(e.target.files?.[0])}
      />
      <Modal
        open={!!app.flexcilReport}
        onOpenChange={(open) => {
          if (!open) app.setFlexcilReport(null);
        }}
        title="Flexcil import"
        description="Recovered content and original source files are saved on this device."
      >
        {app.flexcilReport && (
          <div className="flexcil-report">
            <p>
              {app.flexcilReport.imported} documents imported · {app.flexcilReport.skipped} already
              present · {app.flexcilReport.preserved} source records preserved.
            </p>
            <ul>
              {app.flexcilReport.limitations.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <p>
              Each imported document has an Export original Flexcil button. Your backup file was
              opened read-only.
            </p>
            <button className="primary-button" onClick={() => app.setFlexcilReport(null)}>
              Done
            </button>
          </div>
        )}
      </Modal>
      <CommandPalette
        open={app.search}
        onClose={() => app.setSearch(false)}
        onOpen={app.open}
        onCreate={(notebook) => void app.create(notebook ? "notebook" : "note")}
        onImport={() => app.fileInput.current?.click()}
        onTheme={app.theme}
        onSettings={() => app.setSettings(true)}
        onLibrary={() => app.goLibrary("library")}
      />
      <Settings
        open={app.settings}
        onClose={() => app.setSettings(false)}
        onToast={app.notify}
        onInstall={() => void app.install()}
        canInstall={app.canInstall}
      />
      <FolderDialog
        value={app.folderDialog}
        onClose={() => app.setFolderDialog(null)}
        onSaved={(id) => app.goLibrary("folder:" + id)}
      />
      <MoveDialog
        doc={app.moveDoc}
        folders={app.folders.filter((folder) => !folder.trashedAt)}
        onClose={() => app.setMoveDoc(null)}
      />
      <Modal
        open={newNoteFolder !== null}
        onOpenChange={(open) => {
          if (!open) setNewNoteFolder(null);
        }}
        title="New note"
        description="Choose the kind of note to create in this folder."
        className="small-modal"
      >
        <div className="new-note-choices">
          <button
            className="secondary-button"
            onClick={() => {
              void app.create("note", newNoteFolder);
              setNewNoteFolder(null);
            }}
          >
            <FileText size={20} />
            <span>Markdown</span>
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              void app.create("notebook", newNoteFolder);
              setNewNoteFolder(null);
            }}
          >
            <NotebookPen size={20} />
            <span>Notebook</span>
          </button>
        </div>
      </Modal>
      <RenameDialog
        doc={app.renameDoc}
        onClose={() => app.setRenameDoc(null)}
        onSaved={() => app.notify("File renamed")}
      />
      <RevisionDialog
        doc={app.historyDoc}
        onClose={() => app.setHistoryDoc(null)}
        onToast={app.notify}
      />
      {app.toast && (
        <div
          className={"toast " + (app.toast.error ? "toast-error" : "")}
          role={app.toast.error ? "alert" : "status"}
        >
          {app.toast.error ? <AlertCircle size={17} /> : <Check size={17} />}
          <span>{app.toast.message}</span>
          {app.toast.undo && (
            <button
              onClick={() => {
                app.toast?.undo?.();
                app.setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <IconButton label="Dismiss notification" onClick={() => app.setToast(null)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
