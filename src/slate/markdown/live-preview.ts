import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, WidgetType, EditorView, type DecorationSet } from "@codemirror/view";
import { mathHtml, renderMarkdown, metadataHtml, tagHtml } from "./render";
import { frontmatter, inlineTag } from "./metadata";
class PreviewWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly from: number,
    readonly kind: "block" | "inline" = "block",
  ) {
    super();
  }
  eq(other: PreviewWidget) {
    return other.html === this.html && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const dom = document.createElement(this.kind === "block" ? "div" : "span");
    dom.className = this.kind === "block" ? "live-block prose" : "live-math";
    dom.innerHTML = this.html;
    dom.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      if ((e.target as HTMLElement).closest("td,th")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("slate-edit-table", { detail: this.from }));
        return;
      }
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: false });
      view.focus();
    });
    return dom;
  }
  ignoreEvent() {
    return true;
  }
}
class LinkWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly label: string,
    readonly internal: boolean,
    readonly open: (name: string) => void,
  ) {
    super();
  }
  eq(other: LinkWidget) {
    return other.name === this.name && other.label === this.label;
  }
  toDOM() {
    const dom = document.createElement("a");
    dom.textContent = this.label;
    dom.className = this.internal ? "wiki-link" : "live-link";
    dom.href = this.internal ? "#slate-note=" + encodeURIComponent(this.name) : this.name;
    if (!this.internal) {
      dom.target = "_blank";
      dom.rel = "noopener noreferrer";
    }
    dom.addEventListener("mousedown", (e) => e.preventDefault());
    if (this.internal)
      dom.addEventListener("click", (e) => {
        e.preventDefault();
        this.open(this.name);
      });
    return dom;
  }
  ignoreEvent() {
    return true;
  }
}
class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly at: number,
  ) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked && other.at === this.at;
  }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "live-task";
    input.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Complete task");
    input.addEventListener("mousedown", (e) => e.preventDefault());
    input.addEventListener("click", () =>
      view.dispatch({
        changes: { from: this.at, to: this.at + 1, insert: this.checked ? " " : "x" },
      }),
    );
    return input;
  }
  ignoreEvent() {
    return true;
  }
}
class Bullet extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "live-bullet";
    span.textContent = "•";
    return span;
  }
}
export function livePreview(open: (name: string) => void, assets: () => Map<string, string>) {
  const field = StateField.define<DecorationSet>({
    create: build,
    update(value, transaction) {
      return transaction.docChanged || transaction.selection ? build(transaction.state) : value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  function build(state: EditorState): DecorationSet {
    const ranges: Range<Decoration>[] = [];
    const metadata = frontmatter(state.doc.toString());
    if (metadata)
      ranges.push(
        Decoration.replace({
          widget: new PreviewWidget(metadataHtml(metadata.raw), 0),
          block: true,
        }).range(0, metadata.raw.trimEnd().length),
      );
    const first = state.doc.lineAt(state.selection.main.from).number,
      last = state.doc.lineAt(state.selection.main.to).number;
    const active = (a: number, b = a) => a <= last && b >= first;
    let inCode = false;
    for (let number = 1; number <= state.doc.lines; number++) {
      const line = state.doc.line(number),
        text = line.text,
        offset = line.from;
      if (metadata && offset < metadata.raw.trimEnd().length) continue;
      if (/^\s*(\x60{3,}|~{3,})/.test(text)) {
        inCode = !inCode;
        ranges.push(Decoration.line({ class: "cm-code-fence" }).range(offset));
        continue;
      }
      if (inCode) {
        ranges.push(Decoration.line({ class: "cm-code-line" }).range(offset));
        continue;
      }
      if (/^\s*\$\$/.test(text)) {
        let end = number,
          closing = text.indexOf("$$", text.indexOf("$$") + 2);
        if (closing < 0) {
          for (let n = number + 1; n <= state.doc.lines; n++)
            if (/^\s*\$\$\s*$/.test(state.doc.line(n).text)) {
              end = n;
              break;
            }
        }
        if ((end > number || closing >= 0) && !active(number, end)) {
          const to = state.doc.line(end).to;
          const formula = state.doc
            .sliceString(offset, to)
            .replace(/^\s*\$\$\s*/, "")
            .replace(/\s*\$\$\s*$/, "");
          ranges.push(
            Decoration.replace({
              widget: new PreviewWidget(mathHtml(formula, true), offset),
              block: true,
            }).range(offset, to),
          );
          number = end;
          continue;
        }
      }
      if (
        /^\s*\|.+\|/.test(text) &&
        number < state.doc.lines &&
        /^\s*\|?[\s:|-]+\|/.test(state.doc.line(number + 1).text)
      ) {
        let end = number + 1;
        while (end < state.doc.lines && /^\s*\|/.test(state.doc.line(end + 1).text)) end++;
        if (!active(number, end)) {
          const to = state.doc.line(end).to;
          ranges.push(
            Decoration.replace({
              widget: new PreviewWidget(
                renderMarkdown(state.doc.sliceString(offset, to), assets()),
                offset,
              ),
              block: true,
            }).range(offset, to),
          );
          number = end;
          continue;
        }
      }
      const heading = /^(#{1,6})\s+/.exec(text);
      if (heading) {
        ranges.push(
          Decoration.line({ class: "cm-heading cm-heading-" + heading[1].length }).range(offset),
        );
        if (!active(number))
          ranges.push(Decoration.replace({}).range(offset, offset + heading[0].length));
      }
      if (/^>\s?/.test(text)) {
        ranges.push(Decoration.line({ class: "cm-quote-line" }).range(offset));
        if (!active(number))
          ranges.push(
            Decoration.replace({}).range(offset, offset + (text.startsWith("> ") ? 2 : 1)),
          );
      }
      if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(text)) {
        ranges.push(Decoration.line({ class: "cm-task-line" }).range(offset));
        const m = /^(\s*[-*+]\s+\[)([ xX])(\]\s)/.exec(text)!;
        if (!active(number))
          ranges.push(
            Decoration.replace({
              widget: new TaskWidget(m[2].toLowerCase() === "x", offset + m[1].length),
            }).range(offset, offset + m[0].length),
          );
      } else {
        const bullet = /^(\s*)[-*+]\s/.exec(text);
        if (bullet && !active(number))
          ranges.push(
            Decoration.replace({ widget: new Bullet() }).range(
              offset + bullet[1].length,
              offset + bullet[0].length,
            ),
          );
      }
      if (active(number)) continue;
      const occupied: [number, number][] = [];
      const free = (a: number, b: number) => !occupied.some(([from, to]) => a < to && b > from);
      const replacement = (
        expression: RegExp,
        callback: (match: RegExpMatchArray, from: number, to: number) => void,
      ) => {
        for (const m of text.matchAll(expression)) {
          const from = m.index!,
            to = from + m[0].length;
          if (!free(from, to)) continue;
          occupied.push([from, to]);
          callback(m, offset + from, offset + to);
        }
      };
      replacement(/!\[([^\]]*)\]\(([^)]+)\)|!\[\[[^\]\n]+\]\]/g, (m, from, to) =>
        ranges.push(
          Decoration.replace({
            widget: new PreviewWidget(renderMarkdown(m[0], assets()), from, "inline"),
          }).range(from, to),
        ),
      );
      replacement(/\[\[([^\]\n]+)\]\]/g, (m, from, to) => {
        const [name, label] = m[1].split("|");
        ranges.push(
          Decoration.replace({
            widget: new LinkWidget(name.trim(), label || name, true, open),
          }).range(from, to),
        );
      });
      replacement(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (m, from, to) =>
        ranges.push(
          Decoration.replace({ widget: new LinkWidget(m[2], m[1], false, open) }).range(from, to),
        ),
      );
      replacement(/\$(?!\$)([^$]+?)\$(?!\$)/g, (m, from, to) =>
        ranges.push(
          Decoration.replace({ widget: new PreviewWidget(mathHtml(m[1]), from, "inline") }).range(
            from,
            to,
          ),
        ),
      );
      replacement(/\x60([^\x60]+)\x60/g, (m, from, to) => {
        ranges.push(
          Decoration.replace({}).range(from, from + 1),
          Decoration.mark({ class: "cm-inline-code" }).range(from + 1, to - 1),
          Decoration.replace({}).range(to - 1, to),
        );
      });
      replacement(inlineTag, (match, from, to) =>
        ranges.push(
          Decoration.replace({
            widget: new PreviewWidget(tagHtml(match[1]), from, "inline"),
          }).range(from, to),
        ),
      );
      replacement(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, from, to) => {
        ranges.push(
          Decoration.replace({}).range(from, from + 2),
          Decoration.mark({ class: "cm-strong" }).range(from + 2, to - 2),
          Decoration.replace({}).range(to - 2, to),
        );
      });
      replacement(/\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g, (m, from, to) => {
        ranges.push(
          Decoration.replace({}).range(from, from + 1),
          Decoration.mark({ class: "cm-em" }).range(from + 1, to - 1),
          Decoration.replace({}).range(to - 1, to),
        );
      });
      replacement(/~~([^~]+)~~/g, (m, from, to) => {
        ranges.push(
          Decoration.replace({}).range(from, from + 2),
          Decoration.mark({ class: "cm-strike" }).range(from + 2, to - 2),
          Decoration.replace({}).range(to - 2, to),
        );
      });
    }
    return Decoration.set(ranges, true);
  }
  return field;
}
