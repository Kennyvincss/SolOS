// Preload for toolbar bubbles (group editor, bookmark editor, profiles, suggestions).
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bubble", {
  data: () => ipcRenderer.invoke("bubble:data"),
  action: (name, payload) => ipcRenderer.invoke("bubble:action", String(name), payload ?? null),
  resize: (height) => ipcRenderer.send("bubble:resize", height),
  close: () => ipcRenderer.send("bubble:close"),
  onData: (cb) => ipcRenderer.on("bubble:data", (_e, d) => cb(d)),
});
