// Bridge for STRATA's menu windows (ui/menu.html).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("menu", {
  init: () => ipcRenderer.invoke("menu:init"),
  size: (w, h) => ipcRenderer.send("menu:size", Number(w), Number(h)),
  hover: (i, rect) => ipcRenderer.send("menu:hover", Number(i), rect),
  activate: (i, rect) => ipcRenderer.send("menu:activate", Number(i), rect),
  zoom: (i, action) => ipcRenderer.invoke("menu:zoom", Number(i), String(action)),
  key: (key) => ipcRenderer.send("menu:key", String(key)),
  close: () => ipcRenderer.send("menu:close"),
  onKey: (cb) => ipcRenderer.on("menu:key", (_e, key) => cb(key)),
});
