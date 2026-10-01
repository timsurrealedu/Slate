import { Marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
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
      return escape(text);
    },
  },
  extensions: [
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
export function renderMarkdown(source: string, assets?: Map<string, string>, numbered = false) {
  if (typeof window === "undefined") return "";
  let text = source.replace(/!\[\[([^\]\n]+)\]\]/g, (_raw, inner: string) => {
    const [path, label] = inner.split("|");
    return "![" + (label || path).replace(/[\[\]]/g, "") + "](<" + path.replace(/[<>]/g, "") + ">)";
  });
  if (assets) text = text.replace(/attachment:([a-z0-9-]+)/gi, (raw, id) => assets.get(id) || raw);
  let html: string;
  if (numbered) {
    const tokens = markdown.lexer(text);
    let line = 1;
    html = tokens
      .map((token) => {
        const start = line;
        line += (token.raw.match(/\n/g) || []).length;
        if (token.type === "space") return "";
        const block = Object.assign([token], { links: tokens.links });
        return (
          '<div class="reading-block" data-line-number="' +
          start +
          '" data-source-line="' +
          start +
          '">' +
          markdown.parser(block) +
          "</div>"
        );
      })
      .join("");
  } else html = markdown.parse(text) as string;
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ["data-note"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: ["style", "iframe", "object", "embed"],
    ALLOW_DATA_ATTR: true,
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  template.content.querySelectorAll("img").forEach((img) => {
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
    if (!a.dataset.note) {
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
