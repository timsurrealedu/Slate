import { useEffect, useRef, useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { Modal, Floating } from "./shared";
import { workspace, useWorkspace } from "../core/workspace";
import { PaperPicker } from "./Paper";
import { downloadBlob } from "../platform/export";
import { isLocalApplication } from "../platform/native";
interface Props {
  open: boolean;
  onClose(): void;
  onToast(message: string): void;
  onInstall(): void;
  canInstall: boolean;
}
export function Settings(props: Props) {
  const { preferences } = useWorkspace();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [protectedStorage, setProtected] = useState(false),
    [name, setName] = useState(preferences.workspaceName);
  const restore = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.open) {
      setName(preferences.workspaceName);
      navigator.storage
        ?.persisted?.()
        .then(setProtected)
        .catch(() => {});
      setError("");
    }
  }, [props.open]);
  async function backup() {
    setBusy("export");
    setError("");
    try {
      const blob = await workspace.backup();
      const destination = await downloadBlob(
        blob,
        "Slate workspace " + new Date().toISOString().slice(0, 10) + ".slate.zip",
      );
      if (destination !== "cancelled")
        props.onToast(
          destination === "saved" ? "Backup saved outside Slate" : "Workspace backup exported",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the workspace.");
    } finally {
      setBusy("");
    }
  }
  async function importBackup(file?: File) {
    if (!file) return;
    setBusy("restore");
    setError("");
    try {
      const count = await workspace.restore(file);
      props.onToast("Restored " + count + " documents into new folders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this backup.");
    } finally {
      setBusy("");
      if (restore.current) restore.current.value = "";
    }
  }
  return (
    <Modal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title="Make Slate yours"
      description="A few thoughtful settings for your workspace."
      className="settings-modal"
    >
      <div className="settings-scroll">
        <section>
          <h3>Appearance</h3>
          <div className="theme-options">
            {[
              { id: "light", icon: Sun, name: "Light" },
              { id: "dark", icon: Moon, name: "Dark" },
              { id: "system", icon: Monitor, name: "System" },
            ].map((t) => (
              <button
                key={t.id}
                className={preferences.theme === t.id ? "selected" : ""}
                aria-pressed={preferences.theme === t.id}
                onClick={() =>
                  void workspace.preferences({ theme: t.id as "light" | "dark" | "system" })
                }
              >
                <t.icon size={20} strokeWidth={1.5} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
          <label className="settings-field">
            Reading & editor text
            <span>
              <input
                type="range"
                min={14}
                max={24}
                step={1}
                value={preferences.editorSize}
                onChange={(e) => void workspace.preferences({ editorSize: Number(e.target.value) })}
              />
              <output>{preferences.editorSize}px</output>
            </span>
          </label>
          <div className="settings-field">
            <span>Notebook paper</span>
            <Floating
              trigger={
                <button className="quiet-button">
                  {preferences.paper.style === "grid"
                    ? "Grid"
                    : preferences.paper.style.charAt(0).toUpperCase() +
                      preferences.paper.style.slice(1)}
                  <span
                    className="paper-color-dot"
                    style={{ background: preferences.paper.color }}
                  />
                  <ChevronDown size={14} />
                </button>
              }
            >
              <PaperPicker
                paper={preferences.paper}
                onChange={(paper) => void workspace.preferences({ paper })}
              />
            </Floating>
          </div>
        </section>
        <section>
          <h3>Markdown</h3>
          <label className="settings-field">
            Show line numbers
            <input
              type="checkbox"
              checked={preferences.lineNumbers}
              onChange={(e) => void workspace.preferences({ lineNumbers: e.target.checked })}
            />
          </label>
          <label className="settings-field">
            Vim keybindings
            <input
              type="checkbox"
              checked={preferences.vim}
              onChange={(e) => void workspace.preferences({ vim: e.target.checked })}
            />
          </label>
          <p className="settings-help">
            Vim activates with a physical keyboard. Use :set number, :set nonumber, or :set number!
            to change line numbers in every mode.
          </p>
        </section>
        <section>
          <h3>Workspace</h3>
          <label className="settings-field">
            Name
            <input
              className="text-input workspace-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() =>
                void workspace.preferences({ workspaceName: name.trim() || "My workspace" })
              }
              maxLength={80}
            />
          </label>
          <div className="settings-storage">
            <ShieldCheck size={19} />
            <div>
              <strong>
                {protectedStorage ? "Local storage is protected" : "Saved on this device"}
              </strong>
              <p>
                Keep a backup of your workspace. Device or browser resets can remove local storage.
              </p>
            </div>
          </div>
          {!protectedStorage && (
            <button
              className="quiet-button storage-protect"
              onClick={async () => {
                const granted = await navigator.storage?.persist?.();
                setProtected(!!granted);
                props.onToast(
                  granted
                    ? "Local storage protected"
                    : "This installation manages local storage. Keep regular backups.",
                );
              }}
            >
              <ShieldCheck size={16} />
              Protect local storage
            </button>
          )}
          <div className="backup-actions">
            <button className="secondary-button" disabled={!!busy} onClick={backup}>
              <Download size={16} />
              {busy === "export" ? "Preparing backup…" : "Export workspace"}
            </button>
            <button
              className="secondary-button"
              disabled={!!busy}
              onClick={() => restore.current?.click()}
            >
              <Upload size={16} />
              {busy === "restore" ? "Checking backup…" : "Restore backup"}
            </button>
          </div>
          <input
            ref={restore}
            type="file"
            accept=".zip"
            className="sr-only"
            aria-label="Choose workspace backup"
            onChange={(e) => void importBackup(e.target.files?.[0])}
          />
          <p className="settings-hint">
            Restore adds a fresh copy. Your existing documents stay intact.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section>
          <h3>Keyboard shortcuts</h3>
          <dl className="shortcut-list">
            {[
              ["Search & commands", "Ctrl K"],
              ["New note", "Ctrl N"],
              ["New notebook", "Ctrl Shift N"],
              ["Toggle library", "Ctrl B"],
              ["Save", "Ctrl S"],
              ["Undo / redo", "Ctrl Z / Ctrl Shift Z"],
            ].map(([label, key]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <kbd>{key}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        {!isLocalApplication() && (
          <section className="install-section">
            <h3>Slate, at home on your device</h3>
            <p>
              Install Slate for its own window and offline access. On Android, use Chrome’s “Add to
              home screen”. On Windows or Linux, use Chrome or Edge’s install option.
            </p>
            {props.canInstall && (
              <button className="secondary-button" onClick={props.onInstall}>
                <Download size={16} />
                Install Slate
              </button>
            )}
          </section>
        )}
      </div>
      <div className="settings-footer">
        <span>Slate · Local by design</span>
        <button className="primary-button" onClick={props.onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
