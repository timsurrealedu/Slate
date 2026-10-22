import { openDatabase, request, done, saveDocument as saveLocalDocument } from "./database";
import { InkSaveUnavailable, saveInkDocument } from "./ink-save";
export { openDatabase, SaveConflict, checkpointDocument, clearDatabaseForTests } from "./database";

import { z } from "zod";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  SCHEMA_VERSION,
  DEFAULT_PREFERENCES,
  DEFAULT_PENS,
  type SlateDocument,
  type Folder,
  type Preferences,
} from "./model";

export async function readWorkspace() {
  const db = await openDatabase();
  const tx = db.transaction(["documents", "folders", "meta"], "readonly");
  const [documents, folders, prefs, initialized] = await Promise.all([
    request<SlateDocument[]>(tx.objectStore("documents").getAll()),
    request<Folder[]>(tx.objectStore("folders").getAll()),
    request<Preferences | undefined>(tx.objectStore("meta").get("preferences")),
    request<boolean | undefined>(tx.objectStore("meta").get("initialized")),
  ]);
  return {
    documents,
    folders,
    preferences: { ...DEFAULT_PREFERENCES, ...prefs },
    initialized: !!initialized,
  };
}
export async function initializeWorkspace(
  documents: SlateDocument[],
  folders: Folder[],
  assets: { id: string; blob: Blob }[] = [],
) {
  const db = await openDatabase();
  const tx = db.transaction(["documents", "folders", "assets", "meta"], "readwrite");
  const completion = done(tx);
  if (await request(tx.objectStore("meta").get("initialized"))) {
    await completion;
    return;
  }
  for (const d of documents) tx.objectStore("documents").put({ ...d, revision: 1 });
  for (const f of folders) tx.objectStore("folders").put(f);
  for (const a of assets) tx.objectStore("assets").put(a);
  tx.objectStore("meta").put(DEFAULT_PREFERENCES, "preferences");
  tx.objectStore("meta").put(true, "initialized");
  await completion;
}
export async function putImportedDocument(doc: SlateDocument, asset?: { id: string; blob: Blob }) {
  const db = await openDatabase();
  const tx = db.transaction(["documents", "assets"], "readwrite");
  const completion = done(tx);
  tx.objectStore("documents").add({ ...doc, revision: 1 });
  if (asset) tx.objectStore("assets").add(asset);
  await completion;
}
export async function getAsset(id: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  const entry = await request<{ id: string; blob: Blob } | undefined>(
    db.transaction("assets", "readonly").objectStore("assets").get(id),
  );
  return entry?.blob;
}
export async function putAsset(id: string, blob: Blob) {
  const db = await openDatabase();
  const tx = db.transaction("assets", "readwrite");
  const completion = done(tx);
  tx.objectStore("assets").put({ id, blob });
  await completion;
}
export async function saveFolder(folder: Folder) {
  const db = await openDatabase();
  const tx = db.transaction("folders", "readwrite");
  const completion = done(tx);
  tx.objectStore("folders").put(folder);
  await completion;
}
export async function savePreferences(p: Preferences) {
  const db = await openDatabase();
  const tx = db.transaction("meta", "readwrite");
  const completion = done(tx);
  tx.objectStore("meta").put(p, "preferences");
  await completion;
}
export async function readMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return request<T | undefined>(db.transaction("meta", "readonly").objectStore("meta").get(key));
}
export async function writeMeta(key: string, value: unknown) {
  const db = await openDatabase();
  const tx = db.transaction("meta", "readwrite"),
    completion = done(tx);
  tx.objectStore("meta").put(value, key);
  await completion;
}
export async function cacheVaultDocument(doc: SlateDocument) {
  const db = await openDatabase();
  const tx = db.transaction("documents", "readwrite"),
    completion = done(tx);
  tx.objectStore("documents").put(doc);
  await completion;
}
export async function commitImport(
  documents: SlateDocument[],
  assets: { id: string; blob: Blob }[],
  folders: Folder[] = [],
) {
  const db = await openDatabase();
  const tx = db.transaction(["documents", "assets", "folders"], "readwrite"),
    completion = done(tx);
  for (const doc of documents) tx.objectStore("documents").put(doc);
  for (const asset of assets) tx.objectStore("assets").put(asset);
  for (const folder of folders) tx.objectStore("folders").put(folder);
  await completion;
}
export async function getRevisions(id: string) {
  const db = await openDatabase();
  const items = await request<{ key: string; savedAt: number; document: SlateDocument }[]>(
    db.transaction("revisions", "readonly").objectStore("revisions").index("documentId").getAll(id),
  );
  return items.sort((a, b) => b.document.revision - a.document.revision);
}
const paper = z.object({
  style: z.enum(["blank", "lined", "grid", "dot", "cornell", "legal", "vertical"]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  lineColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  spacing: z.number().min(8).max(100),
  template: z.literal("flexcil").optional(),
  columns: z.boolean().optional(),
});
const point = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  p: z.number().min(0).max(1),
  t: z.number().finite(),
});
const stroke = z.object({
  id: z.string().max(200),
  tool: z.enum(["pen", "highlighter"]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().min(0.1).max(100),
  points: z.array(point).max(100000),
  rendering: z.enum(["direct", "smooth", "precise"]).optional(),
  pressureSensitive: z.boolean().optional(),
  brush: z
    .enum(["ballpoint", "fountain", "calligraphy", "pencil", "highlighter", "marker"])
    .optional(),
  opacity: z.number().min(0.05).max(1).optional(),
});
export const docSchema = z.object({
  id: z.string().max(200),
  title: z.string().max(1000),
  kind: z.enum(["note", "notebook", "pdf", "docx"]),
  folderId: z.string().max(200).nullable(),
  content: z.string().max(10000000),
  pages: z
    .array(
      z.object({
        id: z.string().max(200),
        paper,
        width: z.number().min(1).max(10000),
        height: z.number().min(1).max(10000),
        strokes: z.array(stroke).max(50000),
      }),
    )
    .max(10000),
  assetId: z.string().max(200).optional(),
  mime: z.string().max(200).optional(),
  flexcil: z
    .object({
      originalId: z.string().max(200),
      sourceEntry: z.string().max(2000),
      fingerprint: z.string().max(200),
      limitations: z.array(z.string().max(2000)).max(30),
    })
    .optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  openedAt: z.number(),
  revision: z.number().int().nonnegative(),
  starred: z.boolean(),
  trashedAt: z.number().nullable(),
  example: z.boolean().optional(),
  tags: z.array(z.string().max(200)).max(100),
});
const manifestSchema = z.object({
  schema: z.literal(1),
  exportedAt: z.string(),
  documents: z.array(docSchema).max(100000),
  folders: z
    .array(
      z.object({
        id: z.string().max(200),
        name: z.string().max(1000),
        color: z.string().regex(/^#[0-9a-f]{6}$/i),
        parentId: z.string().max(200).nullable().optional(),
        trashedAt: z.number().nullable().optional(),
      }),
    )
    .max(10000),
  assets: z
    .array(
      z.object({
        id: z.string().max(200),
        path: z.string().regex(/^assets\/[a-z0-9-]+$/i),
        mime: z.string().max(200),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(100000),
  preferences: z.object({
    theme: z.enum(["light", "dark", "system"]),
    paper,
    touchInk: z.boolean(),
    penPressure: z.boolean().default(true),
    inkColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#385775"),
    inkWidth: z.number().min(0.6).max(2.4).default(1.2),
    inkToolbarMode: z.enum(["docked", "floating"]).default("docked"),
    notebookTitlebar: z.boolean().default(true),
    pens: z
      .array(
        z.object({
          brush: z.enum([
            "ballpoint",
            "fountain",
            "calligraphy",
            "pencil",
            "highlighter",
            "marker",
          ]),
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
          width: z.number().min(0.1).max(40),
          opacity: z.number().min(0.05).max(1),
          straight: z.boolean(),
          smooth: z.number().min(0).max(1).default(0.2),
        }),
      )
      .min(1)
      .max(40)
      .default(DEFAULT_PENS),
    activePen: z.number().int().min(0).max(39).default(0),
    eraserWidth: z.number().min(1).max(40).default(10),
    notebookPages: z.boolean().default(true),
    inkToolbarPosition: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
      .nullable()
      .default(null),
    editorSize: z.number().min(14).max(26),
    workspaceName: z.string().max(200),
    lineNumbers: z.boolean().default(false),
    vim: z.boolean().default(false),
    showHiddenFiles: z.boolean().default(false),
    sidebarWidth: z.number().min(180).max(480).default(228),
    editorWidth: z.number().min(360).max(1600).default(850),
    editorMarginLeft: z.number().min(0).max(200).default(50),
    editorMarginRight: z.number().min(0).max(200).default(50),
    editorAlignment: z.enum(["left", "center", "right"]).default("center"),
  }),
});
async function hash(bytes: Uint8Array): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(value), (n) => n.toString(16).padStart(2, "0")).join("");
}
export async function exportWorkspace(
  documents: SlateDocument[],
  folders: Folder[],
  preferences: Preferences,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const assets: { id: string; path: string; mime: string; hash: string }[] = [];
  const db = await openDatabase();
  const saved = await request<{ id: string; blob: Blob }[]>(
    db.transaction("assets", "readonly").objectStore("assets").getAll(),
  );
  const used = new Set(
    documents.flatMap((doc) => [
      ...(doc.assetId ? [doc.assetId] : []),
      ...(doc.flexcil ? [doc.flexcil.originalId] : []),
      ...Array.from(doc.content.matchAll(/attachment:([a-z0-9-]+)/gi), (match) => match[1]),
    ]),
  );
  for (const entry of saved.filter((asset) => used.has(asset.id))) {
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const path = "assets/" + entry.id;
    files[path] = bytes;
    assets.push({ id: entry.id, path, mime: entry.blob.type, hash: await hash(bytes) });
  }
  files["manifest.json"] = strToU8(
    JSON.stringify({
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      documents,
      folders,
      preferences,
      assets,
    }),
  );
  files["manifest.sha256"] = strToU8(await hash(files["manifest.json"]));
  const bytes = zipSync(files, { level: 3 });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}
export async function parseBackup(blob: Blob) {
  if (blob.size > 256 * 1024 * 1024)
    throw new Error("This backup is larger than the 256 MB import limit.");
  let size = 0;
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
    filter: (file) => {
      size += file.originalSize;
      if (size > 512 * 1024 * 1024) throw new Error("This backup expands beyond the 512 MB limit.");
      return true;
    },
  });
  if (!files["manifest.json"] || !files["manifest.sha256"])
    throw new Error("This file is not a Slate workspace backup.");
  if ((await hash(files["manifest.json"])) !== strFromU8(files["manifest.sha256"]).trim())
    throw new Error("The backup manifest is damaged. Your workspace has not been changed.");
  let data: unknown;
  try {
    data = JSON.parse(strFromU8(files["manifest.json"]));
  } catch {
    throw new Error("The backup manifest cannot be read.");
  }
  if (!data || typeof data !== "object" || (data as { schema?: number }).schema !== SCHEMA_VERSION)
    throw new Error("This backup uses an unsupported format. Your workspace has not been changed.");
  const result = manifestSchema.safeParse(data);
  if (!result.success)
    throw new Error(
      "This backup contains invalid document data. Your workspace has not been changed.",
    );
  const manifest = result.data;
  const ids = new Set<string>();
  for (const d of manifest.documents) {
    if (ids.has(d.id)) throw new Error("The backup has duplicate document IDs.");
    ids.add(d.id);
  }
  const assets = new Map<string, Blob>();
  for (const a of manifest.assets) {
    if (!files[a.path] || (await hash(files[a.path])) !== a.hash)
      throw new Error("An original file in this backup is missing or damaged.");
    assets.set(a.id, new Blob([files[a.path] as Uint8Array<ArrayBuffer>], { type: a.mime }));
  }
  for (const d of manifest.documents)
    if ((d.assetId && !assets.has(d.assetId)) || (d.flexcil && !assets.has(d.flexcil.originalId)))
      throw new Error("A document in this backup is missing its original file.");
  return { manifest, assets };
}
export async function restoreBackup(
  parsed: Awaited<ReturnType<typeof parseBackup>>,
  vaultId?: string,
) {
  const db = await openDatabase();
  const folders = parsed.manifest.folders.map((f) => ({
    ...f,
    id: crypto.randomUUID(),
    name: f.name + " (restored)",
    ...(vaultId ? { vaultId } : {}),
  }));
  const folderMap = new Map(parsed.manifest.folders.map((f, i) => [f.id, folders[i].id]));
  for (const folder of folders)
    if (folder.parentId) folder.parentId = folderMap.get(folder.parentId) || null;
  const assetMap = new Map([...parsed.assets.keys()].map((id) => [id, crypto.randomUUID()]));
  const documents = parsed.manifest.documents.map((d) => ({
    ...d,
    id: crypto.randomUUID(),
    revision: 1,
    ...(vaultId ? { vaultId } : {}),
    content: d.content.replace(/attachment:([a-z0-9-]+)/gi, (raw, id) =>
      assetMap.has(id) ? "attachment:" + assetMap.get(id) : raw,
    ),
    folderId: d.folderId ? folderMap.get(d.folderId) || null : null,
    assetId: d.assetId ? assetMap.get(d.assetId) : undefined,
    flexcil: d.flexcil
      ? { ...d.flexcil, originalId: assetMap.get(d.flexcil.originalId)! }
      : undefined,
  }));
  const tx = db.transaction(["documents", "folders", "assets"], "readwrite");
  const completion = done(tx);
  for (const d of documents) tx.objectStore("documents").add(d);
  for (const f of folders) tx.objectStore("folders").add(f);
  for (const [old, blob] of parsed.assets)
    tx.objectStore("assets").add({ id: assetMap.get(old), blob });
  await completion;
  return { documents, folders };
}
export async function saveDocument(doc: SlateDocument, expectedRevision: number): Promise<number> {
  try {
    return (
      (await saveInkDocument(doc, expectedRevision)) ?? saveLocalDocument(doc, expectedRevision)
    );
  } catch (error) {
    if (!(error instanceof InkSaveUnavailable)) throw error;
    return saveLocalDocument(doc, expectedRevision);
  }
}
