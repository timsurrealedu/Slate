const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require("electron");
const { createVaultStore } = require("./vault.cjs");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
app.setName("Slate");
if (process.env.SLATE_TEST_USER_DATA) app.setPath("userData", process.env.SLATE_TEST_USER_DATA);
else app.setPath("userData", path.join(app.getPath("appData"), "Slate"));
const PORT = process.env.SLATE_TEST_USER_DATA ? 47422 : 47421;
const ORIGIN = "http://127.0.0.1:" + PORT;
const root = app.isPackaged
  ? path.join(__dirname, "www")
  : path.resolve(__dirname, "../../dist/standalone");
let window,
  server,
  closing = false,
  readyToClose = false;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};
function external(url) {
  try {
    const parsed = new URL(url);
    if (/^https?:$/.test(parsed.protocol)) void shell.openExternal(parsed.href);
  } catch {}
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      const vaultStore = createVaultStore(path.join(app.getPath("userData"), "vault-folders.json"));
      await vaultStore.load();
      ipcMain.handle("slate-vault", async (event, action, options) => {
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          new URL(event.senderFrame.url).origin !== ORIGIN
        )
          throw new Error("Folder access denied.");
        if (action === "open") {
          const result = await dialog.showOpenDialog(window, {
            title: "Open Slate or Obsidian vault",
            properties: ["openDirectory"],
          });
          if (result.canceled || !result.filePaths[0]) return { cancelled: true };
          return vaultStore.authorize(result.filePaths[0]);
        }
        if (!["list", "read", "write", "asset", "mkdir", "rename"].includes(action))
          throw new Error("Unknown folder action.");
        return vaultStore[action](options);
      });
      server = http.createServer((req, res) => {
        if (!["GET", "HEAD"].includes(req.method)) {
          res.writeHead(405, { Allow: "GET, HEAD" });
          return res.end();
        }
        let target;
        try {
          const pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
          target = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
        } catch {
          res.writeHead(400);
          return res.end();
        }
        if (!target.startsWith(root + path.sep)) {
          res.writeHead(403);
          return res.end();
        }
        fs.stat(target, (error, info) => {
          if (error || !info.isFile()) {
            res.writeHead(404);
            return res.end();
          }
          res.writeHead(200, {
            "Content-Type": mime[path.extname(target)] || "application/octet-stream",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Cross-Origin-Resource-Policy": "same-origin",
          });
          if (req.method === "HEAD") return res.end();
          fs.createReadStream(target)
            .on("error", () => res.destroy())
            .pipe(res);
        });
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(PORT, "127.0.0.1", resolve);
      });
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 360,
        minHeight: 560,
        title: "Slate",
        backgroundColor: "#f7f8fa",
        icon: path.join(root, "icons/slate-512.png"),
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: path.join(__dirname, "preload.cjs"),
        },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        external(url);
        return { action: "deny" };
      });
      window.webContents.on("context-menu", (_event, params) => {
        if (!params.isEditable) {
          if (params.selectionText)
            Menu.buildFromTemplate([{ role: "copy" }, { role: "selectAll" }]).popup({ window });
          return;
        }
        Menu.buildFromTemplate([
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { type: "separator" },
          { role: "selectAll" },
        ]).popup({ window });
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== ORIGIN) {
          event.preventDefault();
          external(url);
        }
      });
      window.on("close", (event) => {
        if (readyToClose) return;
        event.preventDefault();
        if (closing) return;
        closing = true;
        window.webContents
          .executeJavaScript("globalThis.__slateFlush?.()")
          .then(() => {
            readyToClose = true;
            window.destroy();
          })
          .catch(async () => {
            closing = false;
            await dialog.showMessageBox(window, {
              type: "error",
              title: "Keep Slate open",
              message: "Your latest edits are still in memory.",
              detail: "Slate couldn’t save them. Export a backup before closing.",
              buttons: ["Keep Slate open"],
            });
          });
      });
      window.once("ready-to-show", () => {
        if (process.env.SLATE_TEST_HIDE_WINDOW !== "1") window.show();
      });
      await window.loadURL(ORIGIN);
    })
    .catch(async (error) => {
      await dialog.showMessageBox({
        type: "error",
        title: "Slate couldn’t start",
        message: "Slate couldn’t open its local workspace.",
        detail:
          error.code === "EADDRINUSE"
            ? "Another application is using Slate’s local port. Close it and try again."
            : "Try reopening Slate. Your saved workspace remains on this device.",
        buttons: ["Close"],
      });
      app.quit();
    });
  app.on("window-all-closed", () => {
    server?.close();
    app.quit();
  });
}
