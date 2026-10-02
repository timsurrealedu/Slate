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

export function titleHeading(source: string) {
  const offset = frontmatter(source)?.raw.length || (source.startsWith("\uFEFF") ? 1 : 0);
  const body = source.slice(offset);
  const blanks = /^(?:[ \t]*\r?\n)*/.exec(body)![0].length;
  const from = offset + blanks;
  const text = source.slice(from);
  const atx = /^( {0,3}#[ \t]+)([^\r\n]*?)(?:[ \t]+#+[ \t]*)?(?=\r?\n|$)/.exec(text);
  const setext = !atx && /^( {0,3})([^\r\n]+)\r?\n {0,3}=+[ \t]*(?=\r?\n|$)/.exec(text);
  const match = atx || setext;
  if (!match) return null;
  return {
    from,
    to: from + match[0].length,
    textFrom: from + match[1].length,
    textTo: from + match[1].length + match[2].length,
    title: match[2].trim(),
  };
}

export function renameHeading(source: string, title: string) {
  const heading = titleHeading(source);
  return heading
    ? source.slice(0, heading.textFrom) + title + source.slice(heading.textTo)
    : source;
}

export function withoutTitleHeading(source: string) {
  const heading = titleHeading(source);
  return heading
    ? source.slice(0, heading.from) +
        source.slice(heading.from, heading.to).replace(/[^\r\n]/g, "") +
        source.slice(heading.to)
    : source;
}

export const inlineTag =
  /(?<![\p{L}\p{M}\p{N}_/#\\])#((?=[\p{L}\p{M}\p{N}\p{Extended_Pictographic}_/\-\p{Join_Control}]*[\p{L}\p{M}\p{Extended_Pictographic}_/\-\p{Join_Control}])[\p{L}\p{M}\p{N}\p{Extended_Pictographic}_/\-\p{Join_Control}]+)/gu;
export function documentTags(doc: SlateDocument) {
  const metadata = frontmatter(doc.content);
  const body = (metadata?.body ?? doc.content)
    .replace(/%%[\s\S]*?%%|<!--[\s\S]*?-->/g, "")
    .replace(/(^|\n)(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*/g, "\n")
    .replace(/(\x60+)[\s\S]*?\1/g, "")
    .replace(/\\#[^\s]+|<[^>]*>/g, "")
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
