import type { Page, SlateDocument, Stroke } from "./model";

export interface InkSavePatch {
  document: Omit<SlateDocument, "pages">;
  pages: (Omit<Page, "strokes"> & { keep: number; strokes: (Stroke | string)[] })[];
}

// Transfer changed ink only. The worker reads the unchanged samples from IndexedDB.
export function inkSavePatch(doc: SlateDocument, previous?: SlateDocument): InkSavePatch {
  const { pages = [], ...document } = doc;
  const oldPages = new Map(previous?.pages?.map((page) => [page.id, page]));
  return {
    document,
    pages: pages.map(({ strokes, ...page }) => {
      const old = oldPages.get(page.id)?.strokes || [];
      let keep = 0;
      while (keep < old.length && keep < strokes.length && old[keep] === strokes[keep]) keep++;
      const known = new Map(old.slice(keep).map((stroke) => [stroke.id, stroke]));
      return {
        ...page,
        keep,
        strokes: strokes
          .slice(keep)
          .map((stroke) => (known.get(stroke.id) === stroke ? stroke.id : stroke)),
      };
    }),
  };
}

export function applyInkSavePatch(patch: InkSavePatch, previous?: SlateDocument): SlateDocument {
  const oldPages = new Map(previous?.pages?.map((page) => [page.id, page]));
  return {
    ...patch.document,
    pages: patch.pages.map(({ keep, strokes, ...page }) => {
      const old = oldPages.get(page.id)?.strokes || [];
      if (keep > old.length)
        throw new Error("Saved ink changed. Keep Slate open and retry saving.");
      const known = new Map(old.slice(keep).map((stroke) => [stroke.id, stroke]));
      return {
        ...page,
        strokes: old.slice(0, keep).concat(
          strokes.map((stroke) => {
            if (typeof stroke !== "string") return stroke;
            const saved = known.get(stroke);
            if (!saved) throw new Error("Saved ink is missing. Keep Slate open and retry saving.");
            return saved;
          }),
        ),
      };
    }),
  };
}
