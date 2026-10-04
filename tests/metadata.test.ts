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
  tagProperty,
  noteHeadings,
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

it("recognizes padded YAML metadata without changing source offsets or hiding body separators", () => {
  const source =
    "\uFEFF\r\n \t\r\n---\r\ntags: [study, uas]\r\n---\r\n\r\n# Lesson\r\n\r\nBody\r\n---\r\n";
  const metadata = frontmatter(source)!;
  expect(metadataTags(metadata.properties)).toEqual(["study", "uas"]);
  expect(metadata.lines).toBe(5);
  expect(source.slice(metadata.raw.length)).toBe(metadata.body);
  expect(titleHeading(source)?.title).toBe("Lesson");
  expect(previewSource(source)).toBe("# Lesson\r\n\r\nBody\r\n---\r\n");
  expect(frontmatter("A paragraph\n\n---\ntags: [study]\n---")).toBeNull();
});

it("finds exported body tag lists with headings or escaped brackets while excluding examples", () => {
  for (const declaration of [
    "tags: [latihan, uas, study/math]",
    "## tags: \\[latihan, uas, study/math]",
    "### Tags: \\[latihan, uas, study/math\\] ###",
    'tag: ["#latihan", "uas", "study/math"]',
    "tags: [#latihan, #uas, #study/math]",
  ]) {
    expect(tagProperty(declaration)?.tags).toEqual(["latihan", "uas", "study/math"]);
    const doc = makeDocument("note", "Practice", null);
    doc.content = "\n***\n\n" + declaration + "\n\n# Practice\n\nTagged #uas.\n";
    expect(documentTags(doc)).toEqual(["latihan", "uas", "study/math"]);
  }
  for (const text of [
    "Tags are useful",
    "A tags: [study] example",
    "## Tags: useful ideas",
    "    tags: [code]",
    "tags: [unclosed",
  ])
    expect(tagProperty(text)).toBeNull();
  const doc = makeDocument("note", "Examples", null);
  doc.content =
    "```md\ntags: [fenced]\n```\n\n`tags: [inline]`\n\n%% tags: [comment] %%\n\n<!-- tags: [html] -->";
  expect(documentTags(doc)).toEqual([]);
});

it("previews skip long leading comments and preserve indented code", () => {
  const comments = [
    "<!-- " + "hidden\n".repeat(40) + "-->\n",
    "%%\n" + "hidden\n".repeat(40) + "%%\n",
  ];
  expect(previewSource("\n" + comments.join("\n") + "\n# Visible\n\nBody")).toBe(
    "# Visible\n\nBody",
  );
  expect(previewSource("\n\n    tags: [code]\n")).toBe("    tags: [code]\n");
});

it("keeps properties out of the outline while preserving real heading source lines", () => {
  const source =
    "\uFEFF---\n# YAML comment\n---\n\n## tags: \\[uas, study]\n# Lesson\n```md\n## Code\n```\n## Real section\n";
  expect(noteHeadings(source)).toEqual([
    { level: 1, text: "Lesson", line: 6 },
    { level: 2, text: "Real section", line: 10 },
  ]);
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
