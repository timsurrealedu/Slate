import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { ready, documents, latest, draw } from "./helpers";

test("Flexcil OPFS import preserves exact original bytes and later Slate ink on reimport", async ({
  page,
}) => {
  await ready(page);
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const nested = zipSync(
    {
      metadata: strToU8(JSON.stringify({ name: "Migration fixture" })),
      original: await pdf.save(),
      handwriting: new Uint8Array([11, 21, 99, 0]),
    },
    { level: 0 },
  );
  const file = {
    name: "fixture.flex",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "/Course/fixture.flx": nested }, { level: 0 })),
  };
  await page.getByLabel("Import local documents").setInputFiles(file);
  await expect(page.locator(".flexcil-report")).toContainText("1 documents imported");
  await expect(page.locator(".flexcil-report")).toContainText("cannot yet be displayed or edited");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Open Migration fixture", { exact: true }).first().click();
  await expect(page.locator(".pdf-canvas:visible")).toBeVisible();
  await draw(page);
  await expect.poll(async () => (await latest(page))?.pages[0].strokes.length).toBe(1);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export original Flexcil", exact: true }).click();
  const downloaded = await downloading;
  expect(await readFile((await downloaded.path())!)).toEqual(Buffer.from(nested));
  await page.getByLabel("Import local documents").setInputFiles(file);
  await expect(page.locator(".flexcil-report")).toContainText(
    "0 documents imported · 1 already present",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect((await documents(page)).filter((doc) => doc.flexcil)).toHaveLength(1);
  expect((await latest(page)).pages[0].strokes).toHaveLength(1);
});

test("Optional real Flexcil archive structural smoke runs in an isolated browser profile", async ({
  page,
}) => {
  test.skip(
    !process.env.SLATE_FLEXCIL_FIXTURE,
    "Set SLATE_FLEXCIL_FIXTURE to a local read-only backup.",
  );
  test.setTimeout(180000);
  await ready(page);
  await page.getByLabel("Import local documents").setInputFiles(process.env.SLATE_FLEXCIL_FIXTURE!);
  await expect(page.locator(".flexcil-report")).toBeVisible({ timeout: 120000 });
  const imported = (await documents(page)).filter((doc) => doc.flexcil);
  expect(imported.length).toBeGreaterThan(0);
  console.log(
    JSON.stringify({
      flexcilDocuments: imported.length,
      pages: imported.reduce((sum, doc) => sum + doc.pages.length, 0),
      pdfs: imported.filter((doc) => doc.kind === "pdf").length,
    }),
  );
});
