import { inkSavePatch } from "./ink-patch";
import type { SlateDocument } from "./model";
import { SaveConflict } from "./database";

let worker: Worker | undefined;
let unavailable = false;
let sequence = 0;
const previous = new Map<string, { document: SlateDocument; revision: number }>();
const serialized = new WeakMap<SlateDocument, string>();
const pending = new Map<
  number,
  {
    resolve(result: { revision: number; text?: string }): void;
    reject(error: Error): void;
  }
>();
export class InkSaveUnavailable extends Error {}

function saveWorker() {
  if (unavailable || typeof window === "undefined" || typeof Worker === "undefined") return;
  if (!worker) {
    try {
      worker = new Worker(new URL("./ink-save.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.request);
        if (!request) return;
        pending.delete(data.request);
        if (data.error) {
          const error =
            data.error.name === "SaveConflict" ? new SaveConflict() : new Error(data.error.message);
          request.reject(error);
        } else request.resolve(data);
      };
      worker.onerror = () => {
        unavailable = true;
        worker?.terminate();
        worker = undefined;
        previous.clear();
        for (const request of pending.values())
          request.reject(new InkSaveUnavailable("Background ink saving stopped."));
        pending.clear();
      };
    } catch {
      unavailable = true;
    }
  }
  return worker;
}

function remember(doc: SlateDocument, revision: number) {
  previous.delete(doc.id);
  previous.set(doc.id, { document: doc, revision });
  // Keep only a few recent snapshots; completed notebooks must be collectable.
  if (previous.size > 4) previous.delete(previous.keys().next().value!);
}

export function prepareInkSave(doc: SlateDocument) {
  if (saveWorker()) remember(doc, doc.revision);
}

export function inkVaultText(doc: SlateDocument) {
  return serialized.get(doc);
}

export async function saveInkDocument(doc: SlateDocument, expectedRevision: number) {
  if (doc.kind !== "notebook" && doc.kind !== "pdf") return;
  const target = saveWorker();
  if (!target) return;
  const old = previous.get(doc.id);
  const patch = inkSavePatch(doc, old?.revision === expectedRevision ? old.document : undefined);
  const request = ++sequence;
  const result = await new Promise<{ revision: number; text?: string }>((resolve, reject) => {
    pending.set(request, { resolve, reject });
    try {
      target.postMessage({ request, expectedRevision, patch });
    } catch (error) {
      pending.delete(request);
      reject(error);
    }
  });
  remember(doc, result.revision);
  if (result.text !== undefined) serialized.set(doc, result.text);
  return result.revision;
}
