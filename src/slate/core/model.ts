export const SCHEMA_VERSION = 1;
export type DocumentKind = "note" | "notebook" | "pdf" | "docx";
export type PaperStyle = "blank" | "lined" | "grid" | "dot";
export type Theme = "light" | "dark" | "system";
export interface Paper {
  style: PaperStyle;
  color: string;
  lineColor: string;
  spacing: number;
}
export interface Point {
  x: number;
  y: number;
  p: number;
  t: number;
}
export interface Stroke {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  width: number;
  points: Point[];
}
export interface Page {
  id: string;
  paper: Paper;
  width: number;
  height: number;
  strokes: Stroke[];
}
export interface SlateDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  folderId: string | null;
  content: string;
  pages: Page[];
  assetId?: string;
  source?: { vaultId: string; path: string };
  vaultId?: string;
  vaultMissing?: boolean;
  flexcil?: { originalId: string; sourceEntry: string; fingerprint: string; limitations: string[] };
  mime?: string;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  revision: number;
  starred: boolean;
  trashedAt: number | null;
  example?: boolean;
  tags: string[];
}
export interface Folder {
  id: string;
  name: string;
  color: string;
  vaultId?: string;
  vaultMissing?: boolean;
  path?: string;
  parentId?: string | null;
  trashedAt?: number | null;
}
export interface Preferences {
  theme: Theme;
  paper: Paper;
  touchInk: boolean;
  editorSize: number;
  workspaceName: string;
  lineNumbers: boolean;
  vim: boolean;
  showHiddenFiles: boolean;
  sidebarWidth: number;
  editorWidth: number;
  editorMarginLeft: number;
  editorMarginRight: number;
  editorAlignment: "left" | "center" | "right";
}
export const DEFAULT_PAPER: Paper = {
  style: "grid",
  color: "#fffefb",
  lineColor: "#dce3e8",
  spacing: 24,
};
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "light",
  paper: DEFAULT_PAPER,
  touchInk: false,
  editorSize: 18,
  workspaceName: "My workspace",
  lineNumbers: false,
  vim: false,
  showHiddenFiles: false,
  sidebarWidth: 228,
  editorWidth: 850,
  editorMarginLeft: 50,
  editorMarginRight: 50,
  editorAlignment: "center",
};
export const PAPER_COLORS = [
  { name: "White", color: "#ffffff", line: "#dfe4eb" },
  { name: "Warm", color: "#fffef6", line: "#e3dfd1" },
  { name: "Mist", color: "#eef4f8", line: "#cddce7" },
  { name: "Sage", color: "#edf3ed", line: "#ccdbcd" },
  { name: "Dark", color: "#253041", line: "#3b4b60" },
];
export const PAPER_STYLES: { id: PaperStyle; name: string }[] = [
  { id: "blank", name: "Blank" },
  { id: "lined", name: "Lined" },
  { id: "grid", name: "Grid" },
  { id: "dot", name: "Dotted" },
];
export const newId = () => crypto.randomUUID();
export function newPage(paper: Paper = DEFAULT_PAPER): Page {
  return { id: newId(), paper: { ...paper }, width: 794, height: 1123, strokes: [] };
}
export function makeDocument(
  kind: DocumentKind,
  title: string,
  folderId: string | null,
  paper: Paper = DEFAULT_PAPER,
): SlateDocument {
  const now = Date.now();
  return {
    id: newId(),
    kind,
    title,
    folderId,
    content: "",
    pages: kind === "notebook" ? [newPage(paper)] : [],
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    revision: 0,
    starred: false,
    trashedAt: null,
    tags: [],
  };
}
export function duplicatePage(page: Page): Page {
  return {
    ...structuredClone(page),
    id: newId(),
    strokes: page.strokes.map((s) => ({ ...structuredClone(s), id: newId() })),
  };
}
export function extractLinks(text: string): string[] {
  const clean = text
    .replace(/(^|\n)(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*/g, "\n")
    .replace(/\x60[^\x60]*\x60/g, "");
  return [
    ...new Set(
      Array.from(clean.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g), (m) =>
        m[1].trim(),
      ),
    ),
  ];
}
export function headings(text: string) {
  let inCode = false;
  return text.split("\n").flatMap((line, i) => {
    if (/^\s*(\x60{3}|~{3})/.test(line)) inCode = !inCode;
    const m = !inCode && /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    return m ? [{ level: m[1].length, text: m[2].replace(/[*_\x60]/g, ""), line: i + 1 }] : [];
  });
}
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
