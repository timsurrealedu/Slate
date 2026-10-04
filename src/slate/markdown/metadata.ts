import { load, JSON_SCHEMA } from "js-yaml";
import { headings, type SlateDocument } from "../core/model";

export function frontmatter(source: string) {
  const match =
    /^\uFEFF?(?:[ \t]*\r?\n)*---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(
      source,
    );
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

// Some exported notes keep their tag list as a Markdown heading, with escaped brackets.
export function tagProperty(source: string) {
  const match =
    /^ {0,3}(?:#{1,6}[ \t]+)?tags?:[ \t]*\\?\[([^\r\n]*?)\\?\][ \t]*(?:#+[ \t]*)?(?:\r?\n|$)/i.exec(
      source,
    );
  if (!match) return null;
  try {
    const values = load("[" + match[1].replace(/(^|,[ \t]*)#/g, "$1") + "]", {
      schema: JSON_SCHEMA,
    });
    const tags = metadataTags({ tags: values });
    if (tags.length || !match[1].trim()) return { raw: match[0], tags };
  } catch {
    // Keep malformed declarations readable and leave the original source intact.
  }
  return null;
}

export function noteHeadings(source: string) {
  const lines = source.split("\n");
  const metadataLines = frontmatter(source)?.lines || 0;
  return headings(source.replace(/^\uFEFF/, "")).filter(
    (heading) => heading.line > metadataLines && !tagProperty(lines[heading.line - 1]),
  );
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
      ...body.split(/\r?\n/).flatMap((line) => tagProperty(line)?.tags || []),
      ...Array.from(body.matchAll(inlineTag), (match) => match[1]),
    ]),
  ];
}

export function previewSource(source: string) {
  // Strip complete metadata before truncating so a long property block cannot consume the preview.
  let body = (frontmatter(source)?.body ?? source).replace(/^\uFEFF?(?:[ \t]*\r?\n)*/, "");
  // Complete leading comments can be longer than the thumbnail's source budget.
  const comment = /^ {0,3}(?:%%[\s\S]*?%%|<!--[\s\S]*?-->)[ \t]*(?:\r?\n|$)(?:[ \t]*\r?\n)*/;
  while (comment.test(body)) body = body.replace(comment, "");
  return body.split("\n").slice(0, 30).join("\n");
}
