import { updateDocument } from "./database";
import { applyInkSavePatch, type InkSavePatch } from "./ink-patch";

self.onmessage = async ({
  data,
}: MessageEvent<{ request: number; expectedRevision: number; patch: InkSavePatch }>) => {
  const { request, expectedRevision, patch } = data;
  try {
    let text: string | undefined;
    const revision = await updateDocument(patch.document.id, expectedRevision, (old) => {
      const document = applyInkSavePatch(patch, old);
      if (document.kind === "notebook" && document.source)
        text = JSON.stringify({ ...document, source: undefined });
      return document;
    });
    self.postMessage({ request, revision, text });
  } catch (error) {
    self.postMessage({
      request,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : "Could not save ink.",
      },
    });
  }
};
