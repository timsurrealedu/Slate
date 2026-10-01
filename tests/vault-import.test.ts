import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { zipSync, strToU8 } from "fflate";
import { workspace } from "../src/slate/core/workspace";
import { vault } from "../src/slate/platform/vault";
import * as storage from "../src/slate/core/storage";
import { importFlexcil } from "../src/slate/import/flexcil/importer";
const { createVaultStore } = createRequire(import.meta.url)("../platform/desktop/vault.cjs");
let temporary: string;
beforeEach(async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  await storage.clearDatabaseForTests();
  await workspace.load();
  await mkdir(resolve("artifacts/tests"), { recursive: true });
  temporary = await mkdtemp(resolve("artifacts/tests/vault-"));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(temporary, { recursive: true, force: true });
});

it("opens nested vaults, saves original Markdown, reconnects, and retains the local workspace", async () => {
  const root = join(temporary, "My vault");
  await mkdir(join(root, "Course"), { recursive: true });
  await mkdir(join(root, ".obsidian"));
  await writeFile(join(root, ".obsidian", "ignored.md"), "settings");
  await writeFile(join(root, "Course", "Lesson.md"), "---\ntags: study\n---\n# Lesson\nOriginal\n");
  const store = createVaultStore(join(temporary, "roots.json"));
  await store.load();
  const connection = await store.authorize(root);
  vi.stubGlobal("window", { slateVault: store });
  const localCount = workspace.get().documents.length;
  await workspace.openVault(connection);
  expect(workspace.get().documents).toHaveLength(1);
  const note = workspace.get().documents[0];
  expect(workspace.get().folders[0].name).toBe("Course");
  expect(note.source?.path).toBe("Course/Lesson.md");
  workspace.update(note.id, {
    content: "# Lesson\nEdited in Slate",
    starred: true,
    tags: ["exam"],
  });
  await workspace.flush();
  expect(await readFile(join(root, "Course", "Lesson.md"), "utf8")).toBe(
    "# Lesson\nEdited in Slate",
  );
  await workspace.load();
  expect(workspace.get().documents[0].id).toBe(note.id);
  const notebook = await workspace.create("notebook", note.folderId);
  expect(
    await readFile(join(root, "Course", "Untitled notebook.slate-notebook"), "utf8"),
  ).toContain(notebook.id);
  await workspace.openVault(connection);
  expect(workspace.get().documents).toHaveLength(2);
  expect(workspace.get().documents.find((doc) => doc.id === note.id)).toMatchObject({
    starred: true,
    tags: ["exam"],
  });
  const restoredCount = await workspace.restore(await workspace.backup());
  expect(restoredCount).toBe(2);
  await workspace.openVault(connection);
  expect(workspace.get().documents).toHaveLength(4);
  await workspace.load();
  expect(workspace.get().documents).toHaveLength(4);
  await workspace.openVault(null);
  expect(workspace.get().documents).toHaveLength(localCount);
  expect((await readdir(join(root, "Course"))).some((name) => name.endsWith(".tmp"))).toBe(false);
});
it("detects external edits and recovers a copy without overwriting the original", async () => {
  const root = join(temporary, "Vault");
  await mkdir(root);
  await writeFile(join(root, "Note.md"), "Original");
  const store = createVaultStore(join(temporary, "roots.json"));
  await store.load();
  vi.stubGlobal("window", { slateVault: store });
  await workspace.openVault(await store.authorize(root));
  const note = workspace.get().documents[0];
  await writeFile(join(root, "Note.md"), "External edit");
  workspace.update(note.id, { content: "My unsaved edit" });
  await expect(workspace.flush()).rejects.toThrow("changed outside Slate");
  expect(await readFile(join(root, "Note.md"), "utf8")).toBe("External edit");
  const copy = await workspace.saveConflictCopy(note.id);
  expect(copy?.content).toBe("My unsaved edit");
  expect(await readFile(join(root, "Note (local copy).md"), "utf8")).toBe("My unsaved edit");
  await workspace.flush();
  await workspace.openVault(vault.get());
  expect(workspace.get().documents.find((doc) => doc.id === note.id)?.content).toBe(
    "External edit",
  );
});
it("rejects directory traversal and unapproved roots", async () => {
  const store = createVaultStore(join(temporary, "roots.json"));
  const connection = await store.authorize(temporary);
  for (const path of ["../outside.md", "C:/outside.md", "a\\outside.md", "/outside.md"])
    await expect(
      store.write({ id: connection.id, path, text: "bad", expected: null }),
    ).rejects.toThrow();
  await expect(store.list({ id: "unapproved" })).rejects.toThrow("folder access");
});
it("a failed vault refresh cannot turn an external edit into an authorized overwrite", async () => {
  const root = join(temporary, "Vault");
  await mkdir(root);
  await writeFile(join(root, "Note.md"), "Original");
  const store = createVaultStore(join(temporary, "roots.json"));
  await store.load();
  const connection = await store.authorize(root);
  vi.stubGlobal("window", { slateVault: store });
  await workspace.openVault(connection);
  const note = workspace.get().documents[0];
  await writeFile(join(root, "Note.md"), "External edit");
  await writeFile(join(root, "zz-broken.slate-notebook"), "invalid JSON");
  await expect(workspace.openVault(connection)).rejects.toThrow();
  workspace.update(note.id, { content: "Local edit" });
  await expect(workspace.flush()).rejects.toThrow("changed outside Slate");
  expect(await readFile(join(root, "Note.md"), "utf8")).toBe("External edit");
  await workspace.saveConflictCopy(note.id);
  await workspace.flush();
});
function fixture(path = "/Course/Notebook.flx") {
  const nested = zipSync(
    {
      metadata: strToU8(JSON.stringify({ name: "Physics", pageCount: 2 })),
      original: strToU8("%PDF-1.7\nfixture"),
      "opaque-ink": new Uint8Array([1, 7, 99, 0]),
    },
    { level: 0 },
  );
  return { nested, file: new File([zipSync({ [path]: nested }, { level: 0 })], "Backup.flex") };
}
it("imports Flexcil structurally, preserves exact source bytes, and does not duplicate on reimport", async () => {
  vi.stubGlobal("navigator", { storage: {} });
  const { nested, file } = fixture();
  const pdfPages = async () => [
    { width: 595, height: 842 },
    { width: 842, height: 595 },
  ];
  const report = await importFlexcil(file, { pdfPages });
  expect(report).toMatchObject({ imported: 1, preserved: 3, skipped: 0 });
  const doc = (await storage.readWorkspace()).documents.find((doc) => doc.flexcil)!;
  expect(doc).toMatchObject({ title: "Physics", kind: "pdf" });
  expect(doc.pages).toHaveLength(2);
  expect(
    new Uint8Array(await (await storage.getAsset(doc.flexcil!.originalId))!.arrayBuffer()),
  ).toEqual(nested);
  expect((await importFlexcil(file, { pdfPages })).skipped).toBe(1);
  const backup = await storage.parseBackup(
    await storage.exportWorkspace([doc], [], workspace.get().preferences),
  );
  const restored = await storage.restoreBackup(backup);
  expect(await storage.getAsset(restored.documents[0].flexcil!.originalId)).toBeDefined();
});
it("cancels or rejects unsafe Flexcil archives before changing documents", async () => {
  vi.stubGlobal("navigator", { storage: {} });
  const count = (await storage.readWorkspace()).documents.length;
  const controller = new AbortController();
  controller.abort();
  await expect(importFlexcil(fixture().file, { signal: controller.signal })).rejects.toThrow(
    "cancelled",
  );
  await expect(importFlexcil(fixture("../outside.flx").file)).rejects.toThrow(
    "Unsafe ZIP entry path",
  );
  expect((await storage.readWorkspace()).documents).toHaveLength(count);
});
