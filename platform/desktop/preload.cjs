const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("slateVault", {
  open: () => ipcRenderer.invoke("slate-vault", "open"),
  list: (options) => ipcRenderer.invoke("slate-vault", "list", options),
  read: (options) => ipcRenderer.invoke("slate-vault", "read", options),
  asset: (options) => ipcRenderer.invoke("slate-vault", "asset", options),
  write: (options) => ipcRenderer.invoke("slate-vault", "write", options),
});
