import { it, expect } from "vitest";
import { makeDocument } from "../src/slate/core/model";
import {
  frontmatter,
  metadataTags,
  previewSource,
  documentTags,
  titleHeading,
  renameHeading,
  withoutTitleHeading,
} from "../src/slate/markdown/metadata";
import { visibleWorkspace } from "../src/slate/core/folders";

it("merges only the leading note heading, preserving metadata, body and source line positions", () => {
  const source =
    "---\r\ntags: [study]\r\n---\r\n\r\n# Original ###\r\n\r\nBody.\r\n\r\n# Another heading\r\n";
  expect(titleHeading(source)?.title).toBe("Original");
  expect(renameHeading(source, "Semester")).toBe(source.replace("Original", "Semester"));
  const body = withoutTitleHeading(source);
  expect(body).toContain("# Another heading");
  expect(body).toContain("tags: [study]");
  expect(body.split("\n").length).toBe(source.split("\n").length);
  expect(titleHeading("Title\n=====\n\nBody")?.title).toBe("Title");
  expect(renameHeading("Title\n=====\n\nBody", "Lecture")).toBe("Lecture\n=====\n\nBody");
  for (const text of [
    "## Section\n\n# Later",
    "Body\n\n# Later",
    "```md\n# Example\n```",
    "    # Code",
  ])
    expect(titleHeading(text)).toBeNull();
});

it("reads Obsidian YAML tag forms and removes complete metadata before generating a preview", () => {
  for (const yaml of [
    "tags: [moc, domain, ideas]",
    "tags:\n  - moc\n  - domain\n  - ideas",
    'tags: "moc, domain ideas"',
  ]) {
    const text = "---\n" + yaml + "\n---\n# Ideas\n\nReal content\n";
    const metadata = frontmatter(text)!;
    expect(metadataTags(metadata.properties)).toEqual(["moc", "domain", "ideas"]);
    expect(previewSource(text)).toBe("# Ideas\n\nReal content\n");
    expect(text.startsWith(metadata.raw)).toBe(true);
  }
  const source =
    "---\n" +
    Array.from({ length: 40 }, (_, index) => "property" + index + ": value").join("\n") +
    "\n---\n# Visible heading";
  expect(previewSource(source)).toBe("# Visible heading");
  expect(frontmatter("# Body\n\n---\nText")).toBeNull();
  expect(frontmatter("---\ntags: [unclosed\n---\n# Body")?.error).toBe(true);
});

it("finds metadata and inline tags while excluding code, links and URLs", () => {
  const doc = makeDocument("note", "Tags", null);
  doc.tags = ["saved"];
  doc.content =
    "---\ntags: [moc, study/math]\n---\n# Heading\nUse #ideas and #study/math and #日本語.\n`#code`\nhttps://site.test/#anchor\n[Link](#target)\n```js\n#hidden\n```\n";
  expect(documentTags(doc)).toEqual(["saved", "moc", "study/math", "ideas", "日本語"]);
});

it("hides an entire local subtree including descendants with ordinary names", () => {
  const folders = [
    { id: "hidden", name: ".private", color: "#385775" },
    { id: "child", name: "Ideas", parentId: "hidden", color: "#385775" },
  ];
  const secret = makeDocument("note", "Thought", "child"),
    visible = makeDocument("note", "Lesson", null);
  expect(visibleWorkspace([secret, visible], folders, false)).toEqual({
    documents: [visible],
    folders: [],
  });
  expect(visibleWorkspace([secret, visible], folders, true).documents).toHaveLength(2);
});

it("detects numeric-prefix, Unicode and nested tags without treating escapes or comments as tags", () => {
  const doc = makeDocument("note", "Tags", null);
  doc.content =
    "# Heading\n\n#2026/study #123_ #123- #cafe\u0301 #日本語 #📚 #123 #123. \\#escaped %% #comment %%\n<!-- #html-comment -->\n``#code `nested` tag``\n";
  expect(documentTags(doc)).toEqual(["2026/study", "123_", "123-", "cafe\u0301", "日本語", "📚"]);
});

it("hides dot names and Windows paths even when separate source paths or null parents exist", () => {
  const folders = [
    { id: "root", name: ".private", path: "Workspace", color: "#385775" },
    { id: "child", name: "Ideas", path: "Workspace\\Ideas", parentId: null, color: "#385775" },
    { id: "nested", name: "Notes", path: "Work\\.cache\\Notes", color: "#385775" },
    { id: "public", name: "Lessons", path: "./Lessons", color: "#385775" },
  ];
  const documents = [
    makeDocument("note", "Secret", "child"),
    makeDocument("note", "Cached", "nested"),
    { ...makeDocument("note", ".draft", null), source: { vaultId: "vault", path: "draft.md" } },
    {
      ...makeDocument("note", "Thought", null),
      source: { vaultId: "vault", path: "Work\\.private\\thought.md" },
    },
    makeDocument("note", "Lesson", "public"),
  ];
  expect(visibleWorkspace(documents, folders, false)).toEqual({
    documents: [documents[4]],
    folders: [folders[3]],
  });
  expect(visibleWorkspace(documents, folders, true)).toEqual({ documents, folders });
});
