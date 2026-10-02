const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function safePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\\0:]/.test(value) ||
    value.startsWith("/") ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid vault path.");
  return value;
}
function createVaultStore(configPath) {
  let roots = {};
  async function load() {
    try {
      roots = JSON.parse(await fs.readFile(configPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  async function authorize(root) {
    root = await fs.realpath(root);
    const id = crypto.createHash("sha256").update(root).digest("hex").slice(0, 32);
    roots[id] = root;
    await fs.writeFile(configPath, JSON.stringify(roots), { mode: 0o600 });
    return { id, name: path.basename(root) };
  }
  async function target(id, relative, create = false) {
    safePath(relative);
    if (!Object.hasOwn(roots, id)) throw new Error("Reopen this vault to allow folder access.");
    const root = await fs.realpath(roots[id]),
      parts = relative.split("/");
    let current = root;
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      if (!current.startsWith(root + path.sep)) throw new Error("Invalid vault path.");
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error("Vault symbolic links are not followed.");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (create && index < parts.length - 1) await fs.mkdir(current);
      }
    }
    return current;
  }
  async function list({ id, showHidden = false }) {
    if (!Object.hasOwn(roots, id)) throw new Error("Reopen this vault to allow folder access.");
    const paths = [];
    async function walk(directory, prefix, depth) {
      if (depth > 32) throw new Error("Too many vault folder levels.");
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if ((!showHidden && entry.name.startsWith(".")) || entry.isSymbolicLink()) continue;
        if (paths.length >= 20000)
          throw new Error("Open a vault containing fewer than 20,000 notes.");
        const relative = prefix + entry.name;
        if (entry.isDirectory()) {
          paths.push(relative + "/");
          await walk(path.join(directory, entry.name), relative + "/", depth + 1);
        } else if (entry.isFile() && /\.(md|markdown|txt|slate-notebook)$/i.test(entry.name))
          paths.push(relative);
      }
    }
    await walk(await fs.realpath(roots[id]), "", 0);
    return { paths };
  }
  async function read({ id, path: relative }) {
    const file = await target(id, relative);
    const info = await fs.stat(file);
    if (!info.isFile() || info.size > 20 * 1024 * 1024)
      throw new Error("Choose a vault note smaller than 20 MB.");
    return { text: await fs.readFile(file, "utf8") };
  }
  async function write({ id, path: relative, text, expected }) {
    if (
      !/\.(md|markdown|txt|slate-notebook)$/i.test(relative) ||
      typeof text !== "string" ||
      Buffer.byteLength(text) > 20 * 1024 * 1024 ||
      !(typeof expected === "string" || expected === null)
    )
      throw new Error("Invalid vault write.");
    const file = await target(id, relative, true);
    let actual = null;
    try {
      actual = (await read({ id, path: relative })).text;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (actual !== expected) throw new Error("Vault conflict: the original file changed.");
    const temporary = path.join(path.dirname(file), ".slate-" + crypto.randomUUID() + ".tmp");
    try {
      const mode = actual === null ? 0o600 : (await fs.stat(file)).mode;
      await fs.writeFile(temporary, text, { flag: "wx", mode });
      const handle = await fs.open(temporary, "r+");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, file);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }
  async function asset({ id, path: relative }) {
    const mime = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".avif": "image/avif",
      ".bmp": "image/bmp",
    }[path.extname(relative).toLowerCase()];
    if (!mime) throw new Error("Choose a local image.");
    const file = await target(id, relative),
      info = await fs.stat(file);
    if (!info.isFile() || info.size > 20 * 1024 * 1024)
      throw new Error("Choose an image smaller than 20 MB.");
    return { base64: (await fs.readFile(file)).toString("base64"), mime };
  }
  async function mkdir({ id, path: relative }) {
    const directory = await target(id, relative);
    await fs.mkdir(directory);
  }
  async function rename({ id, path: relative, nextPath, directory, expected }) {
    safePath(nextPath);
    if (relative === nextPath) return;
    if (directory && nextPath.startsWith(relative + "/"))
      throw new Error("A folder cannot be moved inside itself.");
    const source = await target(id, relative),
      destination = await target(id, nextPath);
    const info = await fs.lstat(source);
    if (info.isDirectory() !== directory || (!directory && !info.isFile()))
      throw new Error("The vault item changed. Refresh the vault.");
    const originalName = path.basename(source),
      nextName = path.basename(destination);
    const sameParent = path.dirname(source) === path.dirname(destination);
    const entries = await fs.readdir(path.dirname(destination));
    if (
      entries.some(
        (name) =>
          (!sameParent || name !== originalName) &&
          name.toLocaleLowerCase() === nextName.toLocaleLowerCase(),
      )
    )
      throw new Error("A file or folder with that name already exists here.");
    if (
      !directory &&
      (typeof expected !== "string" || (await read({ id, path: relative })).text !== expected)
    )
      throw new Error("Vault conflict: the original file changed.");
    await fs.rename(source, destination);
  }
  return { load, authorize, list, read, write, asset, mkdir, rename };
}
module.exports = { createVaultStore, safePath };
