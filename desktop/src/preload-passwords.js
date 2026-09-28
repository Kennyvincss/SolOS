// Preload for the local Passwords page.
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pwm", {
  list: () => ipcRenderer.invoke("pwm:list"),
  reveal: (id) => ipcRenderer.invoke("pwm:reveal", id),
  remove: (id) => ipcRenderer.invoke("pwm:remove", id),
  allowAgain: (origin) => ipcRenderer.invoke("pwm:allowAgain", origin),
  setting: (key, value) => ipcRenderer.invoke("pwm:setting", key, value),
});
