import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";

export default async function createFixtures() {
  mkdirSync("artifacts/fixtures", { recursive: true });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([595, 842]);
  p.drawText("Lecture 07: Conservation of energy", { x: 60, y: 760, size: 22, font });
  p.drawText("The total energy of an isolated system remains constant.", {
    x: 60,
    y: 710,
    size: 13,
    font,
  });
  p.drawText("E = kinetic energy + potential energy", { x: 60, y: 670, size: 14, font });
  const p2 = pdf.addPage([595, 842]);
  p2.setRotation(degrees(90));
  p2.drawText("A rotated page for annotation", { x: 70, y: 700, size: 18, font });
  writeFileSync("artifacts/fixtures/Energy lecture.pdf", await pdf.save());
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const docx = zipSync({
    "[Content_Types].xml": strToU8(
      xml +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      xml +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      xml +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Reading seminar</w:t></w:r></w:p><w:p><w:r><w:t>A dependable reading experience starts with preserving the original file.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Discuss the argument, assumptions, and evidence.</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  writeFileSync("artifacts/fixtures/Reading seminar.docx", docx);
  copyFileSync("public/icons/slate-192.png", "artifacts/fixtures/sample.png");
  console.log("Created original PDF and DOCX fixtures.");
}

if (import.meta.main) await createFixtures();
