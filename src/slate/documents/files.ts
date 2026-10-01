import { makeDocument, newId, newPage, type SlateDocument } from "../core/model";
import { workspace } from "../core/workspace";
import { getAsset } from "../core/storage";
import { pageCanvas } from "../ink/render";
import { downloadBlob } from "../platform/export";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export async function loadPdf(blob: Blob) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  return pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    cMapUrl: "/pdf-assets/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdf-assets/standard_fonts/",
    wasmUrl: "/pdf-assets/wasm/",
  }).promise;
}
export async function importFile(file: File, folderId: string | null): Promise<SlateDocument> {
  if (file.size > 100 * 1024 * 1024) throw new Error("Choose a file smaller than 100 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, "");
  if (extension === "md" || extension === "markdown" || extension === "txt") {
    const doc = makeDocument("note", title, folderId);
    doc.content = await file.text();
    return workspace.importDocument(doc);
  }
  if (extension !== "pdf" && extension !== "docx")
    throw new Error("Slate can import Markdown, TXT, PDF and DOCX files.");
  const doc = makeDocument(extension, title, folderId);
  const assetId = newId();
  doc.assetId = assetId;
  doc.mime = file.type;
  if (extension === "pdf") {
    const pdf = await loadPdf(file);
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const viewport = p.getViewport({ scale: 1 });
        doc.pages.push({ ...newPage(), width: viewport.width, height: viewport.height });
        const text = await p.getTextContent();
        doc.content += text.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
      }
    } finally {
      await pdf.destroy();
    }
  } else {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    doc.content = result.value;
  }
  return workspace.importDocument(doc, { id: assetId, blob: file });
}
export async function exportDocument(doc: SlateDocument, annotated = false) {
  await workspace.flush().catch(() => {});
  if (doc.kind === "note") {
    return await downloadBlob(
      new Blob([doc.content], { type: "text/markdown" }),
      doc.title + ".md",
    );
  }
  if ((doc.kind === "pdf" || doc.kind === "docx") && !annotated) {
    const source = doc.assetId && (await getAsset(doc.assetId));
    if (!source)
      throw new Error("The original file is unavailable. Restore it from a workspace backup.");
    return await downloadBlob(source, doc.title + "." + doc.kind);
  }
  const { PDFDocument, degrees } = await import("pdf-lib");
  let pdf;
  if (doc.kind === "pdf") {
    const source = doc.assetId && (await getAsset(doc.assetId));
    if (!source) throw new Error("The original PDF is unavailable.");
    pdf = await PDFDocument.load(await source.arrayBuffer());
  } else pdf = await PDFDocument.create();
  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const target = doc.kind === "pdf" ? pdf.getPage(i) : pdf.addPage([page.width, page.height]);
    const canvas = pageCanvas(page, doc.kind === "pdf", 1.5);
    const image = await pdf.embedPng(canvas.toDataURL("image/png"));
    const box = target.getCropBox();
    const rotation = ((target.getRotation().angle % 360) + 360) % 360;
    const placement =
      rotation === 90
        ? {
            x: box.x + box.width,
            y: box.y,
            width: box.height,
            height: box.width,
            rotate: degrees(90),
          }
        : rotation === 180
          ? {
              x: box.x + box.width,
              y: box.y + box.height,
              width: box.width,
              height: box.height,
              rotate: degrees(180),
            }
          : rotation === 270
            ? {
                x: box.x,
                y: box.y + box.height,
                width: box.height,
                height: box.width,
                rotate: degrees(270),
              }
            : { x: box.x, y: box.y, width: box.width, height: box.height };
    target.drawImage(image, placement);
  }
  const bytes = await pdf.save();
  return await downloadBlob(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    doc.title + (doc.kind === "pdf" ? " (annotated)" : "") + ".pdf",
  );
}
