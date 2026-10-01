import { vim, Vim } from "@replit/codemirror-vim";
import { workspace } from "../core/workspace";

// Vim's built-in :set handler accepts custom boolean options, including ! toggles.
Vim.defineOption("slatelines", false, "boolean", ["number", "nu"], (value) => {
  if (typeof value === "boolean") void workspace.preferences({ lineNumbers: value });
  return workspace.get().preferences.lineNumbers;
});
Vim.defineEx("write", "w", () => {
  void workspace.flush().catch(() => {});
});
export const vimBindings = () => vim({ status: true });
