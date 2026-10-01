export function tableMarkdown(cells: string[][]) {
  const rows = cells.map(
    (row) =>
      "| " +
      row.map((cell) => cell.replace(/\r?\n/g, " ").replace(/\|/g, "\\|")).join(" | ") +
      " |",
  );
  rows.splice(1, 0, "| " + cells[0].map(() => "---").join(" | ") + " |");
  return rows.join("\n");
}
export function tableAt(text: string, position: number) {
  const lines = text.split("\n");
  const index = text.slice(0, position).split("\n").length - 1;
  let start = index,
    end = index;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start--;
  while (end < lines.length - 1 && /^\s*\|/.test(lines[end + 1])) end++;
  if (!/^\s*\|/.test(lines[start]) || !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[start + 1] || ""))
    return null;
  // Keep pipes inside code spans and escaped pipes inside their original cell.
  const cells = lines
    .slice(start, end + 1)
    .filter((_, i) => i !== 1)
    .map((line) => {
      const values: string[] = [];
      let cell = "",
        inCode = false;
      for (let i = 0; i < line.trim().length; i++) {
        const char = line.trim()[i];
        if (char === "\\" && line.trim()[i + 1] === "|") {
          cell += "|";
          i++;
        } else if (char === "`") {
          inCode = !inCode;
          cell += char;
        } else if (char === "|" && !inCode) {
          values.push(cell.trim());
          cell = "";
        } else cell += char;
      }
      if (cell.trim()) values.push(cell.trim());
      return values.slice(1);
    });
  const from = lines.slice(0, start).reduce((sum, line) => sum + line.length + 1, 0);
  return { from, to: from + lines.slice(start, end + 1).join("\n").length, cells };
}
