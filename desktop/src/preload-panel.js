// Preload for the toolbar's Extensions panel (the puzzle-piece button).
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("panel", {
  list: () => ipcRenderer.invoke("panel:list"),
  setPinned: (id, pinned) => ipcRenderer.invoke("panel:setPinned", id, pinned),
  open: (id) => ipcRenderer.send("panel:open", id),
  itemMenu: (id, x, y) => ipcRenderer.send("panel:itemMenu", { id, x, y }),
  manage: () => ipcRenderer.send("panel:manage"),
  findMore: () => ipcRenderer.send("panel:findMore"),
  resize: (height) => ipcRenderer.send("panel:resize", height),
  close: () => ipcRenderer.send("panel:close"),
  onRefresh: (cb) => ipcRenderer.on("panel:refresh", () => cb()),
});
