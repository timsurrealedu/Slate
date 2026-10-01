import { useState } from "react";
import {
  Library,
  Clock3,
  Star,
  NotebookPen,
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
} from "lucide-react";
import type { SlateDocument, Folder as SlateFolder } from "../core/model";
import { SlateMark, IconButton, KindIcon } from "./shared";
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
  onClose(): void;
}
export function Navigation(props: Props) {
  const [foldersOpen, setFoldersOpen] = useState(true);
  const selected = (v: string) => props.active === null && props.view === v;
  const nav = [
    { id: "library", name: "Library", icon: Library },
    { id: "recent", name: "Recent", icon: Clock3 },
    { id: "starred", name: "Starred", icon: Star },
  ];
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
            {props.folders.map((folder) => (
              <div key={folder.id}>
                <button
                  className={
                    "folder-navigation " + (selected("folder:" + folder.id) ? "active" : "")
                  }
                  onClick={() => props.onView("folder:" + folder.id)}
                  onDoubleClick={() => props.onRenameFolder(folder)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/slate-document");
                    if (id) workspace.update(id, { folderId: folder.id });
                  }}
                >
                  <Folder size={17} strokeWidth={1.6} style={{ color: folder.color }} />
                  <span>{folder.name}</span>
                </button>
                {props.view === "folder:" + folder.id &&
                  props.documents
                    .filter((d) => d.folderId === folder.id && !d.trashedAt)
                    .slice(0, 12)
                    .map((doc) => (
                      <button
                        className={"sidebar-document " + (props.active === doc.id ? "active" : "")}
                        key={doc.id}
                        onClick={() => props.onOpen(doc)}
                      >
                        <KindIcon kind={doc.kind} size={14} />
                        <span>{doc.title}</span>
                      </button>
                    ))}
              </div>
            ))}
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
