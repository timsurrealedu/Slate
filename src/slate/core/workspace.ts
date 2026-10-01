import { useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCES,
  makeDocument,
  newId,
  type SlateDocument,
  type Folder,
  type Preferences,
  type DocumentKind,
} from "./model";
import * as storage from "./storage";
import { seedWorkspace } from "./seed";
import { vault, VaultConflict, type VaultConnection } from "../platform/vault";
import { visibleWorkspace, folderName, parentFolder, itemName } from "./folders";

export interface WorkspaceState {
  ready: boolean;
  documents: SlateDocument[];
  folders: Folder[];
  preferences: Preferences;
  saving: number;
  error: string | null;
  conflictId: string | null;
  vault: VaultConnection | null;
}
let state: WorkspaceState = {
  ready: false,
  documents: [],
  folders: [],
  preferences: DEFAULT_PREFERENCES,
  saving: 0,
  error: null,
  conflictId: null,
  vault: null,
};
const listeners = new Set<() => void>();
const dirty = new Map<string, SlateDocument>();
const revisions = new Map<string, number>();
const writers = new Map<string, Promise<void>>();
let channel: BroadcastChannel | undefined;
let pendingPreferences: Preferences | null = null;
let preferencesWriter: Promise<void> | undefined;
function publish(patch: Partial<WorkspaceState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
function countSaves() {
  return dirty.size + (pendingPreferences ? 1 : 0);
}
function savingCount() {
  publish({ saving: countSaves() });
}
export function useWorkspace() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );
}
export function useVisibleWorkspace() {
  const data = useWorkspace();
  const visible = useMemo(
    () => visibleWorkspace(data.documents, data.folders, data.preferences.showHiddenFiles),
    [data.documents, data.folders, data.preferences.showHiddenFiles],
  );
  return { ...data, ...visible };
}
export const workspace = {
  get: () => state,
  async load() {
    try {
      let loaded = await storage.readWorkspace();
      if (!loaded.initialized) {
        const seed = seedWorkspace();
        await storage.initializeWorkspace(seed.documents, seed.folders);
        loaded = await storage.readWorkspace();
      }
      const connection = await vault.resume();
      loaded.documents = loaded.documents.filter(
        (doc) => (doc.source?.vaultId || doc.vaultId || null) === (connection?.id || null),
      );
      loaded.folders = loaded.folders.filter(
        (folder) => (folder.vaultId || null) === (connection?.id || null),
      );
      loaded.documents.forEach((d) => revisions.set(d.id, d.revision));
      publish({ ...loaded, vault: connection, ready: true, error: null });
      if (typeof BroadcastChannel !== "undefined" && !channel) {
        channel = new BroadcastChannel("slate-documents");
        channel.onmessage = async (event) => {
          if (event.data?.type !== "saved") return;
          const incoming = (await storage.readWorkspace()).documents.find(
            (d) => d.id === event.data.id,
          );
          if (
            !incoming ||
            dirty.has(incoming.id) ||
            (incoming.source?.vaultId || incoming.vaultId || null) !== (state.vault?.id || null)
          )
            return;
          revisions.set(incoming.id, incoming.revision);
          publish({
            documents: state.documents.some((d) => d.id === incoming.id)
              ? state.documents.map((d) => (d.id === incoming.id ? incoming : d))
              : [...state.documents, incoming],
          });
        };
      }
    } catch (error) {
      publish({
        ready: true,
        error: error instanceof Error ? error.message : "Local storage could not be opened.",
      });
    }
  },
  update(id: string, patch: Partial<SlateDocument>) {
    const current = state.documents.find((d) => d.id === id);
    if (!current) return;
    const doc = {
      ...current,
      ...patch,
      updatedAt:
        Object.keys(patch).length === 1 && "openedAt" in patch ? current.updatedAt : Date.now(),
    };
    dirty.set(id, doc);
    publish({
      documents: state.documents.map((d) => (d.id === id ? doc : d)),
      saving: countSaves(),
    });
    void write(id);
  },
  async create(kind: DocumentKind, folderId: string | null = null) {
    const title = kind === "notebook" ? "Untitled notebook" : "Untitled note";
    let doc = makeDocument(kind, title, folderId, state.preferences.paper);
    if (state.vault && (kind === "note" || kind === "notebook"))
      doc = await vault.assign(doc, state.folders.find((f) => f.id === folderId)?.path);
    await storage.putImportedDocument(doc);
    await vault.save(doc);
    doc.revision = 1;
    revisions.set(doc.id, 1);
    publish({ documents: [...state.documents, doc] });
    channel?.postMessage({ type: "saved", id: doc.id });
    return doc;
  },
  async importDocument(doc: SlateDocument, asset?: { id: string; blob: Blob }) {
    if (state.vault) doc = { ...doc, vaultId: state.vault.id };
    if (state.vault && !doc.source && (doc.kind === "note" || doc.kind === "notebook"))
      doc = await vault.assign(doc, state.folders.find((f) => f.id === doc.folderId)?.path);
    await storage.putImportedDocument(doc, asset);
    await vault.save(doc);
    doc.revision = 1;
    revisions.set(doc.id, 1);
    publish({ documents: [...state.documents, doc] });
    channel?.postMessage({ type: "saved", id: doc.id });
    return doc;
  },
  async addFolder(value: string, parentId: string | null = null) {
    const name = itemName(value),
      parent = state.folders.find((folder) => folder.id === parentId);
    if (parentId && !parent) throw new Error("The parent folder is unavailable.");
    if (
      state.folders.some(
        (folder) =>
          (parentFolder(folder, state.folders)?.id || null) === parentId &&
          folderName(folder).toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      throw new Error("A folder with that name already exists here.");
    const path = (parent?.path ? parent.path + "/" : "") + name;
    const folder = {
      id: newId(),
      name,
      parentId,
      color: ["#7693ad", "#8d9e87", "#b39d86", "#9295ae"][state.folders.length % 4],
      ...(state.vault ? { vaultId: state.vault.id, path } : {}),
    };
    if (state.vault) await vault.mkdir(path);
    await storage.saveFolder(folder);
    publish({ folders: [...state.folders, folder] });
    return folder;
  },
  async renameFolder(id: string, value: string) {
    await workspace.flush();
    const name = itemName(value);
    const f = state.folders.find((x) => x.id === id);
    if (!f) return;
    if (name === folderName(f)) return;
    const parentId = parentFolder(f, state.folders)?.id || null;
    if (
      state.folders.some(
        (folder) =>
          folder.id !== id &&
          (parentFolder(folder, state.folders)?.id || null) === parentId &&
          folderName(folder).toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    )
      throw new Error("A folder with that name already exists here.");
    const oldPath = f.path,
      nextPath = oldPath?.split("/").slice(0, -1).concat(name).join("/");
    if (oldPath && nextPath) await vault.rename(oldPath, nextPath, true);
    const remap = (path: string) =>
      oldPath && nextPath && (path === oldPath || path.startsWith(oldPath + "/"))
        ? nextPath + path.slice(oldPath.length)
        : path;
    const folders = state.folders.map((folder) => ({
      ...folder,
      ...(folder.id === id ? { name, parentId } : {}),
      ...(folder.path ? { path: remap(folder.path) } : {}),
    }));
    const documents = state.documents.map((doc) =>
      doc.source ? { ...doc, source: { ...doc.source, path: remap(doc.source.path) } } : doc,
    );
    await storage.commitImport(documents, [], folders);
    await vault.remapOriginals(oldPath, nextPath);
    publish({ folders, documents });
  },
  async renameDocument(id: string, value: string) {
    await workspace.flush();
    const current = state.documents.find((doc) => doc.id === id);
    if (!current) throw new Error("This document is unavailable.");
    const title = itemName(value);
    if (current.source) {
      const oldPath = current.source.path,
        extension = oldPath.match(/\.[^./]+$/)?.[0] || ".md";
      const nextPath = oldPath
        .split("/")
        .slice(0, -1)
        .concat(title + extension)
        .join("/");
      if (oldPath !== nextPath) {
        await vault.rename(oldPath, nextPath, false, current.id);
        const doc = { ...current, title, source: { ...current.source, path: nextPath } };
        await storage.cacheVaultDocument(doc);
        await vault.remapOriginals(oldPath, nextPath);
        publish({ documents: state.documents.map((item) => (item.id === id ? doc : item)) });
      }
    }
    workspace.update(id, { title });
    await workspace.flush();
  },
  async preferences(patch: Partial<Preferences>) {
    if (patch.showHiddenFiles === true && !state.preferences.showHiddenFiles && state.vault) {
      await workspace.openVault(state.vault, true);
    }
    const prefs = { ...state.preferences, ...patch };
    pendingPreferences = prefs;
    publish({ preferences: prefs, saving: countSaves() });
    await writePreferences();
  },
  async flush() {
    for (const id of dirty.keys()) void write(id);
    if (pendingPreferences) void writePreferences();
    await Promise.all([...writers.values(), ...(preferencesWriter ? [preferencesWriter] : [])]);
    if (dirty.size || pendingPreferences)
      throw new Error(state.error || "Some changes have not been saved.");
  },
  async retry() {
    publish({ error: null, conflictId: null });
    await workspace.flush().catch(() => {});
  },
  async saveConflictCopy(id: string) {
    const current = dirty.get(id) || state.documents.find((d) => d.id === id);
    if (!current) return;
    let copy: SlateDocument = {
      ...structuredClone(current),
      id: newId(),
      title: current.title + " (local copy)",
      revision: 0,
      source: undefined,
    };
    if (state.vault)
      copy = await vault.assign(copy, state.folders.find((f) => f.id === copy.folderId)?.path);
    await storage.putImportedDocument(copy);
    await vault.save(copy);
    copy.revision = 1;
    revisions.set(copy.id, 1);
    dirty.delete(id);
    const loaded = await storage.readWorkspace();
    const merged = loaded.documents
      .filter((doc) => (doc.source?.vaultId || doc.vaultId || null) === (state.vault?.id || null))
      .map((doc) => dirty.get(doc.id) || doc);
    loaded.documents.forEach((doc) => {
      if (!dirty.has(doc.id)) revisions.set(doc.id, doc.revision);
    });
    publish({ documents: merged, conflictId: null, error: null, saving: countSaves() });
    channel?.postMessage({ type: "saved", id: copy.id });
    for (const other of dirty.keys()) void write(other);
    return copy;
  },
  async restoreRevision(id: string, old: SlateDocument) {
    await workspace.flush();
    await storage.checkpointDocument(id);
    workspace.update(id, {
      title: old.title,
      content: old.content,
      pages: old.pages,
      tags: old.tags,
    });
    await workspace.flush();
  },
  async backup() {
    await workspace.flush().catch(() => {});
    return storage.exportWorkspace(
      state.documents,
      state.folders.map((folder) => ({
        ...folder,
        name: folderName(folder),
        parentId: parentFolder(folder, state.folders)?.id || null,
      })),
      state.preferences,
    );
  },
  async restore(file: Blob) {
    const parsed = await storage.parseBackup(file);
    const result = await storage.restoreBackup(parsed, state.vault?.id);
    result.documents.forEach((d) => revisions.set(d.id, 1));
    publish({
      documents: [...state.documents, ...result.documents],
      folders: [...state.folders, ...result.folders],
    });
    return result.documents.length;
  },
  async openVault(
    connection: VaultConnection | null,
    showHidden = state.preferences.showHiddenFiles,
  ) {
    await workspace.flush();
    const indexed = connection ? await vault.index(connection, showHidden) : null;
    if (indexed) {
      const saved = await storage.readWorkspace();
      indexed.folders = indexed.folders.map((folder) => ({
        ...saved.folders.find((item) => item.id === folder.id),
        ...folder,
        color: saved.folders.find((item) => item.id === folder.id)?.color || folder.color,
      }));
      for (const folder of indexed.folders) await storage.saveFolder(folder);
      for (const doc of indexed.documents) {
        const cached = saved.documents.find((item) => item.id === doc.id);
        if (cached) {
          doc.starred = cached.starred;
          doc.tags = cached.tags;
          doc.trashedAt = cached.trashedAt;
          doc.createdAt = cached.createdAt;
          doc.openedAt = cached.openedAt;
          if (doc.kind === "note") doc.title = cached.title;
        }
        doc.revision = (cached?.revision || 0) + 1;
        if (cached) await storage.checkpointDocument(doc.id);
        await storage.cacheVaultDocument(doc);
      }
    }
    await vault.connect(connection);
    await workspace.load();
    if (indexed)
      publish({
        documents: [
          ...indexed.documents,
          ...state.documents.filter(
            (doc) =>
              !doc.source ||
              (!showHidden &&
                doc.source &&
                doc.source.path.split("/").some((part) => part.startsWith("."))),
          ),
        ],
        folders: [
          ...indexed.folders,
          ...state.folders.filter(
            (folder) => !indexed.folders.some((item) => item.id === folder.id),
          ),
        ],
      });
  },
};
async function write(id: string): Promise<void> {
  if (writers.has(id)) return writers.get(id)!;
  const writer = (async () => {
    while (dirty.has(id)) {
      const doc = dirty.get(id)!;
      try {
        const revision = await storage.saveDocument(doc, revisions.get(id) || 0);
        revisions.set(id, revision);
        await vault.save(doc);
        if (dirty.get(id) === doc) dirty.delete(id);
        const next = state.documents.map((d) => (d.id === id ? { ...d, revision } : d));
        publish({ documents: next, saving: countSaves() });
        channel?.postMessage({ type: "saved", id });
      } catch (error) {
        publish({
          error:
            error instanceof Error
              ? error.message
              : "Could not save changes. Keep Slate open and try again.",
          conflictId:
            error instanceof storage.SaveConflict || error instanceof VaultConflict ? id : null,
          saving: countSaves(),
        });
        break;
      }
    }
  })();
  writers.set(id, writer);
  await writer;
  writers.delete(id);
  savingCount();
}

async function writePreferences(): Promise<void> {
  if (preferencesWriter) return preferencesWriter;
  const writer = (async () => {
    while (pendingPreferences) {
      const prefs = pendingPreferences;
      try {
        await storage.savePreferences(prefs);
        if (pendingPreferences === prefs) pendingPreferences = null;
        savingCount();
      } catch (error) {
        publish({
          error: error instanceof Error ? error.message : "Could not save workspace settings.",
          saving: countSaves(),
        });
        break;
      }
    }
  })();
  preferencesWriter = writer;
  await writer;
  preferencesWriter = undefined;
  savingCount();
}
