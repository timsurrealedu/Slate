// Reads handwriting photos off the input thread.
import {
  extractHandwriting,
  traceSize,
  type HandwritingOptions,
  type HandwritingPage,
  type Raster,
} from "./handwriting";

export const PHOTO_TYPES = /^image\/(png|jpe?g|webp|gif|bmp)$/;
export const PHOTO_LIMIT = 40 * 1024 * 1024;

// Decodes a photo upright (EXIF orientation applied) at the trace size.
export async function decodePhoto(file: File): Promise<Raster> {
  if (!PHOTO_TYPES.test(file.type) || file.size > PHOTO_LIMIT)
    throw new Error("Choose a PNG, JPEG, WebP, GIF or BMP photo smaller than 40 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("“" + file.name + "” could not be opened as an image.");
  }
  const { width, height } = traceSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

let worker: Worker | undefined;
let unavailable = false;
let sequence = 0;
const pending = new Map<
  number,
  { resolve(page: HandwritingPage): void; reject(error: Error): void }
>();
function traceWorker() {
  if (unavailable || typeof Worker === "undefined") return;
  if (!worker) {
    try {
      worker = new Worker(new URL("./handwriting.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.request);
        if (!request) return;
        pending.delete(data.request);
        if (data.error) request.reject(new Error(data.error));
        else request.resolve(data.result);
      };
      worker.onerror = () => {
        unavailable = true;
        worker?.terminate();
        worker = undefined;
        for (const request of pending.values())
          request.reject(new Error("Photo reading stopped. Try again."));
        pending.clear();
      };
    } catch {
      unavailable = true;
    }
  }
  return worker;
}

export function traceHandwriting(raster: Raster, options: HandwritingOptions) {
  const w = traceWorker();
  if (!w) return Promise.resolve(extractHandwriting(raster, options));
  const request = ++sequence;
  // The decoded photo is kept for re-tracing at another sensitivity; the worker gets a copy.
  const data = raster.data.slice();
  return new Promise<HandwritingPage>((resolve, reject) => {
    pending.set(request, { resolve, reject });
    w.postMessage({ request, raster: { ...raster, data }, options }, [data.buffer]);
  });
}
