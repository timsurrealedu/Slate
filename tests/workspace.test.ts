import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { workspace } from "../src/slate/core/workspace";
import * as storage from "../src/slate/core/storage";
beforeEach(async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  await storage.clearDatabaseForTests();
  await workspace.load();
});
afterEach(() => vi.unstubAllGlobals());
describe("workspace recovery", () => {
  it("creates named documents without overwriting duplicate titles and validates before saving", async () => {
    const first = await workspace.create("note", null, "  Thermodynamics  ");
    const second = await workspace.create("note", null, "Thermodynamics");
    const notebook = await workspace.create("notebook", null, "Lecture sketches");
    expect(first.title).toBe("Thermodynamics");
    expect(second.title).toBe("Thermodynamics 2");
    expect(first.id).not.toBe(second.id);
    expect(notebook.title).toBe("Lecture sketches");
    expect(notebook.pages).toHaveLength(1);
    const count = workspace.get().documents.length;
    await expect(workspace.create("note", null, "bad/name")).rejects.toThrow();
    await expect(workspace.create("notebook", null, "  ")).rejects.toThrow();
    expect(workspace.get().documents).toHaveLength(count);
    const saved = (await storage.readWorkspace()).documents;
    expect(saved.find((doc) => doc.id === first.id)?.title).toBe(first.title);
    expect(saved.find((doc) => doc.id === notebook.id)?.title).toBe(notebook.title);
  });
  it("flushes queued handwriting immediately for close and backup recovery", async () => {
    const doc = await workspace.create("notebook");
    const strokes = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      tool: "pen" as const,
      rendering: "precise" as const,
      color: "#385775",
      width: 0.6,
      pressureSensitive: true,
      points: [{ x: i / 10, y: i / 20, p: i / 50, t: i }],
    }));
    for (let i = 1; i <= strokes.length; i++)
      workspace.update(doc.id, {
        pages: [{ ...doc.pages[0], strokes: strokes.slice(0, i) }],
      });
    expect(workspace.get().saving).toBeGreaterThan(0);
    await workspace.flush();
    const saved = (await storage.readWorkspace()).documents.find((d) => d.id === doc.id)!;
    expect(saved.pages[0].strokes).toEqual(strokes);
    expect(saved.revision).toBe(2);
    const backup = await storage.parseBackup(await workspace.backup());
    expect(backup.manifest.documents.find((d) => d.id === doc.id)!.pages[0].strokes).toEqual(
      strokes,
    );
  });
  it("autosaves continuous handwriting within a bounded interval", async () => {
    const doc = await workspace.create("notebook");
    const save = vi.spyOn(storage, "saveDocument");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      for (let i = 0; i < 7; i++) {
        workspace.update(doc.id, {
          pages: [
            {
              ...doc.pages[0],
              strokes: [
                {
                  id: "ink",
                  tool: "pen",
                  rendering: "precise",
                  color: "#385775",
                  width: 0.6,
                  points: [{ x: i / 10, y: i / 20, p: 0.5, t: i }],
                },
              ],
            },
          ],
        });
        await vi.advanceTimersByTimeAsync(150);
      }
      expect(save).toHaveBeenCalledTimes(1);
      await workspace.flush();
      const saved = (await storage.readWorkspace()).documents.find((d) => d.id === doc.id)!;
      expect(saved.pages[0].strokes[0].points[0].x).toBe(0.6);
    } finally {
      vi.useRealTimers();
      save.mockRestore();
    }
  });
  (it("recovering one conflict preserves a different unsaved document", async () => {
    const a = await workspace.create("note"),
      b = await workspace.create("note");
    await storage.saveDocument({ ...a, content: "Remote A" }, 1);
    await storage.saveDocument({ ...b, content: "Remote B" }, 1);
    workspace.update(a.id, { content: "Local A" });
    workspace.update(b.id, { content: "Local B" });
    await expect(workspace.flush()).rejects.toThrow();
    const copyA = await workspace.saveConflictCopy(a.id);
    expect(copyA?.content).toBe("Local A");
    expect(workspace.get().documents.find((d) => d.id === b.id)?.content).toBe("Local B");
    const backup = await storage.parseBackup(await workspace.backup());
    expect(backup.manifest.documents.find((d) => d.id === b.id)?.content).toBe("Local B");
    const copyB = await workspace.saveConflictCopy(b.id);
    expect(copyB?.content).toBe("Local B");
    await workspace.flush();
    expect((await storage.readWorkspace()).documents.find((d) => d.id === a.id)?.content).toBe(
      "Remote A",
    );
  }),
    it("rapid preference changes merge without losing the earlier choice", async () => {
      await Promise.all([
        workspace.preferences({ theme: "dark" }),
        workspace.preferences({ editorSize: 22 }),
      ]);
      await workspace.flush();
      expect((await storage.readWorkspace()).preferences).toMatchObject({
        theme: "dark",
        editorSize: 22,
      });
    }),
    it("restoring history explicitly checkpoints the current work", async () => {
      const a = await workspace.create("note");
      workspace.update(a.id, { content: "Important current work" });
      await workspace.flush();
      await workspace.restoreRevision(a.id, { ...a, content: "Earlier work" });
      expect(
        (await storage.getRevisions(a.id)).some(
          (r) => r.document.content === "Important current work",
        ),
      ).toBe(true);
      expect((await storage.readWorkspace()).documents.find((d) => d.id === a.id)?.content).toBe(
        "Earlier work",
      );
    }));
});
