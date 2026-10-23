import { beforeEach, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { makeDocument, DEFAULT_PREFERENCES } from "../src/slate/core/model";
import {
  clearDatabaseForTests,
  initializeWorkspace,
  readWorkspace,
  saveDocument,
  getRevisions,
  putImportedDocument,
  getAsset,
  exportWorkspace,
  parseBackup,
  restoreBackup,
  SaveConflict,
} from "../src/slate/core/storage";
beforeEach(async () => {
  await clearDatabaseForTests();
});
describe("local data integrity", () => {
  it("retains all ink renderers and pressure settings through backup recovery", async () => {
    const doc = makeDocument("notebook", "Pen input", null);
    const points = [
      { x: 20, y: 30, p: 0.3, t: 4 },
      { x: 45, y: 80, p: 0.8, t: 9 },
    ];
    doc.pages[0].strokes = [
      { id: "direct", rendering: "direct", tool: "pen", color: "#aa6467", width: 0.6, points },
      { id: "legacy", tool: "pen", color: "#385775", width: 1.2, points },
      {
        id: "smooth-pressure",
        rendering: "smooth",
        pressureSensitive: true,
        tool: "pen",
        color: "#385775",
        width: 1.2,
        points,
      },
      {
        id: "smooth-fixed",
        rendering: "smooth",
        pressureSensitive: false,
        tool: "pen",
        color: "#385775",
        width: 1.2,
        points,
      },
      {
        id: "precise-pressure",
        rendering: "precise",
        pressureSensitive: true,
        tool: "pen",
        color: "#385775",
        width: 1.2,
        points,
      },
      {
        id: "precise-fixed",
        rendering: "precise",
        pressureSensitive: false,
        tool: "pen",
        color: "#385775",
        width: 1.2,
        points,
      },
    ];
    const preferences = {
      ...DEFAULT_PREFERENCES,
      inkColor: "#aa6467",
      inkWidth: 0.6,
      penPressure: false,
      photoImport: { sensitivity: 0.7, colors: false, paper: "auto" as const },
      inkToolbarPosition: { x: 0.2, y: 0.3 },
    };
    const parsed = await parseBackup(await exportWorkspace([doc], [], preferences));
    expect(parsed.manifest.documents[0].pages[0].strokes).toEqual(doc.pages[0].strokes);
    expect(parsed.manifest.preferences).toEqual(preferences);
    const restored = await restoreBackup(parsed);
    expect(restored.documents[0].pages[0].strokes.map((s) => s.rendering)).toEqual([
      "direct",
      undefined,
      "smooth",
      "smooth",
      "precise",
      "precise",
    ]);
    expect(restored.documents[0].pages[0].strokes).toEqual(doc.pages[0].strokes);
    expect(restored.documents[0].pages[0].strokes[0].points).toEqual(points);
  });
  it("opens older backups with pressure enabled and preserves their saved ink", async () => {
    const doc = makeDocument("notebook", "Older handwriting", null);
    doc.pages[0].strokes = [
      {
        id: "old",
        rendering: "direct",
        tool: "pen",
        color: "#385775",
        width: 1.2,
        points: [
          { x: 20, y: 30, p: 0, t: 4 },
          { x: 45, y: 80, p: 0.8, t: 9 },
        ],
      },
    ];
    const backup = await exportWorkspace([doc], [], DEFAULT_PREFERENCES);
    const files = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    delete manifest.preferences.penPressure;
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", files["manifest.json"]));
    files["manifest.sha256"] = strToU8(
      Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    const parsed = await parseBackup(new Blob([zipSync(files)]));
    expect(parsed.manifest.preferences.penPressure).toBe(true);
    expect(parsed.manifest.documents[0].pages[0].strokes).toEqual(doc.pages[0].strokes);
  });
  it("saves atomically and retains an earlier recoverable version", async () => {
    const doc = makeDocument("note", "Physics", null);
    doc.content = "Original lecture";
    await putImportedDocument(doc);
    expect(await saveDocument({ ...doc, content: "Revised lecture" }, 1)).toBe(2);
    expect((await readWorkspace()).documents[0].content).toBe("Revised lecture");
    expect((await getRevisions(doc.id))[0].document.content).toBe("Original lecture");
  });
  it("refuses a stale save without replacing the other window's work", async () => {
    const doc = makeDocument("note", "Physics", null);
    await putImportedDocument(doc);
    await saveDocument({ ...doc, content: "Other window" }, 1);
    await expect(saveDocument({ ...doc, content: "Stale local edit" }, 1)).rejects.toBeInstanceOf(
      SaveConflict,
    );
    expect((await readWorkspace()).documents[0].content).toBe("Other window");
  });
  it("initializes a workspace once when two windows open together", async () => {
    const one = makeDocument("note", "First", null),
      two = makeDocument("note", "Second", null);
    await Promise.all([initializeWorkspace([one], []), initializeWorkspace([two], [])]);
    const data = await readWorkspace();
    expect(data.initialized).toBe(true);
    expect(data.documents).toHaveLength(1);
  });
  it("backs up original binary files and restores fresh copies with working attachments", async () => {
    const doc = makeDocument("note", "Diagrams", null);
    const id = crypto.randomUUID();
    doc.assetId = id;
    doc.content = "![diagram](attachment:" + id + ")";
    await putImportedDocument(doc, {
      id,
      blob: new Blob(["original-binary"], { type: "image/png" }),
    });
    const original = (await readWorkspace()).documents;
    const backup = await exportWorkspace(original, [], DEFAULT_PREFERENCES);
    const parsed = await parseBackup(backup);
    const result = await restoreBackup(parsed);
    expect(result.documents[0].id).not.toBe(doc.id);
    expect(result.documents[0].assetId).not.toBe(id);
    expect(result.documents[0].content).toContain("attachment:" + result.documents[0].assetId);
    expect(await (await getAsset(result.documents[0].assetId!))?.text()).toBe("original-binary");
    expect((await readWorkspace()).documents).toHaveLength(2);
  });
  it("rejects damaged source files before changing the workspace", async () => {
    const doc = makeDocument("pdf", "Reading", null),
      id = crypto.randomUUID();
    doc.assetId = id;
    await putImportedDocument(doc, {
      id,
      blob: new Blob(["pdf-data"], { type: "application/pdf" }),
    });
    const backup = await exportWorkspace(
      (await readWorkspace()).documents,
      [],
      DEFAULT_PREFERENCES,
    );
    const files = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    files["assets/" + id] = strToU8("damaged-pdf");
    await expect(parseBackup(new Blob([zipSync(files)]))).rejects.toThrow("missing or damaged");
    expect((await readWorkspace()).documents).toHaveLength(1);
  });
  it("rejects future schemas even when the checksum is valid", async () => {
    const backup = await exportWorkspace([], [], DEFAULT_PREFERENCES),
      files = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    manifest.schema = 42;
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", files["manifest.json"]));
    files["manifest.sha256"] = strToU8(
      Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    await expect(parseBackup(new Blob([zipSync(files)]))).rejects.toThrow("unsupported format");
    expect((await readWorkspace()).documents).toHaveLength(0);
  });
  it("limits recovery storage while keeping the current notebook intact", async () => {
    const doc = makeDocument("notebook", "Working", null);
    await putImportedDocument(doc);
    for (let revision = 1; revision <= 30; revision++)
      await saveDocument({ ...doc, title: "Working " + revision }, revision);
    expect((await getRevisions(doc.id)).length).toBeLessThanOrEqual(20);
    expect((await readWorkspace()).documents[0].title).toBe("Working 30");
  });
});
