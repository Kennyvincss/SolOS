// Preload for the browser toolbar (not for web pages).
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge, ipcRenderer } = require("electron");
const { injectBrowserAction } = require("electron-chrome-extensions/browser-action");

// Registers the <browser-action-list> element that shows extension icons and popups.
injectBrowserAction();

contextBridge.exposeInMainWorld("sos", {
  newTab: (url) => ipcRenderer.send("shell:newTab", url),
  closeTab: (id) => ipcRenderer.send("shell:closeTab", id),
  selectTab: (id) => ipcRenderer.send("shell:selectTab", id),
  navigate: (input) => ipcRenderer.send("shell:navigate", input),
  back: () => ipcRenderer.send("shell:back"),
  forward: () => ipcRenderer.send("shell:forward"),
  reload: () => ipcRenderer.send("shell:reload"),
  stop: () => ipcRenderer.send("shell:stop"),
  home: () => ipcRenderer.send("shell:home"),
  openWebStore: () => ipcRenderer.send("shell:openWebStore"),
  ready: () => ipcRenderer.send("shell:ready"),
  wallets: () => ipcRenderer.invoke("shell:wallets"),
  installWallet: (id) => ipcRenderer.invoke("shell:installWallet", id),
  removeWallet: (id) => ipcRenderer.invoke("shell:removeWallet", id),
  walletMenu: (x, y) => ipcRenderer.send("shell:walletMenu", { x, y }),
  appMenu: (x, y) => ipcRenderer.send("shell:appMenu", { x, y }),
  toggleBookmark: () => ipcRenderer.send("shell:toggleBookmark"),
  onState: (cb) => ipcRenderer.on("shell:state", (_e, state) => cb(state)),
  onFocusAddress: (cb) => ipcRenderer.on("shell:focusAddress", () => cb()),
});
