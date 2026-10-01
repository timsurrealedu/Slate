import { useEffect, useState } from "react";
import { Folder, RotateCcw, Clock3 } from "lucide-react";
import type { SlateDocument, Folder as SlateFolder } from "../core/model";
import { getRevisions } from "../core/storage";
import { workspace } from "../core/workspace";
import { Modal } from "./shared";
import { renderMarkdown } from "../markdown/render";
export function FolderDialog({
  value,
  onClose,
  onSaved,
}: {
  value: { folder?: SlateFolder } | null;
  onClose(): void;
  onSaved(id: string): void;
}) {
  const [name, setName] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (value) {
      setName(value.folder?.name || "");
      setError("");
    }
  }, [value]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      if (value?.folder) {
        await workspace.renameFolder(value.folder.id, name);
        onClose();
      } else {
        const folder = await workspace.addFolder(name);
        onClose();
        onSaved(folder.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the folder.");
    }
  }
  return (
    <Modal
      open={!!value}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={value?.folder ? "Rename folder" : "A place for related ideas"}
      description="Keep notes, notebooks and readings together."
      className="small-modal"
    >
      <form onSubmit={save}>
        <label className="input-label">
          Folder name
          <input
            className="text-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example, Physics II"
            maxLength={100}
            required
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!name.trim()}>
            {value?.folder ? "Save name" : "Create folder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function MoveDialog({
  doc,
  folders,
  onClose,
}: {
  doc: SlateDocument | null;
  folders: SlateFolder[];
  onClose(): void;
}) {
  return (
    <Modal
      open={!!doc}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Move to a folder"
      description={doc ? doc.title : ""}
      className="small-modal"
    >
      <div className="move-folder-list">
        {[{ id: "", name: "Unfiled", color: "#788496" }, ...folders].map((f) => (
          <button
            className={doc?.folderId === (f.id || null) ? "selected" : ""}
            key={f.id}
            onClick={() => {
              if (doc) workspace.update(doc.id, { folderId: f.id || null });
              onClose();
            }}
          >
            <Folder size={19} style={{ color: f.color }} />
            {f.name}
            {doc?.folderId === (f.id || null) && <span>Current</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
export function RevisionDialog({
  doc,
  onClose,
  onToast,
}: {
  doc: SlateDocument | null;
  onClose(): void;
  onToast(message: string): void;
}) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof getRevisions>>>([]),
    [selected, setSelected] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    setSelected(0);
    setError("");
    if (doc)
      getRevisions(doc.id)
        .then(setItems)
        .catch((e) => setError(e.message));
  }, [doc?.id]);
  const revision = items[selected];
  return (
    <Modal
      open={!!doc}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Version history"
      description="Return to an earlier save. Your current work is kept in history."
      className="revision-modal"
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : !items.length ? (
        <div className="context-empty">
          <Clock3 size={28} />
          <p>History starts with your first saved change.</p>
        </div>
      ) : (
        <div className="revision-body">
          <nav aria-label="Saved versions">
            {items.map((r, i) => (
              <button
                key={r.key}
                className={selected === i ? "selected" : ""}
                onClick={() => setSelected(i)}
              >
                <Clock3 size={15} />
                <span>
                  {new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(r.savedAt)}
                </span>
                <small>Save {r.document.revision}</small>
              </button>
            ))}
          </nav>
          <div className="revision-preview">
            {revision?.document.kind === "note" ? (
              <div
                className="prose"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(revision.document.content) }}
              />
            ) : (
              <div>
                <h3>{revision?.document.title}</h3>
                <p>
                  {revision?.document.pages.length} pages ·{" "}
                  {revision?.document.pages.reduce((n, p) => n + p.strokes.length, 0)} ink strokes
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!revision}
          onClick={() => {
            if (!doc || !revision) return;
            void workspace
              .restoreRevision(doc.id, revision.document)
              .then(() => {
                onClose();
                onToast("Earlier version restored");
              })
              .catch((e) =>
                setError(e instanceof Error ? e.message : "Could not restore this version."),
              );
          }}
        >
          <RotateCcw size={16} />
          Restore this version
        </button>
      </div>
    </Modal>
  );
}
