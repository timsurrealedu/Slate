import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { zipSync, strToU8 } from "fflate";
import { workspace } from "../src/slate/core/workspace";
import { vault } from "../src/slate/platform/vault";
import { folderChildren, folderTrail, visibleWorkspace } from "../src/slate/core/folders";
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

it("renames nested vault items without losing bytes, identities, history or hidden assets", async () => {
  const root = join(temporary, "Vault");
  await mkdir(join(root, "Course", "Sub", ".private"), { recursive: true });
  const text = "---\ntags: [study, math]\n---\n# Original\n";
  await writeFile(join(root, "Course", "Sub", "Untitled note.md"), text);
  await writeFile(
    join(root, "Course", "Sub", ".private", "asset.bin"),
    new Uint8Array([0, 255, 12, 88]),
  );
  const store = createVaultStore(join(temporary, "roots.json"));
  vi.stubGlobal("window", { slateVault: store });
  const connection = await store.authorize(root);
  await workspace.openVault(connection);
  const note = workspace.get().documents[0],
    course = workspace.get().folders.find((folder) => folder.path === "Course")!;
  const sub = workspace.get().folders.find((folder) => folder.path === "Course/Sub")!;
  expect(folderChildren(workspace.get().folders).map((folder) => folder.id)).toEqual([course.id]);
  expect(folderTrail(sub, workspace.get().folders).map((folder) => folder.id)).toEqual([
    course.id,
    sub.id,
  ]);
  workspace.update(note.id, { starred: true });
  await workspace.renameDocument(note.id, "Lesson");
  expect(await readFile(join(root, "Course", "Sub", "Lesson.md"), "utf8")).toBe(text);
  await expect(readFile(join(root, "Course", "Sub", "Untitled note.md"))).rejects.toThrow();
  const replacement = await workspace.create("note", sub.id);
  expect(replacement.id).not.toBe(note.id);
  workspace.update(replacement.id, { content: "Different note" });
  await workspace.flush();
  await workspace.renameFolder(course.id, "Studies");
  expect([...(await readFile(join(root, "Studies", "Sub", ".private", "asset.bin")))]).toEqual([
    0, 255, 12, 88,
  ]);
  await workspace.openVault(connection);
  expect(workspace.get().documents.find((doc) => doc.id === note.id)).toMatchObject({
    title: "Lesson",
    content: text,
    starred: true,
    source: { path: "Studies/Sub/Lesson.md" },
  });
  expect(workspace.get().documents.find((doc) => doc.id === replacement.id)?.content).toBe(
    "Different note",
  );
  expect(workspace.get().folders.find((folder) => folder.path === "Studies")?.id).toBe(course.id);
  expect(workspace.get().folders.find((folder) => folder.path === "Studies/Sub")?.id).toBe(sub.id);
  expect((await storage.getRevisions(note.id)).length).toBeGreaterThan(0);
  workspace.update(note.id, { content: text + "Written after rename" });
  await workspace.flush();
  expect(await readFile(join(root, "Studies", "Sub", "Lesson.md"), "utf8")).toContain(
    "Written after rename",
  );
});

it("rejects rename collisions and external edits while leaving both originals intact", async () => {
  const root = join(temporary, "Vault");
  await mkdir(join(root, "A"), { recursive: true });
  await mkdir(join(root, "B"));
  await writeFile(join(root, "A", "First.md"), "First");
  await writeFile(join(root, "A", "Second.md"), "Second");
  const store = createVaultStore(join(temporary, "roots.json"));
  vi.stubGlobal("window", { slateVault: store });
  await workspace.openVault(await store.authorize(root));
  const note = workspace.get().documents.find((doc) => doc.title === "First")!;
  await expect(workspace.renameDocument(note.id, "Second")).rejects.toThrow("already exists");
  const folder = workspace.get().folders.find((folder) => folder.path === "A")!;
  await expect(workspace.renameFolder(folder.id, "B")).rejects.toThrow("already exists");
  await expect(workspace.renameFolder(folder.id, "../Outside")).rejects.toThrow();
  await writeFile(join(root, "A", "First.md"), "External edit");
  await expect(workspace.renameDocument(note.id, "Renamed")).rejects.toThrow(/conflict/i);
  expect(await readFile(join(root, "A", "First.md"), "utf8")).toBe("External edit");
  expect(await readFile(join(root, "A", "Second.md"), "utf8")).toBe("Second");
});

it("can reveal dot-prefixed vault files without deleting them when hidden again", async () => {
  const root = join(temporary, "Vault");
  await mkdir(join(root, ".private", "Sub"), { recursive: true });
  await writeFile(join(root, ".private", "Sub", "Secret.md"), "Hidden descendant");
  await writeFile(join(root, ".hidden.md"), "Hidden file");
  await writeFile(join(root, "Visible.md"), "Visible");
  const store = createVaultStore(join(temporary, "roots.json"));
  vi.stubGlobal("window", { slateVault: store });
  await workspace.openVault(await store.authorize(root));
  expect(workspace.get().documents).toHaveLength(1);
  await workspace.preferences({ showHiddenFiles: true });
  expect(workspace.get().documents).toHaveLength(3);
  await workspace.preferences({ showHiddenFiles: false });
  const data = workspace.get();
  expect(
    visibleWorkspace(data.documents, data.folders, false).documents.map((doc) => doc.title),
  ).toEqual(["Visible"]);
  expect(visibleWorkspace(data.documents, data.folders, false).folders).toHaveLength(0);
  await workspace.openVault(data.vault);
  expect((await storage.readWorkspace()).documents.filter((doc) => doc.source)).toHaveLength(3);
  expect(await readFile(join(root, ".hidden.md"), "utf8")).toBe("Hidden file");
});

it("retains local nested folders and remaps their parents when restoring a backup", async () => {
  const parent = await workspace.addFolder("Projects"),
    child = await workspace.addFolder("Ideas", parent.id);
  const note = await workspace.create("note", child.id);
  await workspace.renameFolder(parent.id, "Research");
  await workspace.renameDocument(note.id, "Concept");
  const backup = await workspace.backup();
  await workspace.restore(backup);
  const restored = workspace.get().folders.find((folder) => folder.name === "Ideas (restored)")!;
  expect(folderTrail(restored, workspace.get().folders).map((folder) => folder.name)).toEqual([
    "Research (restored)",
    "Ideas (restored)",
  ]);
  expect(workspace.get().documents.find((doc) => doc.folderId === restored.id)?.title).toBe(
    "Concept",
  );
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
