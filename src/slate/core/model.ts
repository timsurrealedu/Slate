export const SCHEMA_VERSION = 1;
export type DocumentKind = "note" | "notebook" | "pdf" | "docx";
export type PaperStyle = "blank" | "lined" | "grid" | "dot" | "cornell" | "legal" | "vertical";
export type Theme = "light" | "dark" | "system";
export interface Paper {
  style: PaperStyle;
  color: string;
  lineColor: string;
  spacing: number;
  // Flexcil templates use its fixed template geometry instead of `spacing`.
  template?: "flexcil";
  columns?: boolean;
}
export interface Point {
  x: number;
  y: number;
  p: number;
  t: number;
}
// Flexcil pen engines; absent on strokes written by Slate's earlier renderers.
export type Brush = "ballpoint" | "fountain" | "calligraphy" | "pencil" | "highlighter" | "marker";
export interface PenSlot {
  brush: Brush;
  color: string;
  width: number;
  opacity: number;
  straight: boolean;
  // Flexcil's per-pen stroke stabilization, 0-1.
  smooth: number;
}
export interface Stroke {
  id: string;
  tool: "pen" | "highlighter";
  color: string;
  width: number;
  points: Point[];
  rendering?: "direct" | "smooth" | "precise";
  pressureSensitive?: boolean;
  brush?: Brush;
  opacity?: number;
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
  penPressure: boolean;
  inkColor: string;
  inkWidth: number;
  inkToolbarPosition: { x: number; y: number } | null;
  // Flexcil docks its writing toolbar above the page or floats it over the paper.
  inkToolbarMode: "docked" | "floating";
  notebookTitlebar: boolean;
  pens: PenSlot[];
  activePen: number;
  eraserWidth: number;
  notebookPages: boolean;
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
// Flexcil's DefaultPens.json, in Flexcil width units (pens 0.1-20, highlighters 1-40).
export const DEFAULT_PENS: PenSlot[] = [
  { brush: "ballpoint", color: "#000000", width: 1, opacity: 1, straight: false, smooth: 0.2 },
  { brush: "ballpoint", color: "#e02020", width: 1, opacity: 1, straight: false, smooth: 0.2 },
  { brush: "ballpoint", color: "#171717", width: 3, opacity: 1, straight: false, smooth: 0.2 },
  { brush: "highlighter", color: "#ffed2a", width: 10, opacity: 0.47, straight: false, smooth: 0 },
  { brush: "marker", color: "#00da58", width: 10, opacity: 0.48, straight: false, smooth: 0 },
  { brush: "highlighter", color: "#e02020", width: 15, opacity: 0.76, straight: true, smooth: 0 },
  { brush: "marker", color: "#32c5ff", width: 15, opacity: 0.5, straight: true, smooth: 0 },
  { brush: "calligraphy", color: "#333333", width: 1.5, opacity: 1, straight: false, smooth: 0.2 },
  { brush: "fountain", color: "#0069db", width: 1.5, opacity: 1, straight: false, smooth: 0.2 },
  { brush: "pencil", color: "#3a3a3a", width: 2, opacity: 1, straight: false, smooth: 0.2 },
];
export const isHighlighter = (brush: Brush) => brush === "highlighter" || brush === "marker";
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "light",
  paper: DEFAULT_PAPER,
  touchInk: false,
  penPressure: true,
  inkColor: "#385775",
  inkWidth: 1.2,
  inkToolbarPosition: null,
  inkToolbarMode: "docked",
  notebookTitlebar: true,
  pens: DEFAULT_PENS,
  activePen: 0,
  eraserWidth: 10,
  notebookPages: true,
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
  { name: "White", color: "#ffffff", line: "#d3d3d4" },
  { name: "Yellow", color: "#fef4c3", line: "#b4a36e" },
  { name: "Dark", color: "#2d2d2f", line: "#5d5955" },
];
// Flexcil's Standard template set.
export const PAPER_STYLES: { id: PaperStyle; name: string; columns?: boolean }[] = [
  { id: "blank", name: "Plain" },
  { id: "lined", name: "Lined" },
  { id: "grid", name: "Graph" },
  { id: "dot", name: "Dotted" },
  { id: "cornell", name: "Cornell" },
  { id: "legal", name: "Legal" },
  { id: "vertical", name: "Vertical" },
  { id: "blank", name: "2 Column", columns: true },
  { id: "lined", name: "2 Column Lined", columns: true },
  { id: "grid", name: "2 Column Graph", columns: true },
  { id: "dot", name: "2 Column Dotted", columns: true },
];
// Flexcil's standard portrait page is 768 × 1024.
export const pageHeight = (paper: Paper) => (paper.template === "flexcil" ? 1059 : 1123);
export const newId = () => crypto.randomUUID();
export function newPage(paper: Paper = DEFAULT_PAPER): Page {
  return { id: newId(), paper: { ...paper }, width: 794, height: pageHeight(paper), strokes: [] };
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
