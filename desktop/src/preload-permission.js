// Preload for the site permission prompt.
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("permission", {
  data: () => ipcRenderer.invoke("permission:data"),
  resize: (height) => ipcRenderer.send("permission:resize", height),
  answer: (answer) => ipcRenderer.send("permission:answer", String(answer)),
});
