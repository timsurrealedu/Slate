import { load, JSON_SCHEMA } from "js-yaml";
import type { SlateDocument } from "../core/model";

export function frontmatter(source: string) {
  const match = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(source);
  if (!match || match.index !== 0) return null;
  let properties: Record<string, unknown> = {},
    error = false;
  try {
    if (match[1].length > 65536) throw new Error("Metadata exceeds 64 KB.");
    const parsed: unknown = load(match[1], { schema: JSON_SCHEMA });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      properties = parsed as Record<string, unknown>;
    else if (parsed !== undefined && parsed !== null) error = true;
  } catch {
    error = true;
  }
  return {
    properties,
    error,
    raw: match[0],
    body: source.slice(match[0].length),
    lines: (match[0].match(/\n/g) || []).length,
  };
}

export function metadataTags(properties: Record<string, unknown>) {
  const value = properties.tags ?? properties.tag;
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : [];
  return [
    ...new Set(
      values
        .slice(0, 100)
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ];
}

export const inlineTag = /(?<![\p{L}\p{N}_/#])#([\p{L}\p{N}_\/-]*[\p{L}_][\p{L}\p{N}_\/-]*)/gu;
export function documentTags(doc: SlateDocument) {
  const metadata = frontmatter(doc.content);
  const body = (metadata?.body ?? doc.content)
    .replace(/(^|\n)(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*/g, "\n")
    .replace(/\x60[^\x60]*\x60/g, "")
    .replace(/!?\[[^\]]*\]\([^)]*\)|\[\[[^\]]*\]\]|https?:\/\/\S+/g, "");
  return [
    ...new Set([
      ...doc.tags,
      ...metadataTags(metadata?.properties || {}),
      ...Array.from(body.matchAll(inlineTag), (match) => match[1]),
    ]),
  ];
}

export function previewSource(source: string) {
  // Strip complete metadata before truncating so a long property block cannot consume the preview.
  return (frontmatter(source)?.body ?? source).trimStart().split("\n").slice(0, 30).join("\n");
}
