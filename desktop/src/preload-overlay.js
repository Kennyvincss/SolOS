// Preload for the transparent overlay used while dragging a divider.
// SPDX-License-Identifier: GPL-3.0-only

const { ipcRenderer } = require("electron");

window.addEventListener("pointermove", (e) => ipcRenderer.send("shell:dragMove", e.clientX));
window.addEventListener("pointerup", () => ipcRenderer.send("shell:dragEnd"));
window.addEventListener("blur", () => ipcRenderer.send("shell:dragEnd"));
