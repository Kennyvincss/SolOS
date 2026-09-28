// Preload for the browser toolbar (not for web pages).
// SPDX-License-Identifier: GPL-3.0-only

const { contextBridge, ipcRenderer } = require("electron");
const { injectBrowserAction } = require("electron-chrome-extensions/browser-action");

// Registers the <browser-action-list> element that shows extension icons and popups.
injectBrowserAction();

const send = (ch) => (...args) => ipcRenderer.send(ch, ...args);

contextBridge.exposeInMainWorld("sos", {
  // tabs
  newTab: send("shell:newTab"),
  closeTab: send("shell:closeTab"),
  selectTab: send("shell:selectTab"),
  moveTab: send("shell:moveTab"), // (id, index, groupId|null|undefined, pinned?)
  moveGroup: send("shell:moveGroup"), // (groupId, index)
  toggleCollapse: send("shell:toggleCollapse"),
  toggleMute: send("shell:toggleMute"),
  detachTab: send("shell:detachTab"),
  tabMenu: send("shell:tabMenu"), // (id, x, y)
  stripMenu: send("shell:stripMenu"),
  groupEditor: send("shell:groupEditor"), // (groupId, rect)
  // navigation
  navigate: send("shell:navigate"),
  back: send("shell:back"),
  forward: send("shell:forward"),
  reload: send("shell:reload"),
  stop: send("shell:stop"),
  home: send("shell:home"),
  openHome: send("shell:openHome"), // (path)
  openUrl: send("shell:openUrl"), // (url, where: "current"|"tab"|"window"|"split")
  suggest: send("shell:suggest"), // (text, rect)
  suggestMove: send("shell:suggestMove"),
  suggestAccept: () => ipcRenderer.invoke("shell:suggestAccept"),
  suggestClose: send("shell:suggestClose"),
  // toolbar
  starClicked: send("shell:star"), // (rect)
  toggleReading: send("shell:toggleReading"),
  splitMenu: send("shell:splitMenu"),
  extensionsPanel: send("shell:extensionsPanel"),
  walletMenu: send("shell:walletMenu"),
  profileMenu: send("shell:profileMenu"),
  togglePanel: send("shell:togglePanel"),
  appMenu: (x, y) => ipcRenderer.send("shell:appMenu", { x, y }),
  bookmarkFolderMenu: send("shell:bookmarkFolderMenu"), // (folderId, rect)
  bookmarkItemMenu: send("shell:bookmarkItemMenu"), // (url, x, y)
  savedGroupClicked: send("shell:savedGroup"), // (groupId)
  savedGroupMenu: send("shell:savedGroupMenu"),
  // layout
  dragStart: send("shell:dragStart"), // ("split"|"panel")
  setSidebarCollapsed: send("shell:setSidebarCollapsed"),
  ready: send("shell:ready"),
  onState: (cb) => ipcRenderer.on("shell:state", (_e, state) => cb(state)),
  onLayout: (cb) => ipcRenderer.on("shell:layout", (_e, layout) => cb(layout)),
  onFocusAddress: (cb) => ipcRenderer.on("shell:focusAddress", () => cb()),
  onSetAddress: (cb) => ipcRenderer.on("shell:setAddress", (_e, text) => cb(text)),
  // kept for older callers
  toggleBookmark: send("shell:toggleBookmark"),
});
