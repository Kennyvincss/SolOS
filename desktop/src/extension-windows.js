// chrome.windows for extensions, closer to Chrome than electron-chrome-extensions'
// version. Wallets (Phantom, Solflare, Backpack) drive their approval popups
// with these calls, and the library's gaps made the popup fail to show or the
// approval get lost:
//  - windows.get on a closed popup returned { id: -1 }, which looks like a real
//    window, so the wallet tried to re-focus its old popup instead of opening one.
//  - windows.update ignored { focused: true } (and position/size), so a popup
//    behind the browser window stayed hidden.
//  - windows.getCurrent returned the last focused window instead of the caller's
//    own window, so a popup that hadn't received focus yet got the browser
//    window's id (and could close the wrong window when done).
//  - getLastFocused returned null after a popup closed.
//  - details came from a cache (stale focus/bounds) and every window said "normal".
// SPDX-License-Identifier: GPL-3.0-only

const { BrowserWindow, screen } = require("electron");

const WINDOW_ID_NONE = -1;
const WINDOW_ID_CURRENT = -2;

/** Windows that are extension popups (chrome.windows.create({ type: "popup" })). */
const popups = new WeakSet();

function markPopup(win) {
  popups.add(win);
}

/** Keep a window on the display it was asked for, or centre it over `over`. */
function placeOnScreen(win, want, over) {
  const b = win.getBounds();
  const w = Math.round(want.width ?? b.width);
  const h = Math.round(want.height ?? b.height);
  let x = Number.isFinite(want.left) ? Math.round(want.left) : null;
  let y = Number.isFinite(want.top) ? Math.round(want.top) : null;
  const ref = over && !over.isDestroyed() ? over.getBounds() : null;
  if (x === null || y === null) {
    if (ref) {
      x = Math.round(ref.x + (ref.width - w) / 2);
      y = Math.round(ref.y + Math.min(80, Math.max(0, (ref.height - h) / 2)));
    } else {
      x = b.x;
      y = b.y;
    }
  }
  const area = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  const visible = x < area.x + area.width && x + w > area.x && y < area.y + area.height && y + h > area.y;
  if (!visible && ref) {
    x = Math.round(ref.x + (ref.width - w) / 2);
    y = ref.y + 80;
  }
  const a = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  x = Math.min(Math.max(x, a.x), a.x + Math.max(0, a.width - w));
  y = Math.min(Math.max(y, a.y), a.y + Math.max(0, a.height - h));
  win.setBounds({ x, y, width: Math.min(w, a.width), height: Math.min(h, a.height) });
}

/** Bring a window to the front and give it focus. */
function bringToFront(win) {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.moveTop();
  win.focus();
}

/**
 * Replace the chrome.windows handlers of one profile's extensions.
 * `browserWindow()` returns the profile's current browser window (or null).
 */
function install(ext, browserWindow) {
  const store = ext.ctx?.store;
  const router = ext.ctx?.router;
  if (!store || !router || typeof router.handle !== "function") return false;

  const alive = () => [...store.windows].filter((w) => !w.isDestroyed());
  const byId = (id) => alive().find((w) => w.id === id) ?? null;

  /** The window the calling page lives in (null for service workers). */
  const callerWindow = (sender) => {
    if (!sender || typeof sender.isDestroyed !== "function" || sender.isDestroyed()) return null;
    try {
      const w = BrowserWindow.fromWebContents(sender);
      if (w && !w.isDestroyed()) return w;
    } catch {
      /* not a window's page */
    }
    const w = store.tabToWindow?.get(sender);
    return w && !w.isDestroyed() ? w : null;
  };

  const lastFocused = () => {
    const w = store.getLastFocusedWindow?.();
    if (w && !w.isDestroyed()) return w;
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && store.windows.has(focused)) return focused;
    const b = browserWindow();
    if (b && !b.isDestroyed()) return b;
    return alive()[0] ?? null;
  };

  const resolve = (event, id) => (id === WINDOW_ID_CURRENT || id === undefined || id === null ? callerWindow(event?.sender) ?? lastFocused() : byId(id));

  const details = (win, opts) => {
    const b = win.getBounds();
    const populate = Boolean(opts?.populate);
    const tabs = [...store.tabs].filter((t) => !t.isDestroyed() && store.tabToWindow.get(t) === win);
    const out = {
      id: win.id,
      focused: win.isFocused(),
      top: b.y,
      left: b.x,
      width: b.width,
      height: b.height,
      incognito: !ext.ctx.session.isPersistent(),
      type: popups.has(win) ? "popup" : "normal",
      state: win.isFullScreen() ? "fullscreen" : win.isMinimized() ? "minimized" : win.isMaximized() ? "maximized" : "normal",
      alwaysOnTop: win.isAlwaysOnTop(),
      sessionId: "default",
    };
    if (populate) out.tabs = tabs.map((t) => store.tabDetailsCache.get(t.id)).filter(Boolean);
    return out;
  };

  router.handle("windows.get", (event, id, opts) => {
    const w = resolve(event, id);
    return w ? details(w, opts) : undefined;
  });
  router.handle("windows.getCurrent", (event, opts) => {
    const w = resolve(event, WINDOW_ID_CURRENT);
    return w ? details(w, opts) : undefined;
  });
  router.handle("windows.getLastFocused", (_event, opts) => {
    const w = lastFocused();
    return w ? details(w, opts) : undefined;
  });
  router.handle("windows.getAll", (_event, opts) => {
    const types = Array.isArray(opts?.windowTypes) ? opts.windowTypes : null;
    return alive()
      .map((w) => details(w, opts))
      .filter((d) => !types || types.includes(d.type));
  });
  router.handle("windows.create", async (event, createData = {}) => {
    const win = await store.createWindow(event, createData);
    if (!win || win.isDestroyed()) return undefined;
    return details(win, { populate: true });
  });
  router.handle("windows.update", (event, id, props = {}) => {
    const win = resolve(event, id);
    if (!win) return undefined;
    if (props.state === "minimized") win.minimize();
    else if (props.state === "maximized") win.maximize();
    else if (props.state === "fullscreen") win.setFullScreen(true);
    else if (props.state === "normal") {
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMinimized() || win.isMaximized()) win.restore();
    }
    if (["left", "top", "width", "height"].some((k) => Number.isFinite(props[k]))) {
      placeOnScreen(win, { left: props.left ?? win.getBounds().x, top: props.top ?? win.getBounds().y, width: props.width, height: props.height }, browserWindow());
    }
    if (props.focused === true) bringToFront(win);
    else if (props.focused === false) win.blur();
    if (props.drawAttention === true) win.flashFrame(true);
    else if (props.drawAttention === false) win.flashFrame(false);
    return details(win);
  });
  router.handle("windows.remove", async (event, id) => {
    const win = resolve(event, id);
    if (!win) return undefined;
    // "closed" is observed by the library, which sends windows.onRemoved once.
    if (store.windows.has(win)) await store.removeWindow(win);
    else if (!win.isDestroyed()) win.close();
    return undefined;
  });
  return true;
}

module.exports = { install, markPopup, placeOnScreen, bringToFront, popups, WINDOW_ID_NONE, WINDOW_ID_CURRENT };
