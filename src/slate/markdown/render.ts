import { Marked, type TokensList } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import { frontmatter, metadataTags, inlineTag } from "./metadata";
const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const mathHtml = (text: string, display = false) =>
  katex.renderToString(text, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    output: "htmlAndMathml",
  });
const markdown = new Marked({ gfm: true, breaks: false });
export function markdownBlocks(source: string) {
  let from = 0;
  const tokens = markdown.lexer(source);
  return tokens.map((token) => {
    const block = {
      from,
      to: from + token.raw.length,
      type: token.type,
      source: token.raw,
      links: tokens.links,
    };
    from = block.to;
    return block;
  });
}
export const tagHtml = (tag: string) =>
  '<a class="tag-link" href="#slate-tag=' +
  encodeURIComponent(tag) +
  '" data-tag="' +
  escape(tag) +
  '" aria-label="Show notes tagged ' +
  escape(tag) +
  '">#' +
  escape(tag) +
  "</a>";
export function metadataHtml(source: string) {
  const metadata = frontmatter(source);
  if (!metadata) return "";
  const tags = metadataTags(metadata.properties);
  return (
    '<div class="note-metadata" aria-label="Note properties">' +
    (tags.length ? '<div class="note-tags">' + tags.map(tagHtml).join("") + "</div>" : "") +
    '<button class="metadata-source" data-metadata-source="true" type="button">' +
    (metadata.error ? "Review note properties" : "Edit properties") +
    "</button></div>"
  );
}
export function localImageReferences(source: string) {
  return [
    ...new Set([
      ...Array.from(
        source.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g),
        (match) => match[1] || match[2],
      ),
      ...Array.from(source.matchAll(/!\[\[([^\]\n]+)\]\]/g), (match) => match[1].split("|")[0]),
    ]),
  ];
}
markdown.use({
  renderer: {
    html({ text }) {
      return text;
    },
    blockquote({ text, tokens }) {
      const callout = /^\[!([\w-]+)\]([+-])?[ \t]*([^\n]*)(?:\n|$)/.exec(text);
      if (!callout) return "<blockquote>" + this.parser.parse(tokens) + "</blockquote>";
      const title = escape(
        callout[3].trim() || callout[1].charAt(0).toUpperCase() + callout[1].slice(1),
      );
      const body = this.parser.parse(markdown.lexer(text.slice(callout[0].length)));
      return callout[2]
        ? `<details class="prose-callout"${callout[2] === "+" ? " open" : ""}><summary>${title}</summary>${body}</details>`
        : `<aside class="prose-callout"><strong class="callout-title">${title}</strong>${body}</aside>`;
    },
  },
  extensions: [
    {
      name: "obsidianBlockComment",
      level: "block",
      tokenizer(src) {
        const match = /^ {0,3}%%[\s\S]*?%%(?:[ \t]*\n)?/.exec(src);
        if (match) return { type: "obsidianBlockComment", raw: match[0] };
      },
      renderer: () => "",
    },
    {
      name: "obsidianComment",
      level: "inline",
      start: (src) => src.indexOf("%%"),
      tokenizer(src) {
        const match = /^%%[\s\S]*?%%/.exec(src);
        if (match) return { type: "obsidianComment", raw: match[0] };
      },
      renderer: () => "",
    },
    {
      name: "highlight",
      level: "inline",
      start: (src) => src.indexOf("=="),
      tokenizer(src) {
        const match = /^==(?=\S)([^\n]+?)==/.exec(src);
        if (match)
          return { type: "highlight", raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
      },
      renderer(token) {
        return "<mark>" + this.parser.parseInline(token.tokens || []) + "</mark>";
      },
    },
    {
      name: "tag",
      level: "inline",
      start: (src) => src.search(inlineTag),
      tokenizer(src) {
        const match = new RegExp(inlineTag.source, "u").exec(src);
        if (match?.index === 0) return { type: "tag", raw: match[0], tag: match[1] };
      },
      renderer: (token) => tagHtml(token.tag),
    },
    {
      name: "wiki",
      level: "inline",
      start(src) {
        return src.indexOf("[[");
      },
      tokenizer(src) {
        const m = /^\[\[([^\]\n]+)\]\]/.exec(src);
        if (m) {
          const [name, label] = m[1].split("|");
          return { type: "wiki", raw: m[0], name: name.trim(), label: label || name };
        }
      },
      renderer(token) {
        return (
          '<a class="wiki-link" href="#slate-note=' +
          encodeURIComponent(token.name) +
          '" data-note="' +
          escape(token.name) +
          '">' +
          escape(token.label) +
          "</a>"
        );
      },
    },
    {
      name: "displayMath",
      level: "block",
      start(src) {
        return src.indexOf("$$");
      },
      tokenizer(src) {
        const m = /^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src);
        if (m) return { type: "displayMath", raw: m[0], text: m[1] };
      },
      renderer(token) {
        return '<div class="math-block">' + mathHtml(token.text, true) + "</div>";
      },
    },
    {
      name: "inlineMath",
      level: "inline",
      start(src) {
        return src.indexOf("$");
      },
      tokenizer(src) {
        const m = /^\$(?!\$)([^\n$]+?)\$(?!\$)/.exec(src);
        if (m) return { type: "inlineMath", raw: m[0], text: m[1] };
      },
      renderer(token) {
        return mathHtml(token.text);
      },
    },
  ],
});
export function renderMarkdown(
  source: string,
  assets?: Map<string, string>,
  numbered = false,
  links?: TokensList["links"],
) {
  if (typeof window === "undefined") return "";
  const metadata = frontmatter(source);
  let text = (metadata?.body ?? source).replace(/!\[\[([^\]\n]+)\]\]/g, (_raw, inner: string) => {
    const [path, label] = inner.split("|");
    const alt = label && /^\d+(?:x\d+)?$/.test(label) ? path + "|" + label : label || path;
    return "![" + alt.replace(/[[\]]/g, "") + "](<" + path.replace(/[<>]/g, "") + ">)";
  });
  if (assets) text = text.replace(/attachment:([a-z0-9-]+)/gi, (raw, id) => assets.get(id) || raw);
  let html: string;
  if (numbered) {
    const tokens = markdown.lexer(text);
    let line = 1 + (metadata?.lines || 0);
    html = tokens
      .map((token) => {
        const start = line;
        line += (token.raw.match(/\n/g) || []).length;
        if (token.type === "space") return "";
        const block = Object.assign([token], { links: tokens.links });
        return (
          '<div class="reading-block markdown-block" data-line-number="' +
          start +
          '" data-source-line="' +
          start +
          '">' +
          markdown.parser(block) +
          "</div>"
        );
      })
      .join("");
  } else {
    const definitions = links
      ? Object.entries(links)
          .map(
            ([name, link]) =>
              `[${name}]: <${link.href}>${link.title ? " " + JSON.stringify(link.title) : ""}`,
          )
          .join("\n")
      : "";
    const tokens = markdown.lexer(text + (definitions ? "\n\n" + definitions : ""));
    html = tokens
      .map((token) => {
        if (token.type === "space") return "";
        const rendered = markdown.parser(Object.assign([token], { links: tokens.links }));
        return rendered ? '<div class="markdown-block">' + rendered + "</div>" : "";
      })
      .join("");
  }
  html = metadataHtml(source) + html;
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-note"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ["style", "iframe", "object", "embed", "base", "link", "meta", "form"],
    ALLOW_DATA_ATTR: true,
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  template.content.querySelectorAll("img").forEach((img) => {
    const dimensions = /^(.*)\|(\d+)(?:x(\d+))?$/.exec(img.alt);
    if (dimensions) {
      img.alt = dimensions[1];
      img.width = Math.min(8192, Math.max(1, Number(dimensions[2])));
      if (dimensions[3]) img.height = Math.min(8192, Math.max(1, Number(dimensions[3])));
    }
    const local = assets?.get(img.getAttribute("src") || "");
    if (local) img.setAttribute("src", local);
    if (!/^(blob:|data:image\/(?:png|jpe?g|webp|gif);)/i.test(img.getAttribute("src") || "")) {
      const placeholder = document.createElement("span");
      placeholder.className = "image-unavailable";
      placeholder.textContent = img.alt
        ? "Image: " + img.alt + " (import it to view locally)"
        : "Import this image to view it locally";
      img.replaceWith(placeholder);
    }
    img.removeAttribute("srcset");
  });
  template.content
    .querySelectorAll("input[type=checkbox]")
    .forEach((input) =>
      input.setAttribute(
        "aria-label",
        input.closest("li")?.textContent?.trim().slice(0, 220) || "Task item",
      ),
    );
  template.content.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (
      !a.dataset.note &&
      !a.dataset.tag &&
      !/^[a-z][a-z\d+.-]*:|^\/\//i.test(href) &&
      /\.md(?:#|$)|^#[^#]/i.test(href)
    ) {
      a.dataset.note = href;
      a.classList.add("wiki-link");
    }
    if (!a.dataset.note && !a.dataset.tag) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  });
  return template.innerHTML;
}
export function sanitizeDocx(html: string) {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });
  return clean;
}
