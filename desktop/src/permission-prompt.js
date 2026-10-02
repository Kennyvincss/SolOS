// The "site wants to …" prompt, drawn by STRATA inside its own window (under
// the address bar, like Chrome) instead of a system dialog. One prompt per
// window at a time; others wait their turn.
// SPDX-License-Identifier: GPL-3.0-only

const path = require("node:path");
const { BrowserWindow, ipcMain } = require("electron");

const WIDTH = 340;
const queues = new Map(); // parent window id -> [{ ask, resolve }]
const open = new Map(); // prompt webContents id -> { win, parent, finish, ask }
const watched = new WeakSet(); // parent windows with a "closed" listener

/** Where the prompt goes: under the address bar's left end in a browser window, else top centre. */
function placeFor(parent, anchor) {
  const c = parent.getContentBounds();
  const x = anchor ? c.x + anchor.left : c.x + (c.width - WIDTH) / 2;
  const y = c.y + (anchor ? anchor.top : 8);
  return { x: Math.round(Math.max(c.x + 4, Math.min(x, c.x + c.width - WIDTH - 4))), y: Math.round(y) };
}

function show(parent, ask, resolve) {
  const win = new BrowserWindow({
    parent,
    ...placeFor(parent, ask.anchor?.()),
    width: WIDTH,
    height: 150,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: require("./appearance").colors().bubble,
    roundedCorners: true,
    webPreferences: { preload: path.join(__dirname, "preload-permission.js"), contextIsolation: true, sandbox: true },
  });
  // Follow the window around.
  const place = () => !win.isDestroyed() && win.setPosition(...Object.values(placeFor(parent, ask.anchor?.())));
  const events = ["move", "resize", "enter-full-screen", "leave-full-screen"];
  for (const e of events) parent.on(e, place);
  let done = false;
  const finish = (answer) => {
    if (done) return;
    done = true;
    open.delete(win.webContents.id);
    for (const e of events) parent.removeListener(e, place);
    if (!win.isDestroyed()) win.destroy();
    resolve(answer);
    next(parent);
  };
  open.set(win.webContents.id, { win, parent, finish, ask });
  win.on("closed", () => finish("dismiss"));
  win.loadFile(path.join(__dirname, "ui", "permission.html"));
}

function next(parent) {
  if (parent.isDestroyed()) return;
  const q = queues.get(parent.id);
  q?.shift();
  if (!q?.length) return queues.delete(parent.id);
  show(parent, q[0].ask, q[0].resolve);
}

/**
 * Ask in `parent`. ask: { host, what, anchor?() -> { left, top } }.
 * Resolves "allow", "block" or "dismiss" (closed without choosing; not remembered).
 */
function ask(parent, a) {
  if (!parent || parent.isDestroyed()) return Promise.resolve("dismiss");
  return new Promise((resolve) => {
    const q = queues.get(parent.id) ?? [];
    q.push({ ask: a, resolve });
    queues.set(parent.id, q);
    if (!watched.has(parent)) {
      watched.add(parent);
      const id = parent.id;
      parent.once("closed", () => {
        const waiting = queues.get(id) ?? [];
        queues.delete(id);
        for (const p of open.values()) if (p.parent === parent) p.finish("dismiss");
        for (const item of waiting) item.resolve("dismiss");
      });
    }
    if (q.length === 1) show(parent, a, resolve);
  });
}

function registerIpc() {
  const from = (e) => open.get(e.sender.id);
  ipcMain.handle("permission:data", (e) => {
    const p = from(e);
    return p ? { host: p.ask.host, what: p.ask.what } : null;
  });
  ipcMain.on("permission:resize", (e, height) => {
    const p = from(e);
    if (!p || p.win.isDestroyed()) return;
    const h = Math.max(60, Math.min(400, Math.ceil(Number(height) || 0)));
    p.win.setBounds({ ...p.win.getBounds(), height: h });
    if (!p.win.isVisible()) p.win.show();
  });
  ipcMain.on("permission:answer", (e, answer) => {
    from(e)?.finish(["allow", "block"].includes(answer) ? answer : "dismiss");
  });
}

module.exports = { ask, registerIpc };
