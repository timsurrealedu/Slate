import { SCHEMA_VERSION, type SlateDocument } from "./model";

const NAME = "slate-workspace";
let database: Promise<IDBDatabase> | undefined;
export class SaveConflict extends Error {
  constructor() {
    super("This document changed in another window.");
    this.name = "SaveConflict";
  }
}
export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("The save transaction was interrupted."));
    tx.onerror = () => reject(tx.error || new Error("Could not save."));
  });
}
export function openDatabase(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, SCHEMA_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("documents"))
          db.createObjectStore("documents", { keyPath: "id" });
        if (!db.objectStoreNames.contains("folders"))
          db.createObjectStore("folders", { keyPath: "id" });
        if (!db.objectStoreNames.contains("assets"))
          db.createObjectStore("assets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        if (!db.objectStoreNames.contains("revisions")) {
          const s = db.createObjectStore("revisions", { keyPath: "key" });
          s.createIndex("documentId", "documentId");
        }
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          database = undefined;
        };
        resolve(r.result);
      };
      r.onerror = () => {
        database = undefined;
        reject(r.error || new Error("Local storage is unavailable."));
      };
      r.onblocked = () => {
        database = undefined;
        reject(new Error("Close other Slate windows to finish updating local storage."));
      };
    });
  return database;
}
async function recordRevision(tx: IDBTransaction, doc: SlateDocument, force = false) {
  const history = tx.objectStore("revisions");
  const keys = await request<IDBValidKey[]>(history.index("documentId").getAllKeys(doc.id));
  keys.sort((a, b) => Number(String(a).split(":").pop()) - Number(String(b).split(":").pop()));
  const last = keys.length
    ? await request<{ savedAt: number } | undefined>(history.get(keys[keys.length - 1]))
    : undefined;
  if (force || !last || Date.now() - last.savedAt >= 30000) {
    const key = doc.id + ":" + doc.revision;
    history.put({ key, documentId: doc.id, savedAt: Date.now(), document: doc });
    if (!keys.includes(key)) keys.push(key);
  }
  keys.sort((a, b) => Number(String(a).split(":").pop()) - Number(String(b).split(":").pop()));
  for (const key of keys.slice(0, Math.max(0, keys.length - 20))) history.delete(key);
}
export async function checkpointDocument(id: string) {
  const db = await openDatabase();
  const tx = db.transaction(["documents", "revisions"], "readwrite");
  const completion = done(tx);
  const doc = await request<SlateDocument | undefined>(tx.objectStore("documents").get(id));
  if (doc) await recordRevision(tx, doc, true);
  await completion;
}
export async function saveDocument(doc: SlateDocument, expectedRevision: number): Promise<number> {
  return updateDocument(doc.id, expectedRevision, () => doc);
}
export async function updateDocument(
  id: string,
  expectedRevision: number,
  update: (old: SlateDocument | undefined) => SlateDocument,
): Promise<number> {
  const db = await openDatabase();
  const tx = db.transaction(["documents", "revisions"], "readwrite");
  const completion = done(tx);
  const docs = tx.objectStore("documents");
  const old = await request<SlateDocument | undefined>(docs.get(id));
  if ((old?.revision || 0) !== expectedRevision) {
    tx.abort();
    await completion.catch(() => {});
    throw new SaveConflict();
  }
  let doc: SlateDocument;
  try {
    doc = update(old);
  } catch (error) {
    tx.abort();
    await completion.catch(() => {});
    throw error;
  }
  const revision = expectedRevision + 1;
  if (old) await recordRevision(tx, old);
  docs.put({ ...doc, revision });
  await completion;
  return revision;
}
export async function clearDatabaseForTests() {
  const db = await openDatabase();
  db.close();
  database = undefined;
  await request(indexedDB.deleteDatabase(NAME));
}
