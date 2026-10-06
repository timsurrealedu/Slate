import { beforeEach, describe, expect, it } from "vitest";
import { makeDocument, newPage, type Stroke } from "../src/slate/core/model";
import { inkSavePatch, applyInkSavePatch } from "../src/slate/core/ink-patch";
import { updateDocument } from "../src/slate/core/database";
import {
  clearDatabaseForTests,
  putImportedDocument,
  readWorkspace,
  SaveConflict,
} from "../src/slate/core/storage";

const stroke = (id: string): Stroke => ({
  id,
  tool: "pen",
  rendering: "precise",
  color: "#385775",
  width: 0.6,
  points: [{ x: 0.0123, y: 11.25, p: 0.251, t: 42.7 }],
});
beforeEach(clearDatabaseForTests);

describe("incremental background ink persistence", () => {
  it("transfers just new samples when appending to thousands of strokes", () => {
    const old = makeDocument("notebook", "Dense page", null);
    old.pages[0].strokes = Array.from({ length: 10_000 }, (_, i) => stroke(String(i)));
    const added = stroke("new");
    const next = {
      ...old,
      pages: [{ ...old.pages[0], strokes: [...old.pages[0].strokes, added] }],
    };
    const patch = inkSavePatch(next, old);
    expect(patch.pages[0].keep).toBe(10_000);
    expect(patch.pages[0].strokes).toEqual([added]);
    expect(applyInkSavePatch(structuredClone(patch), structuredClone(old))).toEqual(next);
  });

  it("preserves transformations, reorder, erasure, undo, pages and pressure exactly", () => {
    const old = makeDocument("notebook", "History", null);
    const [a, b, c] = [stroke("a"), stroke("b"), stroke("c")];
    old.pages[0].strokes = [a, b, c];
    const moved = { ...a, points: a.points.map((p) => ({ ...p, x: p.x + 25 })) };
    const next = { ...old, pages: [newPage(), { ...old.pages[0], strokes: [c, moved] }] };
    const patch = inkSavePatch(next, old);
    expect(patch.pages[1].strokes).toEqual(["c", moved]);
    const saved = applyInkSavePatch(structuredClone(patch), structuredClone(old));
    expect(saved).toEqual(next);
    expect(applyInkSavePatch(inkSavePatch(old, next), saved)).toEqual(old);
    expect(applyInkSavePatch(inkSavePatch({ ...next, pages: [] }, next), saved).pages).toEqual([]);
  });

  it("retains transactional conflicts and leaves existing ink intact on an invalid patch", async () => {
    const old = makeDocument("notebook", "Protected", null);
    old.pages[0].strokes = [stroke("original")];
    await putImportedDocument(old);
    const patch = inkSavePatch(old);
    patch.pages[0].keep = 2;
    await expect(
      updateDocument(old.id, 1, (saved) => applyInkSavePatch(patch, saved)),
    ).rejects.toThrow("Saved ink changed");
    expect((await readWorkspace()).documents[0].pages).toEqual(old.pages);
    await expect(updateDocument(old.id, 0, () => old)).rejects.toBeInstanceOf(SaveConflict);
    expect((await readWorkspace()).documents[0].revision).toBe(1);
  });
});
