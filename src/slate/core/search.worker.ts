interface IndexedDoc {
  id: string;
  title: string;
  content: string;
  trashedAt: number | null;
  updatedAt: number;
}
const index = new Map<string, IndexedDoc & { haystack: string; normalizedTitle: string }>();
const normalize = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
self.onmessage = (event) => {
  const { type, documents, query, requestId } = event.data;
  if (type === "index") {
    for (const id of event.data.removed || []) index.delete(id);
    for (const d of documents as IndexedDoc[])
      index.set(d.id, {
        ...d,
        haystack: normalize(d.title + "\n" + d.content),
        normalizedTitle: normalize(d.title),
      });
    return;
  }
  if (type !== "search") return;
  const value = normalize(query.trim()),
    words = value.split(/\s+/);
  const matches = [];
  for (const d of index.values()) {
    if (d.trashedAt || !words.every((w) => d.haystack.includes(w))) continue;
    const titleMatch = d.normalizedTitle.includes(value);
    const location = normalize(d.content).indexOf(words[0]);
    const excerpt =
      location >= 0
        ? d.content
            .slice(Math.max(0, location - 35), location + 100)
            .replace(/[#*_\x60<>]/g, " ")
            .replace(/\s+/g, " ")
        : "";
    matches.push({
      id: d.id,
      excerpt,
      score: titleMatch ? (d.normalizedTitle.startsWith(value) ? 30 : 20) : 10,
      updatedAt: d.updatedAt,
    });
  }
  matches.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  self.postMessage({ requestId, results: matches.slice(0, 30) });
};
