import { useEffect, useState } from "react";
import {
  Library,
  Clock3,
  Star,
  Search,
  Plus,
  Folder,
  ChevronDown,
  ChevronRight,
  Settings,
  Sun,
  Moon,
  HardDrive,
  Trash2,
  PanelLeftClose,
  MoreHorizontal,
} from "lucide-react";
import type { SlateDocument, Folder as SlateFolder } from "../core/model";
import { SlateMark, IconButton, KindIcon, Menu, ContextActions, type MenuAction } from "./shared";
import { folderChildren, folderName, folderTrail } from "../core/folders";
import { workspace } from "../core/workspace";
interface Props {
  view: string;
  active: string | null;
  documents: SlateDocument[];
  folders: SlateFolder[];
  name: string;
  dark: boolean;
  onView(view: string): void;
  onOpen(doc: SlateDocument): void;
  onSearch(): void;
  onSettings(): void;
  onTheme(): void;
  onNewFolder(): void;
  onRenameFolder(folder: SlateFolder): void;
  onRenameDocument(doc: SlateDocument): void;
  documentActions(doc: SlateDocument): MenuAction[];
  folderActions(folder: SlateFolder): MenuAction[];
  onClose(): void;
}
export function Navigation(props: Props) {
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [expanded, setExpanded] = useState(new Set<string>());
  const reveal = folderTrail(
    props.folders.find((folder) => "folder:" + folder.id === props.view),
    props.folders,
  )
    .map((folder) => folder.id)
    .join("/");
  useEffect(() => {
    if (reveal) setExpanded((previous) => new Set([...previous, ...reveal.split("/")]));
  }, [reveal]);
  const selected = (v: string) => props.active === null && props.view === v;
  const nav = [
    { id: "library", name: "Library", icon: Library },
    { id: "recent", name: "Recent", icon: Clock3 },
    { id: "starred", name: "Starred", icon: Star },
  ];
  function branch(folder: SlateFolder, trail: string[] = []): React.ReactNode {
    if (trail.includes(folder.id)) return null;
    const children = folderChildren(props.folders, folder.id),
      open = expanded.has(folder.id);
    return (
      <div key={folder.id} className="folder-branch">
        <ContextActions items={props.folderActions(folder)}>
          <div
            className={"folder-navigation-row " + (selected("folder:" + folder.id) ? "active" : "")}
          >
            <IconButton
              label={(open ? "Collapse " : "Expand ") + folderName(folder)}
              aria-expanded={open}
              className="folder-disclosure"
              onClick={() =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (open) next.delete(folder.id);
                  else next.add(folder.id);
                  return next;
                })
              }
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </IconButton>
            <button
              className="folder-navigation"
              aria-current={selected("folder:" + folder.id) ? "page" : undefined}
              onClick={() => {
                setExpanded((previous) => new Set([...previous, folder.id]));
                props.onView("folder:" + folder.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "F2") {
                  event.preventDefault();
                  props.onRenameFolder(folder);
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/slate-document");
                if (id) workspace.update(id, { folderId: folder.id });
              }}
            >
              <Folder size={17} strokeWidth={1.6} style={{ color: folder.color }} />
              <span>{folderName(folder)}</span>
            </button>
            <Menu
              label="Folder actions"
              trigger={
                <IconButton
                  label={"Actions for folder " + folderName(folder)}
                  className="folder-more"
                >
                  <MoreHorizontal size={13} />
                </IconButton>
              }
              items={props.folderActions(folder)}
            />
          </div>
        </ContextActions>
        {open && (
          <div className="folder-children">
            {children.map((child) => branch(child, [...trail, folder.id]))}
            {props.documents
              .filter((doc) => doc.folderId === folder.id && !doc.trashedAt)
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((doc) => (
                <ContextActions key={doc.id} items={props.documentActions(doc)}>
                  <button
                    className={"sidebar-document " + (props.active === doc.id ? "active" : "")}
                    onClick={() => props.onOpen(doc)}
                    onKeyDown={(event) => {
                      if (event.key === "F2") {
                        event.preventDefault();
                        props.onRenameDocument(doc);
                      }
                    }}
                  >
                    <KindIcon kind={doc.kind} size={14} />
                    <span>{doc.title}</span>
                  </button>
                </ContextActions>
              ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="navigation-inner">
      <div className="brand">
        <SlateMark size={29} />
        <span>
          Slate<span className="brand-period">.</span>
        </span>
        <IconButton label="Hide library" className="sidebar-close" onClick={props.onClose}>
          <PanelLeftClose size={17} />
        </IconButton>
      </div>
      <button className="sidebar-search" onClick={props.onSearch}>
        <Search size={16} />
        <span>Find anything</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="main-navigation" aria-label="Workspace">
        {nav.map((item) => (
          <button
            key={item.id}
            className={selected(item.id) ? "active" : ""}
            aria-current={selected(item.id) ? "page" : undefined}
            onClick={() => props.onView(item.id)}
          >
            <item.icon size={18} strokeWidth={1.7} />
            <span>{item.name}</span>
            {item.id === "starred" &&
              props.documents.filter((d) => d.starred && !d.trashedAt).length > 0 && (
                <small>{props.documents.filter((d) => d.starred && !d.trashedAt).length}</small>
              )}
          </button>
        ))}
      </nav>
      <div className="sidebar-folders">
        <div className="sidebar-section-heading">
          <button onClick={() => setFoldersOpen(!foldersOpen)} aria-expanded={foldersOpen}>
            {foldersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Folders
          </button>
          <IconButton label="New folder" onClick={props.onNewFolder}>
            <Plus size={15} />
          </IconButton>
        </div>
        {foldersOpen && (
          <nav aria-label="Folders">
            {folderChildren(props.folders).map((folder) => branch(folder))}
          </nav>
        )}
      </div>
      <div className="sidebar-space" />
      <button
        className={"trash-navigation " + (selected("trash") ? "active" : "")}
        onClick={() => props.onView("trash")}
      >
        <Trash2 size={16} />
        Trash
      </button>
      <div className="workspace-card">
        <span className="workspace-symbol">
          <SlateMark size={21} />
        </span>
        <span>
          <strong>{props.name}</strong>
          <small>
            <HardDrive size={11} />
            On this device
          </small>
        </span>
      </div>
      <div className="sidebar-footer">
        <button onClick={props.onSettings}>
          <Settings size={16} />
          Settings
        </button>
        <IconButton
          label={props.dark ? "Use light theme" : "Use dark theme"}
          onClick={props.onTheme}
        >
          {props.dark ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
      </div>
    </div>
  );
}
