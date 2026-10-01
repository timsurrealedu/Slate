import { Capacitor, registerPlugin } from "@capacitor/core";
import { readMeta, writeMeta, docSchema } from "../core/storage";
import { makeDocument, type Folder, type SlateDocument } from "../core/model";

export interface VaultConnection {
  id: string;
  name: string;
  handle?: DirectoryHandle;
}
interface DirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}
interface FileHandle extends FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}
interface VaultBridge {
  open(): Promise<VaultConnection | { cancelled: boolean }>;
  list(options: { id: string }): Promise<{ paths: string[] }>;
  read(options: { id: string; path: string }): Promise<{ text: string }>;
  asset(options: { id: string; path: string }): Promise<{ base64: string; mime: string }>;
  write(options: {
    id: string;
    path: string;
    text: string;
    expected: string | null;
  }): Promise<void>;
}
declare global {
  interface Window {
    slateVault?: VaultBridge;
    showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<DirectoryHandle>;
  }
}
const AndroidVault = registerPlugin<VaultBridge>("SlateVault");
const bridge = () => (Capacitor.isNativePlatform() ? AndroidVault : window.slateVault);
let active: VaultConnection | null = null;
const originals = new Map<string, string | null>();
export class VaultConflict extends Error {
  constructor() {
    super(
      "This file changed outside Slate. Reopen the vault to load that version, or save a local copy of your edits.",
    );
    this.name = "VaultConflict";
  }
}
export function safeVaultPath(path: string) {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[\/]|^[a-z]:/i.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid vault file path.");
  return path;
}
export function vaultImagePaths(notePath: string, reference: string) {
  if (/^[a-z][a-z\d+.-]*:|^[\/\\]/i.test(reference)) return [];
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    return [];
  }
  const normalize = (path: string) => {
    const result: string[] = [];
    for (const part of path.split("/")) {
      if (part === "..") {
        if (!result.length) return null;
        result.pop();
      } else if (part && part !== ".") result.push(part);
    }
    try {
      return safeVaultPath(result.join("/"));
    } catch {
      return null;
    }
  };
  return [
    ...new Set(
      [
        normalize(notePath.split("/").slice(0, -1).concat(decoded).join("/")),
        normalize(decoded),
      ].filter((path): path is string => !!path),
    ),
  ];
}
export async function stableId(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
export const vault = {
  get: () => active,
  async resume() {
    active = (await readMeta<VaultConnection | null>("active-vault")) || null;
    return active;
  },
  async pick() {
    const native = bridge();
    if (native) {
      const result = await native.open();
      return "cancelled" in result ? null : result;
    }
    if (!window.showDirectoryPicker)
      throw new Error(
        "This browser cannot save to a folder. Open the Windows/Linux app or use Chrome/Edge to connect a vault.",
      );
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const previous = (await readMeta<VaultConnection[]>("vault-connections")) || [];
      for (const connection of previous)
        if (connection.handle && (await handle.isSameEntry(connection.handle)))
          return { ...connection, handle };
      return { id: crypto.randomUUID(), name: handle.name, handle };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      throw error;
    }
  },
  async connect(connection: VaultConnection | null) {
    active = connection;
    originals.clear();
    await writeMeta("active-vault", connection);
    if (connection) {
      const previous = (await readMeta<VaultConnection[]>("vault-connections")) || [];
      await writeMeta("vault-connections", [
        ...previous.filter((item) => item.id !== connection.id),
        connection,
      ]);
    }
  },
  async permission() {
    if (!active?.handle) return true;
    if ((await active.handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await active.handle.requestPermission({ mode: "readwrite" })) === "granted";
  },
  async paths(): Promise<string[]> {
    if (!active) return [];
    if (!active.handle)
      return (await bridge()!.list({ id: active.id })).paths.map((path) =>
        path.endsWith("/") ? safeVaultPath(path.slice(0, -1)) + "/" : safeVaultPath(path),
      );
    const paths: string[] = [];
    async function walk(handle: DirectoryHandle, prefix: string, depth: number) {
      if (depth > 32) throw new Error("This vault has more than 32 nested folder levels.");
      for await (const entry of handle.values()) {
        if (entry.name.startsWith(".")) continue;
        const path = safeVaultPath(prefix + entry.name);
        if (paths.length >= 20000)
          throw new Error("Open a folder containing fewer than 20,000 notes.");
        if (entry.kind === "directory") {
          paths.push(path + "/");
          await walk(entry as DirectoryHandle, path + "/", depth + 1);
        } else if (/\.(md|markdown|txt|slate-notebook)$/i.test(path)) paths.push(path);
      }
    }
    await walk(active.handle, "", 0);
    return paths;
  },
  async file(path: string, create = false): Promise<FileHandle> {
    const parts = safeVaultPath(path).split("/");
    let directory = active!.handle!;
    for (const part of parts.slice(0, -1))
      directory = (await directory.getDirectoryHandle(part, { create })) as DirectoryHandle;
    return directory.getFileHandle(parts[parts.length - 1], { create }) as Promise<FileHandle>;
  },
  async read(path: string): Promise<string> {
    if (!active) throw new Error("Open the vault before reading its files.");
    safeVaultPath(path);
    let text: string;
    if (active.handle) {
      const file = await (await vault.file(path)).getFile();
      if (file.size > 20 * 1024 * 1024)
        throw new Error("This vault note exceeds the 20 MB limit: " + path);
      text = await file.text();
    } else text = (await bridge()!.read({ id: active.id, path })).text;
    return text;
  },
  async asset(path: string) {
    if (!active) return undefined;
    safeVaultPath(path);
    if (!/\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(path)) return undefined;
    if (active.handle) {
      const file = await (await vault.file(path)).getFile();
      if (file.size > 20 * 1024 * 1024) throw new Error("This image exceeds 20 MB.");
      return file;
    }
    const result = await bridge()!.asset({ id: active.id, path });
    return new Blob(
      [Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0))],
      { type: result.mime },
    );
  },
  async assign(doc: SlateDocument, folderPath = "") {
    if (!active) return doc;
    const extension = doc.kind === "note" ? ".md" : ".slate-notebook";
    const name =
      doc.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "Untitled";
    let path = (folderPath ? folderPath + "/" : "") + name + extension;
    let counter = 1;
    for (;;) {
      try {
        await vault.read(path);
        path = (folderPath ? folderPath + "/" : "") + name + " (" + ++counter + ")" + extension;
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "NotFoundError") ||
          (error instanceof Error && /ENOENT|not found/i.test(error.message))
        )
          break;
        throw error;
      }
    }
    originals.set(path, null);
    const id = "vault-note-" + (await stableId(active.id + ":" + path));
    await writeMeta("vault-original:" + id, null);
    return { ...doc, id, source: { vaultId: active.id, path } };
  },
  async save(doc: SlateDocument) {
    if (!doc.source || (doc.kind !== "note" && doc.kind !== "notebook")) return;
    if (active?.id !== doc.source.vaultId)
      throw new Error("Reopen this document's vault to save its file.");
    const path = safeVaultPath(doc.source.path);
    const text = doc.kind === "note" ? doc.content : JSON.stringify({ ...doc, source: undefined });
    let expected = originals.get(path);
    if (expected === undefined) {
      expected = await readMeta<string | null>("vault-original:" + doc.id);
      if (expected === undefined) throw new Error("Reconnect the vault before saving this file.");
    }
    if (text === expected) return;
    if (active.handle) {
      // The File System Access API swaps the temporary file when close succeeds.
      let actual: string | null = null;
      try {
        actual = await vault.read(path);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
      }
      if (actual !== expected) throw new VaultConflict();
      const stream = await (await vault.file(path, true)).createWritable();
      try {
        await stream.write(text);
        await stream.close();
      } catch (error) {
        await stream.abort().catch(() => {});
        throw error;
      }
    } else {
      try {
        await bridge()!.write({ id: active.id, path, text, expected: expected ?? null });
      } catch (error) {
        if (error instanceof Error && /conflict/i.test(error.message)) throw new VaultConflict();
        throw error;
      }
    }
    originals.set(path, text);
    await writeMeta("vault-original:" + doc.id, text);
  },
  async index(connection: VaultConnection) {
    const previous = active;
    active = connection;
    try {
      if (!(await vault.permission())) throw new Error("Allow folder access to open this vault.");
      const paths = await vault.paths(),
        folders: Folder[] = [],
        documents: SlateDocument[] = [],
        baselines: [string, string][] = [];
      const folderPaths = new Set(
        paths.filter((path) => path.endsWith("/")).map((path) => path.slice(0, -1)),
      );
      for (const path of paths.filter((path) => !path.endsWith("/"))) {
        const parent = path.split("/").slice(0, -1).join("/");
        if (parent) folderPaths.add(parent);
      }
      for (const path of folderPaths)
        folders.push({
          id: "vault-folder-" + (await stableId(connection.id + ":" + path)),
          name: path,
          color: "#385775",
          vaultId: connection.id,
          path,
        });
      for (const path of paths.filter((path) => !path.endsWith("/"))) {
        const text = await vault.read(path),
          id = "vault-note-" + (await stableId(connection.id + ":" + path));
        const parent = path.split("/").slice(0, -1).join("/");
        let doc = makeDocument(
          "note",
          path
            .split("/")
            .pop()!
            .replace(/\.[^.]+$/, ""),
          folders.find((folder) => folder.path === parent)?.id || null,
        );
        if (/\.slate-notebook$/i.test(path)) {
          const parsed = docSchema.safeParse(JSON.parse(text));
          if (!parsed.success || parsed.data.kind !== "notebook")
            throw new Error("Invalid notebook file: " + path);
          doc = { ...parsed.data, folderId: doc.folderId };
        } else doc.content = text;
        documents.push({ ...doc, id, source: { vaultId: connection.id, path }, revision: 1 });
        baselines.push([id, text]);
      }
      // Validate the whole folder before changing expectations for currently open files.
      for (const [id, text] of baselines) await writeMeta("vault-original:" + id, text);
      return { documents, folders };
    } finally {
      active = previous;
    }
  },
};
