import { Capacitor, registerPlugin } from "@capacitor/core";
const nativeExport = registerPlugin<{
  save(options: { source: string; name: string; mime: string }): Promise<{ saved: boolean }>;
}>("SlateExport");
export function exportFilename(name: string) {
  let safe =
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/[. ]+$/, "")
      .slice(0, 200) || "Slate export";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(safe)) safe = "_" + safe;
  return safe;
}
export async function downloadBlob(
  blob: Blob,
  name: string,
): Promise<"download" | "saved" | "cancelled"> {
  const filename = exportFilename(name);
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pieces: string[] = [];
    for (let i = 0; i < bytes.length; i += 32768)
      pieces.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
    const path = "exports/" + crypto.randomUUID() + "/" + filename;
    await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data: btoa(pieces.join("")),
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    try {
      const result = await nativeExport.save({
        source: uri,
        name: filename,
        mime: blob.type.split(";")[0] || "application/octet-stream",
      });
      return result.saved ? "saved" : "cancelled";
    } finally {
      void Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "download";
}
