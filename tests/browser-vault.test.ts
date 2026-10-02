import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { vault } from "../src/slate/platform/vault";
import * as storage from "../src/slate/core/storage";

class FileHandle {
  kind = "file" as const;
  constructor(
    readonly name: string,
    public bytes: Uint8Array = new Uint8Array(),
  ) {}
  async getFile() {
    return new File([new Uint8Array(this.bytes)], this.name);
  }
  async createWritable() {
    let bytes = this.bytes;
    return {
      write: async (file: File) => {
        bytes = new Uint8Array(await file.arrayBuffer());
      },
      close: async () => {
        this.bytes = bytes;
        onWrite?.(this);
      },
      abort: async () => {},
    };
  }
}
class DirectoryHandle {
  kind = "directory" as const;
  entries = new Map<string, FileHandle | DirectoryHandle>();
  constructor(readonly name: string) {}
  async *values() {
    yield* this.entries.values();
  }
  async queryPermission() {
    return "granted";
  }
  async requestPermission() {
    return "granted";
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.entries.has(name) && options?.create)
      this.entries.set(name, new DirectoryHandle(name));
    const entry = this.entries.get(name);
    if (!entry) throw new DOMException("Not found", "NotFoundError");
    if (!(entry instanceof DirectoryHandle)) throw new Error("Not a directory");
    return entry;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.entries.has(name) && options?.create) this.entries.set(name, new FileHandle(name));
    const entry = this.entries.get(name);
    if (!entry) throw new DOMException("Not found", "NotFoundError");
    if (!(entry instanceof FileHandle)) throw new Error("Not a file");
    return entry;
  }
  async removeEntry(name: string) {
    const entry = this.entries.get(name);
    if (entry instanceof DirectoryHandle && entry.entries.size)
      throw new Error("Directory is not empty");
    this.entries.delete(name);
  }
}
let root: DirectoryHandle, onWrite: ((file: FileHandle) => void) | undefined;
beforeEach(async () => {
  await storage.clearDatabaseForTests();
  const writeMeta = storage.writeMeta;
  vi.spyOn(storage, "writeMeta").mockImplementation(async (key, value) => {
    // Real directory handles are structured-cloneable; the in-memory test handles are not.
    if (key !== "active-vault" && key !== "vault-connections") await writeMeta(key, value);
  });
  root = new DirectoryHandle("Vault");
  onWrite = undefined;
  await vault.connect({ id: "browser-test", name: "Vault", handle: root as any });
});
afterEach(() => {
  vi.restoreAllMocks();
});

it("browser rename verifies nested binary and hidden entries before removing originals", async () => {
  const original = await root.getDirectoryHandle("Course", { create: true });
  const hidden = await original.getDirectoryHandle(".assets", { create: true });
  const image = await hidden.getFileHandle("scan.bin", { create: true });
  image.bytes = new Uint8Array([0, 128, 255]);
  await original.getDirectoryHandle("Empty", { create: true });
  const note = await original.getFileHandle("Note.md", { create: true });
  note.bytes = new TextEncoder().encode("# Untouched");
  await vault.rename("Course", "Studies", true);
  expect(root.entries.has("Course")).toBe(false);
  const renamed = await root.getDirectoryHandle("Studies");
  expect((await renamed.getDirectoryHandle("Empty")).entries.size).toBe(0);
  expect([
    ...(await (await renamed.getDirectoryHandle(".assets")).getFileHandle("scan.bin")).bytes,
  ]).toEqual([0, 128, 255]);
  expect(await (await renamed.getFileHandle("Note.md")).getFile().then((file) => file.text())).toBe(
    "# Untouched",
  );
});

it("browser folder moves verify hidden binary files across different parents", async () => {
  const original = await root.getDirectoryHandle("Course", { create: true });
  const target = await root.getDirectoryHandle("Archive", { create: true });
  const hidden = await original.getDirectoryHandle(".assets", { create: true });
  const file = await hidden.getFileHandle("scan.bin", { create: true });
  file.bytes = new Uint8Array([0, 128, 255]);
  await vault.rename("Course", "Archive/Course", true);
  expect(root.entries.has("Course")).toBe(false);
  const moved = await (await target.getDirectoryHandle("Course")).getDirectoryHandle(".assets");
  expect([...(await moved.getFileHandle("scan.bin")).bytes]).toEqual([0, 128, 255]);
});

it("browser rename aborts without removing original files when another file arrives during copying", async () => {
  const original = await root.getDirectoryHandle("Course", { create: true });
  const note = await original.getFileHandle("Note.md", { create: true });
  note.bytes = new TextEncoder().encode("Original");
  onWrite = () =>
    original.entries.set(
      "Concurrent.md",
      new FileHandle("Concurrent.md", new TextEncoder().encode("New external note")),
    );
  await expect(vault.rename("Course", "Studies", true)).rejects.toThrow("retained");
  expect(
    await (await original.getFileHandle("Note.md")).getFile().then((file) => file.text()),
  ).toBe("Original");
  expect(original.entries.has("Concurrent.md")).toBe(true);
  expect(root.entries.has("Studies")).toBe(true);
});

it("browser file rename rejects collisions and preserves source bytes", async () => {
  const note = await root.getFileHandle("Note.md", { create: true });
  note.bytes = new TextEncoder().encode("Original");
  await root.getFileHandle("Taken.md", { create: true });
  await storage.writeMeta("vault-original:note", "Original");
  await expect(vault.rename("Note.md", "Taken.md", false, "note")).rejects.toThrow(
    "already exists",
  );
  expect(await note.getFile().then((file) => file.text())).toBe("Original");
  await vault.rename("Note.md", "Lesson.md", false, "note");
  expect(root.entries.has("Note.md")).toBe(false);
  expect(await (await root.getFileHandle("Lesson.md")).getFile().then((file) => file.text())).toBe(
    "Original",
  );
});
