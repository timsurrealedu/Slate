import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  placeholder,
  drawSelection,
  highlightSpecialChars,
} from "@codemirror/view";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { autocompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { search, searchKeymap } from "@codemirror/search";
import { livePreview, fileTitle } from "./live-preview";
import { FileTitle } from "./FileTitle";
import { titleHeading, withoutTitleHeading } from "./metadata";
import { renderMarkdown, localImageReferences } from "./render";
import { getAsset } from "../core/storage";
import { vimBindings } from "./vim";
import type { Preferences } from "../core/model";
import { workspace } from "../core/workspace";
import { vault, vaultImagePaths } from "../platform/vault";
export type EditorMode = "live" | "source" | "reading";
export interface MarkdownHandle {
  insert(before: string, after?: string): void;
  goToLine(line: number): void;
  focus(): void;
  replace(from: number, to: number, text: string): void;
  selection(): { from: number; to: number };
}
interface Props {
  id: string;
  content: string;
  title: string;
  mode: EditorMode;
  noteTitles: string[];
  size: number;
  preferences: Preferences;
  sourcePath?: string;
  onChange(text: string): void;
  onLink(name: string): void;
  onTag(name: string): void;
  onProperties(): void;
  onRename(value: string): Promise<void>;
}
export const MarkdownEditor = forwardRef<MarkdownHandle, Props>(
  function MarkdownEditor(props, ref) {
    const mount = useRef<HTMLDivElement>(null),
      reading = useRef<HTMLDivElement>(null),
      view = useRef<EditorView | null>(null),
      current = useRef(props),
      ratio = useRef(0),
      previousMode = useRef(props.mode);
    const compartment = useRef(new Compartment()),
      numberCompartment = useRef(new Compartment()),
      vimCompartment = useRef(new Compartment()),
      titleCompartment = useRef(new Compartment()),
      vimExtension = useRef(vimBindings()),
      assetsRef = useRef(new Map<string, string>());
    const [assets, setAssets] = useState(new Map<string, string>());
    const [keyboardDetected, setKeyboardDetected] = useState(
      !/Android|iPhone|iPad/i.test(navigator.userAgent),
    );
    const [readingCommand, setReadingCommand] = useState<string | null>(null);
    const readingHtml = useMemo(
      () => ({
        __html:
          props.mode === "reading"
            ? renderMarkdown(
                withoutTitleHeading(props.content),
                assets,
                props.preferences.lineNumbers,
              )
            : "",
      }),
      [props.mode, props.content, assets, props.preferences.lineNumbers],
    );
    const pendingG = useRef(false);
    useEffect(() => {
      const detect = (event: KeyboardEvent) => {
        if (
          event.code &&
          event.code !== "Unidentified" &&
          !event.isComposing &&
          !keyboardDetected
        ) {
          if (current.current.preferences.vim)
            view.current?.dispatch({
              effects: vimCompartment.current.reconfigure(Prec.highest(vimExtension.current)),
            });
          setKeyboardDetected(true);
        }
      };
      window.addEventListener("keydown", detect, { capture: true });
      return () => window.removeEventListener("keydown", detect, { capture: true });
    }, [keyboardDetected]);
    current.current = props;
    useImperativeHandle(ref, () => ({
      insert(before, after = "") {
        const v = view.current;
        if (!v) return;
        const range = v.state.selection.main;
        const selected = v.state.doc.sliceString(range.from, range.to);
        v.dispatch({
          changes: { from: range.from, to: range.to, insert: before + selected + after },
          selection: {
            anchor: range.from + before.length,
            head: range.from + before.length + selected.length,
          },
        });
        v.focus();
      },
      goToLine(line) {
        if (current.current.mode === "reading") {
          const nodes = reading.current?.querySelectorAll("h1,h2,h3,h4,h5,h6");
          const headings = current.current.content
            .split("\n")
            .map((text, i) => ({ text, line: i + 1 }))
            .filter((x) => /^#{1,6}\s/.test(x.text));
          const index = headings.findIndex((x) => x.line === line);
          nodes?.[index]?.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
            block: "start",
          });
          return;
        }
        const v = view.current;
        if (!v) return;
        const target = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
        v.dispatch({
          selection: { anchor: target.from },
          effects: EditorView.scrollIntoView(target.from, { y: "start", yMargin: 28 }),
        });
        v.focus();
      },
      focus() {
        view.current?.focus();
      },
      replace(from, to, text) {
        const v = view.current;
        if (!v) return;
        v.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        v.focus();
      },
      selection() {
        const range = view.current?.state.selection.main;
        return { from: range?.from || 0, to: range?.to || 0 };
      },
    }));
    useEffect(() => {
      let disposed = false;
      const urls: string[] = [];
      const ids = [
        ...new Set(Array.from(props.content.matchAll(/attachment:([a-z0-9-]+)/gi), (m) => m[1])),
      ];
      const images = props.sourcePath ? localImageReferences(props.content) : [];
      Promise.all([
        ...ids.map(async (id) => {
          const blob = await getAsset(id);
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return [id, url] as [string, string];
        }),
        ...images.map(async (reference) => {
          for (const path of vaultImagePaths(props.sourcePath!, reference)) {
            try {
              const blob = await vault.asset(path);
              if (!blob) continue;
              const url = URL.createObjectURL(blob);
              urls.push(url);
              return [reference, url] as [string, string];
            } catch {
              /* Missing local images keep their readable placeholder. */
            }
          }
          return null;
        }),
      ]).then((entries) => {
        if (disposed) return;
        const next = new Map(entries.filter((x): x is [string, string] => !!x));
        assetsRef.current = next;
        setAssets(next);
        if (view.current && current.current.mode === "live")
          view.current.dispatch({
            effects: [
              view.current.scrollSnapshot(),
              compartment.current.reconfigure(
                livePreview(
                  (name) => current.current.onLink(name),
                  () => assetsRef.current,
                ),
              ),
            ],
          });
      });
      return () => {
        disposed = true;
        urls.forEach(URL.revokeObjectURL);
      };
    }, [
      props.id,
      props.sourcePath,
      localImageReferences(props.content).join(","),
      Array.from(props.content.matchAll(/attachment:([a-z0-9-]+)/gi), (m) => m[1]).join(","),
    ]);
    useEffect(() => {
      const completion = (context: CompletionContext) => {
        const match = context.matchBefore(/\[\[[^\]\n]*/);
        if (!match) return null;
        return {
          from: match.from + 2,
          options: current.current.noteTitles.map((title) => ({
            label: title,
            type: "text",
            apply: (v: EditorView, _completion: unknown, from: number, to: number) => {
              const suffix =
                v.state.doc.sliceString(to, Math.min(v.state.doc.length, to + 2)) === "]]"
                  ? ""
                  : "]]";
              v.dispatch({ changes: { from, to, insert: title + suffix } });
            },
          })),
          validFor: /^[^\]\n]*$/,
        };
      };
      const v = new EditorView({
        parent: mount.current!,
        state: EditorState.create({
          doc: current.current.content,
          extensions: [
            vimCompartment.current.of([]),
            history(),
            titleCompartment.current.of(
              fileTitle(
                () => current.current.title,
                (value) => current.current.onRename(value),
                current.current.mode === "source",
              ),
            ),
            markdown(),
            syntaxHighlighting(
              HighlightStyle.define([
                { tag: [tags.keyword, tags.link, tags.url], color: "var(--accent)" },
                { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
                { tag: tags.string, color: "var(--success)" },
                { tag: tags.number, color: "var(--accent)" },
                { tag: tags.strong, fontWeight: "600" },
                { tag: tags.emphasis, fontStyle: "italic" },
                { tag: tags.heading, fontWeight: "600" },
                { tag: [tags.meta, tags.punctuation], color: "var(--muted)" },
              ]),
            ),
            drawSelection(),
            highlightSpecialChars(),
            bracketMatching(),
            EditorView.lineWrapping,
            keymap.of([
              ...completionKeymap,
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              indentWithTab,
            ]),
            autocompletion({ interactionDelay: 0, defaultKeymap: false, override: [completion] }),
            search({ top: true }),
            placeholder("Let an idea find its way onto the page…"),
            compartment.current.of(
              current.current.mode === "source"
                ? []
                : livePreview(
                    (name) => current.current.onLink(name),
                    () => assetsRef.current,
                  ),
            ),
            numberCompartment.current.of(
              current.current.preferences.lineNumbers ? lineNumbers() : [],
            ),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) current.current.onChange(update.state.doc.toString());
            }),
            EditorView.contentAttributes.of({
              "aria-label": "Markdown editor",
              tabindex: "0",
              spellcheck: "true",
              autocapitalize: "sentences",
            }),
          ],
        }),
      });
      view.current = v;
      const onScroll = () => {
        if (current.current.mode !== "reading")
          ratio.current =
            v.scrollDOM.scrollTop /
            Math.max(1, v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight);
      };
      v.scrollDOM.addEventListener("scroll", onScroll);
      return () => {
        v.destroy();
        view.current = null;
      };
    }, [props.id]);
    useEffect(() => {
      const v = view.current;
      if (v && v.state.doc.toString() !== props.content)
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: props.content } });
    }, [props.content]);
    useEffect(() => {
      view.current?.dispatch({
        effects: titleCompartment.current.reconfigure(
          fileTitle(
            () => current.current.title,
            (value) => current.current.onRename(value),
            current.current.mode === "source",
          ),
        ),
      });
    }, [props.title, props.mode]);
    useEffect(() => {
      view.current?.dispatch({
        effects: [
          numberCompartment.current.reconfigure(props.preferences.lineNumbers ? lineNumbers() : []),
          vimCompartment.current.reconfigure(
            props.preferences.vim && keyboardDetected ? Prec.highest(vimExtension.current) : [],
          ),
        ],
      });
    }, [props.preferences.lineNumbers, props.preferences.vim, keyboardDetected]);
    useEffect(() => {
      const v = view.current;
      if (!v) return;
      if (props.mode !== "reading")
        v.dispatch({
          effects: compartment.current.reconfigure(
            props.mode === "source"
              ? []
              : livePreview(
                  (name) => current.current.onLink(name),
                  () => assetsRef.current,
                ),
          ),
        });
      requestAnimationFrame(() => {
        if (props.mode === "reading" && reading.current)
          reading.current.scrollTop =
            ratio.current *
            Math.max(1, reading.current.scrollHeight - reading.current.clientHeight);
        else {
          v.requestMeasure();
          if (previousMode.current === "reading")
            v.scrollDOM.scrollTop =
              ratio.current * Math.max(1, v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight);
        }
        previousMode.current = props.mode;
      });
    }, [props.mode]);
    return (
      <div
        className={
          "markdown-surface mode-" +
          props.mode +
          (props.preferences.lineNumbers ? " with-line-numbers" : "")
        }
        style={
          {
            "--editor-size": props.size + "px",
            "--editor-width": props.preferences.editorWidth + "px",
            "--editor-left": props.preferences.editorMarginLeft + "px",
            "--editor-right": props.preferences.editorMarginRight + "px",
            "--editor-start": props.preferences.editorAlignment === "left" ? "0" : "auto",
            "--editor-end": props.preferences.editorAlignment === "right" ? "0" : "auto",
          } as React.CSSProperties
        }
        onClick={(event) => {
          const target = (event.target as HTMLElement).closest(
            "[data-tag], [data-metadata-source]",
          ) as HTMLElement | null;
          if (!target) return;
          event.preventDefault();
          if (target.dataset.tag) props.onTag(target.dataset.tag);
          else props.onProperties();
        }}
      >
        <div
          ref={mount}
          className="editor-mount"
          aria-hidden={props.mode === "reading"}
          style={{ display: props.mode === "reading" ? "none" : undefined }}
        />
        {props.mode === "reading" && (
          <div
            ref={reading}
            className="reading-scroll"
            tabIndex={0}
            aria-label="Markdown reading view"
            onKeyDown={(event) => {
              if (!props.preferences.vim || !keyboardDetected) return;
              const element = event.currentTarget;
              if (event.key === ":") {
                event.preventDefault();
                setReadingCommand("");
                return;
              }
              if (event.key === "g") {
                event.preventDefault();
                if (pendingG.current) {
                  element.scrollTop = 0;
                  pendingG.current = false;
                } else pendingG.current = true;
                return;
              }
              pendingG.current = false;
              const movement = event.ctrlKey
                ? (
                    {
                      d: element.clientHeight / 2,
                      u: -element.clientHeight / 2,
                      f: element.clientHeight,
                      b: -element.clientHeight,
                    } as Record<string, number>
                  )[event.key]
                : ({ j: 40, k: -40 } as Record<string, number>)[event.key];
              if (movement !== undefined) {
                event.preventDefault();
                element.scrollTop += movement;
              }
              if (event.key === "G") {
                event.preventDefault();
                element.scrollTop = element.scrollHeight;
              }
            }}
            onScroll={(e) => {
              const el = e.currentTarget;
              ratio.current = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
            }}
            onClick={(e) => {
              const link = (e.target as HTMLElement).closest("a[data-note]") as HTMLAnchorElement;
              if (link) {
                e.preventDefault();
                props.onLink(link.dataset.note!);
              }
            }}
          >
            <article className="prose reading-prose">
              <FileTitle
                title={titleHeading(props.content)?.title || props.title}
                rename={props.onRename}
              />
              <div dangerouslySetInnerHTML={readingHtml} />
            </article>
          </div>
        )}
        {props.mode === "reading" && readingCommand !== null && (
          <form
            className="reading-vim-command"
            onSubmit={(event) => {
              event.preventDefault();
              const command = readingCommand.trim();
              const match = /^set\s+(number!?|nu!?|nonumber|nonu)$/.exec(command);
              if (match)
                void workspace.preferences({
                  lineNumbers: match[1].endsWith("!")
                    ? !workspace.get().preferences.lineNumbers
                    : !match[1].startsWith("no"),
                });
              else if (/^(w|write)$/.test(command)) void workspace.flush().catch(() => {});
              setReadingCommand(null);
              reading.current?.focus();
            }}
          >
            <label>
              :
              <input
                autoFocus
                aria-label="Vim command"
                value={readingCommand}
                onChange={(event) => setReadingCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setReadingCommand(null);
                    reading.current?.focus();
                  }
                }}
              />
            </label>
          </form>
        )}
      </div>
    );
  },
);
