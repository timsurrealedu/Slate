import type { Folder, SlateDocument } from "./model";

export const folderName = (folder: Folder) => (folder.path || folder.name).split("/").pop()!;
export const hiddenPath = (path: string) => path.split("/").some((part) => part.startsWith("."));

export function parentFolder(folder: Folder, folders: Folder[]): Folder | undefined {
  if (folder.parentId !== undefined) return folders.find((item) => item.id === folder.parentId);
  const path = (folder.path || folder.name).split("/").slice(0, -1).join("/");
  return path
    ? folders.find((item) => (item.path || item.name) === path && item.vaultId === folder.vaultId)
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
    .filter((folder) => (parentFolder(folder, folders)?.id || null) === parentId)
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
        folderTrail(folder, folders).some((item) => hiddenPath(item.path || item.name)),
      )
      .map((folder) => folder.id),
  );
  return {
    folders: folders.filter((folder) => !hiddenFolders.has(folder.id)),
    documents: documents.filter(
      (doc) =>
        !hiddenPath(doc.source?.path || doc.title) &&
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
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("Choose a name without slashes, reserved characters, or a trailing dot.");
  if (name.length > 200) throw new Error("Use a name shorter than 201 characters.");
  return name;
}
