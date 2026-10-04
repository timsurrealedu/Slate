import type { Folder, SlateDocument } from "./model";

export const folderName = (folder: Folder) => (folder.path || folder.name).split("/").pop()!;
const pathParts = (path: string) => path.split(/[\\/]/);
export const hiddenPath = (path: string) =>
  pathParts(path).some((part) => part.startsWith(".") && part !== "." && part !== "..");

export function parentFolder(folder: Folder, folders: Folder[]): Folder | undefined {
  if (folder.parentId) return folders.find((item) => item.id === folder.parentId);
  const path = pathParts(folder.path || folder.name)
    .slice(0, -1)
    .join("/");
  return path
    ? folders.find(
        (item) =>
          pathParts(item.path || item.name).join("/") === path && item.vaultId === folder.vaultId,
      )
    : undefined;
}

export function folderTrail(folder: Folder | undefined, folders: Folder[]): Folder[] {
  const trail: Folder[] = [],
    seen = new Set<string>();
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    trail.unshift(folder);
    folder = parentFolder(folder, folders);
  }
  return trail;
}

export function folderChildren(folders: Folder[], parentId: string | null = null) {
  return folders
    .filter(
      (folder) => !folder.trashedAt && (parentFolder(folder, folders)?.id || null) === parentId,
    )
    .sort((a, b) => folderName(a).localeCompare(folderName(b), undefined, { numeric: true }));
}

export function visibleWorkspace(
  documents: SlateDocument[],
  folders: Folder[],
  showHidden: boolean,
) {
  if (showHidden) return { documents, folders };
  const hiddenFolders = new Set(
    folders
      .filter((folder) =>
        folderTrail(folder, folders).some(
          (item) => hiddenPath(item.name) || hiddenPath(item.path || ""),
        ),
      )
      .map((folder) => folder.id),
  );
  return {
    folders: folders.filter((folder) => !hiddenFolders.has(folder.id)),
    documents: documents.filter(
      (doc) =>
        !hiddenPath(doc.title) &&
        !hiddenPath(doc.source?.path || "") &&
        (!doc.folderId || !hiddenFolders.has(doc.folderId)),
    ),
  };
}

export function itemName(value: string) {
  const name = value.trim();
  if (
    !name ||
    name === "." ||
    name === ".." ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in file names.
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("Choose a name without slashes, reserved characters, or a trailing dot.");
  if (name.length > 200) throw new Error("Use a name shorter than 201 characters.");
  return name;
}
