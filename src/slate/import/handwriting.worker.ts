import { extractHandwriting, type HandwritingOptions, type Raster } from "./handwriting";

self.onmessage = ({
  data,
}: MessageEvent<{ request: number; raster: Raster; options: HandwritingOptions }>) => {
  try {
    self.postMessage({
      request: data.request,
      result: extractHandwriting(data.raster, data.options),
    });
  } catch (error) {
    self.postMessage({
      request: data.request,
      error: error instanceof Error ? error.message : "Could not read this photo.",
    });
  }
};
