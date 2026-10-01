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
