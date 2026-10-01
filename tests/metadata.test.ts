import { it, expect } from "vitest";
import { makeDocument } from "../src/slate/core/model";
import {
  frontmatter,
  metadataTags,
  previewSource,
  documentTags,
} from "../src/slate/markdown/metadata";
import { visibleWorkspace } from "../src/slate/core/folders";

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
