// Small popover windows anchored to the toolbar, like Chrome's bubbles:
// tab group editor, "bookmark added", profile switcher, address-bar suggestions.
// SPDX-License-Identifier: GPL-3.0-only

const path = require("node:path");
const { BrowserWindow, ipcMain } = require("electron");

let current = null; // { win, shell, name, handler, data, holdOpen }
let lastClosed = { key: "", at: 0 };

function close() {
  const b = current;
  current = null;
  if (!b) return;
  lastClosed = { key: `${b.shell.win.id}:${b.name}`, at: Date.now() };
  b.onClose?.();
  if (!b.win.isDestroyed()) b.win.destroy();
}

/**
 * Open a bubble. anchor: rect in the window's content coordinates.
 * opts: { name, anchor, width, align ("left"|"right"), data, handler(action, payload) -> result,
 *         inactive (don't take focus, for suggestions), onClose }
 */
function open(shell, opts) {
  const key = `${shell.win.id}:${opts.name}`;
  if (current) {
    const same = current.shell === shell && current.name === opts.name;
    close();
    if (same && !opts.inactive) return null; // clicking the button again closes it
  }
  if (!opts.inactive && lastClosed.key === key && Date.now() - lastClosed.at < 250) return null;
  const content = shell.win.getContentBounds();
  const width = opts.width ?? 320;
  const a = opts.anchor;
  const x = opts.align === "left" ? content.x + a.left : content.x + a.right - width;
  const win = new BrowserWindow({
    parent: shell.win,
    x: Math.round(Math.max(content.x + 4, Math.min(x, content.x + content.width - width - 4))),
    y: Math.round(content.y + a.bottom + 4),
    width,
    height: 120,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: !opts.inactive,
    show: false,
    transparent: false,
    backgroundColor: require("./appearance").colors().bubble,
    roundedCorners: true,
    webPreferences: { preload: path.join(__dirname, "preload-bubble.js"), contextIsolation: true, sandbox: true },
  });
  current = { win, shell, name: opts.name, handler: opts.handler, data: opts.data, inactive: Boolean(opts.inactive), onClose: opts.onClose, holdOpen: false };
  win.loadFile(path.join(__dirname, "ui", `bubble-${opts.name}.html`));
  win.on("blur", () => {
    if (current?.win === win && !current.holdOpen && !current.inactive) setTimeout(() => current?.win === win && !current.holdOpen && close(), 0);
  });
  win.on("closed", () => current?.win === win && (current = null));
  return current;
}

/** Update the data of an open bubble (e.g. new suggestions as you type). */
function update(name, data) {
  if (!current || current.name !== name || current.win.isDestroyed()) return false;
  current.data = data;
  current.win.webContents.send("bubble:data", data);
  return true;
}

function isOpen(name) {
  return Boolean(current && current.name === name && !current.win.isDestroyed());
}

function registerIpc() {
  const from = (e) => current && !current.win.isDestroyed() && e.sender === current.win.webContents;
  ipcMain.handle("bubble:data", (e) => (from(e) ? current.data : null));
  ipcMain.handle("bubble:action", async (e, action, payload) => {
    if (!from(e) || typeof action !== "string") return null;
    const b = current;
    try {
      b.holdOpen = true;
      return (await b.handler?.(action, payload, b)) ?? null;
    } finally {
      if (current === b) {
        b.holdOpen = false;
        if (!b.win.isDestroyed() && !b.inactive) b.win.focus();
      }
    }
  });
  ipcMain.on("bubble:resize", (e, height) => {
    if (!from(e)) return;
    const h = Math.max(40, Math.min(640, Math.ceil(Number(height) || 0)));
    const b = current.win.getBounds();
    current.win.setBounds({ ...b, height: h });
    if (!current.win.isVisible()) (current.inactive ? current.win.showInactive() : current.win.show());
  });
  ipcMain.on("bubble:close", (e) => from(e) && close());
}

module.exports = { open, close, update, isOpen, registerIpc, get current() {
  return current;
} };
