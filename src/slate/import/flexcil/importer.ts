// Container reader adapted from Slate-kiro. Mapping deliberately targets the Codex data model.
import {
  SeekableZipArchive,
  collectEntry,
  readEntryPrefix,
  type ZipEntry,
  type ZipReaderLimits,
} from "./zip";
import { FlexcilImportCancelledError, FlexcilImportError, type SeekableSource } from "./types";
import {
  makeDocument,
  newPage,
  DEFAULT_PAPER,
  type SlateDocument,
  type Folder,
} from "../../core/model";
import { commitImport, readWorkspace } from "../../core/storage";
import { stableId } from "../../platform/vault";

const MB = 1024 * 1024;
const limits: ZipReaderLimits = {
  maxEntries: 20000,
  maxCentralDirectoryBytes: 16 * MB,
  maxEntryBytes: 256 * MB,
  maxTotalBytes: 16 * 1024 * MB,
  maxCompressionRatio: 100,
};
export const FLEXCIL_LIMITATIONS = [
  "Flexcil handwriting, highlighter and object records are preserved in the original .flx but cannot yet be displayed or edited.",
  "Audio and its stroke synchronization, paper templates and image placement are not decoded.",
  "Recovered PDFs show their original PDF pages; Flexcil page rearrangements and added native pages are not applied.",
];
const source = (blob: Blob): SeekableSource => ({
  size: blob.size,
  read: async (offset, length) =>
    new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
});
const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new FlexcilImportCancelledError();
};
export interface FlexcilReport {
  imported: number;
  skipped: number;
  preserved: number;
  documents: { title: string; pages: number; pdfs: number }[];
  limitations: string[];
}
interface ImportOptions {
  signal?: AbortSignal;
  vaultId?: string;
  onProgress?(message: string): void;
  pdfPages?(blob: Blob): Promise<{ width: number; height: number }[]>;
}
async function spool(entry: ZipEntry, signal?: AbortSignal) {
  if (entry.size > 256 * MB)
    throw new Error(
      "This Flexcil document exceeds the 256 MB per-document limit. Export it separately as PDF from Flexcil.",
    );
  let directory: FileSystemDirectoryHandle | undefined;
  try {
    directory = await navigator.storage?.getDirectory?.();
  } catch {
    /* Bounded fallback for WebViews without OPFS. */
  }
  if (!directory) {
    if (entry.size > 64 * MB)
      throw new Error(
        "This device has no temporary-file storage. Export documents smaller than 64 MB from Flexcil.",
      );
    const chunks: BlobPart[] = [];
    for await (const chunk of entry.stream(signal)) chunks.push(chunk as Uint8Array<ArrayBuffer>);
    return { blob: new Blob(chunks), remove: async () => {} };
  }
  const name = "slate-flexcil-" + crypto.randomUUID() + ".tmp";
  const handle = (await directory.getFileHandle(name, { create: true })) as FileSystemFileHandle & {
    createWritable(): Promise<FileSystemWritableFileStream>;
  };
  const writable = await handle.createWritable();
  try {
    for await (const chunk of entry.stream(signal))
      await writable.write(chunk as Uint8Array<ArrayBuffer>);
    await writable.close();
    return { blob: await handle.getFile(), remove: () => directory!.removeEntry(name) };
  } catch (error) {
    await writable.abort().catch(() => {});
    await directory.removeEntry(name).catch(() => {});
    throw error;
  }
}
function objects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => objects(item, depth + 1));
  return [
    value as Record<string, unknown>,
    ...Object.values(value).flatMap((item) => objects(item, depth + 1)),
  ];
}
export async function importFlexcil(
  file: File,
  options: ImportOptions = {},
): Promise<FlexcilReport> {
  check(options.signal);
  if (/\.flx$/i.test(file.name) && file.size > 256 * MB)
    throw new Error("This Flexcil document exceeds the 256 MB per-document limit.");
  const outer = await SeekableZipArchive.open(source(file), {
    ...limits,
    maxEntryBytes: 8 * 1024 * MB,
  });
  const entries = /\.flx$/i.test(file.name)
    ? [null]
    : outer.entries.filter((entry) => !entry.isDirectory && /\.flx$/i.test(entry.name));
  if (!entries.length) throw new Error("This archive contains no Flexcil .flx documents.");
  const report: FlexcilReport = {
    imported: 0,
    skipped: 0,
    preserved: 0,
    documents: [],
    limitations: FLEXCIL_LIMITATIONS,
  };
  const existing = await readWorkspace();
  for (let index = 0; index < entries.length; index++) {
    check(options.signal);
    const outerEntry = entries[index],
      entryPath = outerEntry?.name || file.name;
    options.onProgress?.(`Flexcil document ${index + 1} of ${entries.length}`);
    let temporary: Awaited<ReturnType<typeof spool>> | undefined;
    try {
      if (outerEntry) temporary = await spool(outerEntry, options.signal);
      const blob = temporary?.blob || file;
      const nested = outerEntry ? await SeekableZipArchive.open(source(blob), limits) : outer;
      const fingerprint = await stableId(
        nested.entries.map((entry) => entry.name + ":" + entry.crc32 + ":" + entry.size).join("\n"),
      );
      if (
        existing.documents.some(
          (doc) =>
            (doc.vaultId || null) === (options.vaultId || null) &&
            doc.flexcil?.sourceEntry === entryPath &&
            doc.flexcil.fingerprint === fingerprint,
        )
      ) {
        report.skipped++;
        continue;
      }
      // The entire nested source remains recoverable, including all undecoded object/audio bytes.
      const originalId =
        "flexcil-original-" +
        (await stableId((options.vaultId || "local") + ":" + entryPath + ":" + fingerprint));
      // Materialize the source before deleting the OPFS spool. A File snapshot can
      // otherwise keep referencing that temporary file even after IndexedDB commits.
      const assets: { id: string; blob: Blob }[] = [
        { id: originalId, blob: new Blob([await blob.arrayBuffer()], { type: "application/zip" }) },
      ];
      const records: Record<string, unknown>[] = [],
        pdfs: { entry: ZipEntry; blob: Blob; id: string }[] = [];
      for (const entry of nested.entries) {
        check(options.signal);
        if (entry.isDirectory) continue;
        const prefix = await readEntryPrefix(entry, 32, options.signal);
        if (new TextDecoder().decode(prefix).startsWith("%PDF-")) {
          const bytes = await collectEntry(entry, 100 * MB, options.signal);
          const id = "flexcil-pdf-" + (await stableId(originalId + ":" + entry.name));
          const pdf = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
          pdfs.push({ entry, blob: pdf, id });
          assets.push({ id, blob: pdf });
        } else if (entry.size <= 4 * MB && /^[\s]*[\[{]/.test(new TextDecoder().decode(prefix))) {
          try {
            records.push(
              ...objects(
                JSON.parse(
                  new TextDecoder().decode(await collectEntry(entry, 4 * MB, options.signal)),
                ),
              ),
            );
          } catch (error) {
            if (error instanceof FlexcilImportCancelledError || error instanceof FlexcilImportError)
              throw error;
          }
        }
      }
      const metadata =
        records.find(
          (record) => typeof record.name === "string" || typeof record.title === "string",
        ) || {};
      const title = String(
        metadata.name ||
          metadata.title ||
          entryPath
            .split("/")
            .pop()!
            .replace(/\.flx$/i, ""),
      ).slice(0, 1000);
      const folderPath = entryPath.split("/").slice(0, -1).join("/");
      const folder: Folder | null = folderPath
        ? {
            id:
              "flexcil-folder-" + (await stableId((options.vaultId || "local") + ":" + folderPath)),
            name: folderPath,
            color: "#385775",
            ...(options.vaultId ? { vaultId: options.vaultId, path: folderPath } : {}),
          }
        : null;
      const documents: SlateDocument[] = [];
      for (let pdfIndex = 0; pdfIndex < Math.max(1, pdfs.length); pdfIndex++) {
        const pdf = pdfs[pdfIndex];
        const doc = makeDocument(
          pdf ? "pdf" : "notebook",
          title + (pdfs.length > 1 ? " · PDF " + (pdfIndex + 1) : ""),
          folder?.id || null,
        );
        doc.id = "flexcil-document-" + (await stableId(originalId + ":" + pdfIndex));
        doc.vaultId = options.vaultId;
        doc.revision = 1;
        doc.flexcil = {
          originalId,
          sourceEntry: entryPath,
          fingerprint,
          limitations: FLEXCIL_LIMITATIONS,
        };
        if (pdf) {
          if (!options.pdfPages) throw new Error("PDF page reading is unavailable.");
          const pages = await options.pdfPages(pdf.blob);
          if (pages.length > 10000) throw new Error("This Flexcil PDF has too many pages.");
          doc.assetId = pdf.id;
          doc.mime = "application/pdf";
          doc.pages = pages.map((page) => ({ ...newPage(), ...page }));
        } else {
          const count =
            typeof metadata.pageCount === "number"
              ? metadata.pageCount
              : records.filter((record) => record.frame && record.attachmentPage).length || 1;
          if (!Number.isSafeInteger(count) || count < 1 || count > 2000)
            throw new Error("Invalid Flexcil notebook page count.");
          doc.pages = Array.from({ length: count }, () =>
            newPage({ ...DEFAULT_PAPER, style: "blank" }),
          );
        }
        documents.push(doc);
      }
      check(options.signal);
      await commitImport(documents, assets, folder ? [folder] : []);
      existing.documents.push(...documents);
      report.imported += documents.length;
      report.preserved += nested.entries.filter((entry) => !entry.isDirectory).length;
      report.documents.push({
        title,
        pages: documents.reduce((sum, doc) => sum + doc.pages.length, 0),
        pdfs: pdfs.length,
      });
    } finally {
      await temporary?.remove();
    }
  }
  return report;
}
