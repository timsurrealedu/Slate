import { useState } from "react";
import { Link2, ListTree, Info, ArrowUpRight, X } from "lucide-react";
import { extractLinks, wordCount, type SlateDocument } from "../core/model";
import { noteHeadings } from "../markdown/metadata";
import { KindIcon, IconButton, kindName } from "./shared";
export function ContextPanel({
  doc,
  documents,
  onOpen,
  onLink,
  onHeading,
  onClose,
}: {
  doc: SlateDocument;
  documents: SlateDocument[];
  onOpen(doc: SlateDocument): void;
  onLink(name: string): void;
  onHeading(line: number): void;
  onClose(): void;
}) {
  const [tab, setTab] = useState("outline");
  const links = documents.filter(
    (d) =>
      d.id !== doc.id &&
      !d.trashedAt &&
      extractLinks(d.content).some((link) => link.toLowerCase() === doc.title.toLowerCase()),
  );
  const outline = doc.kind === "note" ? noteHeadings(doc.content) : [];
  return (
    <aside className="context-panel" aria-label="Document context">
      <div className="context-tabs">
        <button className={tab === "outline" ? "active" : ""} onClick={() => setTab("outline")}>
          <ListTree size={15} />
          Outline
        </button>
        <button className={tab === "links" ? "active" : ""} onClick={() => setTab("links")}>
          <Link2 size={15} />
          Links{links.length > 0 && <span>{links.length}</span>}
        </button>
        <IconButton label="Close document context" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="context-content">
        {tab === "outline" ? (
          outline.length ? (
            <nav className="document-outline" aria-label="Document outline">
              {outline.map((h) => (
                <button
                  key={h.line}
                  style={{ paddingLeft: 16 + Math.max(0, h.level - 1) * 12 }}
                  onClick={() => onHeading(h.line)}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          ) : (
            <div className="context-empty">
              <ListTree size={25} />
              <p>
                {doc.kind === "note"
                  ? "Your headings will appear here."
                  : "Turn a page, follow an idea."}
              </p>
              <span>
                {doc.kind === "note"
                  ? "Use # to give your note a little structure."
                  : "Use the page panel to navigate this document."}
              </span>
            </div>
          )
        ) : (
          <>
            <h3>
              Linked mentions <span>{links.length}</span>
            </h3>
            {links.length ? (
              links.map((link) => (
                <button className="backlink" key={link.id} onClick={() => onOpen(link)}>
                  <span>
                    <KindIcon kind={link.kind} size={16} />
                    <strong>{link.title}</strong>
                    <ArrowUpRight size={14} />
                  </span>
                  <p>
                    {link.content
                      .replace(/[#*_\x60]/g, "")
                      .split("\n")
                      .filter(Boolean)
                      .slice(1, 3)
                      .join(" ")
                      .slice(0, 130)}
                  </p>
                </button>
              ))
            ) : (
              <div className="context-empty">
                <Link2 size={25} />
                <p>Ideas are better connected.</p>
                <span>
                  Link to this note with [[{doc.title}]] and its backlinks will appear here.
                </span>
              </div>
            )}
            <h3 className="outgoing-heading">Links from this note</h3>
            {extractLinks(doc.content).map((name) => (
              <button className="outgoing-link" key={name} onClick={() => onLink(name)}>
                <Link2 size={14} />
                {name}
              </button>
            ))}
          </>
        )}
      </div>
      <div className="document-details">
        <span>
          <Info size={14} />
          About this document
        </span>
        <dl>
          <div>
            <dt>Type</dt>
            <dd>{kindName(doc.kind)}</dd>
          </div>
          {doc.kind === "note" && (
            <div>
              <dt>Length</dt>
              <dd>{wordCount(doc.content)} words</dd>
            </div>
          )}
          {doc.pages.length > 0 && (
            <div>
              <dt>Pages</dt>
              <dd>{doc.pages.length}</dd>
            </div>
          )}
          <div>
            <dt>Created</dt>
            <dd>
              {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
                doc.createdAt,
              )}
            </dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>On this device</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
