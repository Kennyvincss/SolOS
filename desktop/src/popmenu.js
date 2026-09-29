// Chrome-style menus. Draws any Electron Menu in STRATA's own popup window
// (rounded panel, icons, shortcuts, fly-out submenus, keyboard navigation)
// instead of the operating system's menu. Menus are still built with
// Menu.buildFromTemplate, so the items and their click handlers are unchanged.
// SPDX-License-Identifier: GPL-3.0-only

const path = require("node:path");
const { BrowserWindow, Menu, ipcMain, screen } = require("electron");

/** Extra presentation hints for menu items (icon, zoom row), set by build(). */
const meta = new WeakMap();
const CUSTOM_KEYS = ["ico", "kind", "zoom", "avatar"];

/**
 * Menu.buildFromTemplate plus hints only this renderer uses:
 *   ico: icon name, avatar: { color, letter }, kind: "zoom" with zoom: { value(), in(), out(), full() }.
 */
function build(template) {
  const clean = (items) =>
    items.map((t) => {
      if (!t || typeof t !== "object" || t.constructor?.name === "MenuItem") return t;
      const c = { ...t };
      for (const k of CUSTOM_KEYS) delete c[k];
      if (Array.isArray(t.submenu)) c.submenu = clean(t.submenu);
      return c;
    });
  const menu = Menu.buildFromTemplate(clean(template));
  const tag = (items, tmpl) =>
    items.forEach((item, i) => {
      const t = tmpl[i];
      if (!t || typeof t !== "object" || t.constructor?.name === "MenuItem") return;
      const m = {};
      for (const k of CUSTOM_KEYS) if (t[k] !== undefined) m[k] = t[k];
      if (Object.keys(m).length) meta.set(item, m);
      if (item.submenu && Array.isArray(t.submenu)) tag(item.submenu.items, t.submenu);
    });
  tag(menu.items, template);
  return menu;
}

const isMac = process.platform === "darwin";
function accelLabel(a) {
  if (!a || typeof a !== "string") return "";
  const parts = a.split("+").map((p) => (p === "" ? "+" : p));
  const map = isMac
    ? { CmdOrCtrl: "⌘", CommandOrControl: "⌘", Command: "⌘", Cmd: "⌘", Ctrl: "⌃", Control: "⌃", Shift: "⇧", Alt: "⌥", Option: "⌥" }
    : { CmdOrCtrl: "Ctrl", CommandOrControl: "Ctrl", Command: "Ctrl", Cmd: "Ctrl", Control: "Ctrl", Option: "Alt" };
  const out = parts.map((p) => map[p] ?? (p === "Plus" ? "+" : p === "Delete" ? "Del" : p));
  return isMac ? out.join("") : out.join("+");
}

function serialize(menu) {
  return menu.items
    .filter((it) => it.visible !== false)
    .map((it) => {
      const m = meta.get(it) ?? {};
      const base = {
        i: menu.items.indexOf(it),
        label: String(it.label ?? ""),
        enabled: it.enabled !== false,
        type: it.type === "submenu" || !it.type ? "normal" : it.type,
        checked: Boolean(it.checked),
        sub: Boolean(it.submenu),
        accel: accelLabel(it.accelerator),
        ico: m.ico ?? null,
        avatar: m.avatar ?? null,
      };
      if (m.kind === "zoom" && m.zoom) return { ...base, type: "zoom", sub: false, value: m.zoom.value() };
      return base;
    });
}

/* ------------------------------------------------------------ state */

// levels[0] is the root menu; each deeper level is an open submenu.
let session = null; // { levels: [{ win, menu, items }], owner, kbd, onClose, name, context }
let lastClosed = { name: "", at: 0 };

function closeAll() {
  const s = session;
  session = null;
  if (!s) return;
  lastClosed = { name: s.name, at: Date.now() };
  for (const l of s.levels) if (!l.win.isDestroyed()) l.win.destroy();
  try {
    s.onClose?.();
  } catch {
    /* ignore */
  }
}

function closeFrom(level) {
  if (!session) return;
  const gone = session.levels.splice(level);
  for (const l of gone) if (!l.win.isDestroyed()) l.win.destroy();
  if (session.kbd >= session.levels.length) session.kbd = session.levels.length - 1;
}

const SHADOW = 0; // the OS draws the window shadow and rounded corners

function makeWindow(owner, focusable) {
  const win = new BrowserWindow({
    parent: owner,
    width: 280,
    height: 100,
    show: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable,
    alwaysOnTop: true,
    roundedCorners: true,
    backgroundColor: require("./appearance").colors().menu,
    webPreferences: { preload: path.join(__dirname, "preload-menu.js"), contextIsolation: true, sandbox: true },
  });
  win.setMenu?.(null);
  win.loadFile(path.join(__dirname, "ui", "menu.html"));
  return win;
}

/** Place a panel of size w×h with its top-left at (x, y) screen coords, flipping to stay on screen. */
function place(win, x, y, w, h, flipFrom) {
  const area = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
  let px = x;
  let py = y;
  if (px + w > area.x + area.width) px = flipFrom !== undefined ? flipFrom - w : area.x + area.width - w;
  if (px < area.x) px = area.x;
  if (py + h > area.y + area.height) py = Math.max(area.y, area.y + area.height - h);
  win.setBounds({ x: Math.round(px - SHADOW), y: Math.round(py - SHADOW), width: Math.round(w + SHADOW * 2), height: Math.round(h + SHADOW * 2) });
}

/**
 * Show a menu. opts: { window, x, y (content coords of window) | screen: {x, y}, alignRight (x is the right edge),
 *   name (for click-again-to-close), onClose, context: { window, webContents } for click handlers }.
 */
function show(menu, opts = {}) {
  const owner = opts.window && !opts.window.isDestroyed() ? opts.window : BrowserWindow.getFocusedWindow();
  const name = opts.name ?? "";
  if (session) {
    const same = name && session.name === name;
    closeAll();
    if (same) return;
  }
  if (name && lastClosed.name === name && Date.now() - lastClosed.at < 250) return; // the click that closed it
  let at = opts.screen;
  if (!at) {
    if (owner && Number.isFinite(opts.x)) {
      const cb = owner.getContentBounds();
      at = { x: cb.x + opts.x, y: cb.y + opts.y };
    } else at = screen.getCursorScreenPoint();
  }
  const win = makeWindow(owner, true);
  session = { levels: [{ win, menu, items: serialize(menu), at, alignRight: Boolean(opts.alignRight) }], owner, kbd: 0, onClose: opts.onClose, name, context: opts.context ?? { window: owner } };
  win.on("blur", () => setTimeout(() => session && session.levels[0]?.win === win && closeAll(), 0));
  win.on("closed", () => session && session.levels[0]?.win === win && closeAll());
  if (owner) {
    const onMove = () => closeAll();
    owner.once("move", onMove);
    owner.once("resize", onMove);
  }
}

function levelOf(sender) {
  if (!session) return -1;
  return session.levels.findIndex((l) => !l.win.isDestroyed() && l.win.webContents === sender);
}

function runClick(item) {
  const ctx = session?.context ?? {};
  closeAll();
  // Let focus return to the browser window before the action runs.
  setTimeout(() => {
    try {
      item.click({}, ctx.window ?? undefined, ctx.webContents ?? undefined);
    } catch (e) {
      console.error("[menu]", e);
    }
  }, 0);
}

function openSub(level, i, rect, focus) {
  if (!session) return;
  const l = session.levels[level];
  const item = l?.menu.items[i];
  if (!item?.submenu || item.enabled === false) return;
  closeFrom(level + 1);
  const win = makeWindow(session.owner, false);
  const b = l.win.getBounds();
  const parentLeft = b.x + SHADOW;
  // rect is in the parent window's coordinates (which include the shadow margin).
  const at = { x: b.x + rect.right + 2, y: b.y + rect.top - 8 };
  session.levels.push({ win, menu: item.submenu, items: serialize(item.submenu), at, flipFrom: parentLeft + 2, select: focus ? 0 : -1, parentIndex: i });
  if (focus) session.kbd = level + 1;
}

function registerIpc() {
  ipcMain.handle("menu:init", (e) => {
    const level = levelOf(e.sender);
    if (level < 0) return null;
    const l = session.levels[level];
    return { items: l.items, level, select: l.select ?? -1, mac: isMac };
  });
  ipcMain.on("menu:size", (e, w, h) => {
    const level = levelOf(e.sender);
    if (level < 0) return;
    const l = session.levels[level];
    const width = Math.max(level === 0 ? 220 : 200, Math.min(520, Math.ceil(Number(w) || 0)));
    const height = Math.max(20, Math.min(900, Math.ceil(Number(h) || 0)));
    place(l.win, l.alignRight ? l.at.x - width : l.at.x, l.at.y, width, height, l.flipFrom);
    if (!l.win.isVisible()) {
      if (level === 0) {
        l.win.show();
        l.win.focus();
      } else l.win.showInactive();
    }
  });
  ipcMain.on("menu:hover", (e, i, rect) => {
    const level = levelOf(e.sender);
    if (level < 0) return;
    session.kbd = level;
    const item = session.levels[level].menu.items[i];
    const open = session.levels[level + 1];
    if (open && open.parentIndex === i) return;
    if (item?.submenu && item.enabled !== false) openSub(level, i, rect, false);
    else closeFrom(level + 1);
  });
  ipcMain.on("menu:activate", (e, i, rect) => {
    const level = levelOf(e.sender);
    if (level < 0) return;
    const item = session.levels[level].menu.items[i];
    if (!item || item.enabled === false) return;
    if (item.submenu) return openSub(level, i, rect, true);
    runClick(item);
  });
  ipcMain.handle("menu:zoom", (e, i, action) => {
    const level = levelOf(e.sender);
    if (level < 0) return null;
    const item = session.levels[level].menu.items[i];
    const z = meta.get(item)?.zoom;
    if (!z || typeof z[action] !== "function") return null;
    z[action]();
    if (action === "full") {
      closeAll();
      return null;
    }
    return z.value();
  });
  // Keys go to the menu level that has the keyboard (the root window has focus).
  ipcMain.on("menu:key", (e, key) => {
    if (levelOf(e.sender) !== 0 || !session) return;
    if (key === "Escape") return session.kbd > 0 ? closeFrom(session.kbd) : closeAll();
    if (key === "ArrowLeft") {
      if (session.kbd > 0) closeFrom(session.kbd);
      return;
    }
    const l = session.levels[session.kbd];
    if (l && !l.win.isDestroyed()) l.win.webContents.send("menu:key", key);
  });
  ipcMain.on("menu:close", (e) => levelOf(e.sender) >= 0 && closeAll());
}

module.exports = { build, show, closeAll, registerIpc, accelLabel, get isOpen() {
  return Boolean(session);
} };
