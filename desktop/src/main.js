// STRATA — the browser for the onchain world.
// SPDX-License-Identifier: GPL-3.0-only
//
// Wallet extensions (Phantom, Solflare, Backpack, ...) are installed from the
// real Chrome Web Store and run with full popup/tab support through
// electron-chrome-extensions (used under GPL-3.0).
//
// Modules:
//   profiles.js / runtime.js   profiles and their sessions, extensions, library, passwords
//   window.js                  a browser window: tabs, groups, split view, side panel, layout
//   menus.js / ipc.js          menus, shortcuts, toolbar commands, the STRATA site bridge
//   bubbles.js / omnibox.js    popovers and address-bar suggestions
//   library.js                 bookmarks, history, reading list, saved groups, sync
//   devices.js                 send tabs to your other devices

const path = require("node:path");
const { app, BrowserWindow, Menu, MenuItem, session, shell } = require("electron");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");

// STRATA was called "Solana OS". Keep using the same data folder so installed
// extensions (wallets), bookmarks, history and settings carry over. (Only when
// the default folder is in use; tests and portable setups can choose their own.)
if (path.basename(app.getPath("userData")) === "STRATA" || path.basename(app.getPath("userData")) === "strata-desktop") {
  app.setPath("userData", path.join(app.getPath("appData"), "Solana OS"));
}
app.setName("STRATA");

const { SOLANA_OS_URL } = require("./lib");
const profiles = require("./profiles");
const runtime = require("./runtime");
const win = require("./window");
const menus = require("./menus");
const ipc = require("./ipc");
const bubbles = require("./bubbles");
const devices = require("./devices");
const { initUpdater } = require("./updater");
const { prefetch: prefetchWebStore } = require("./webstore-search");

/* ------------------------------------------------------------ wiring */

/** Resolve chrome.windows.create URLs relative to the extension, like Chrome does. */
function resolveWindowUrls(details, extension) {
  if (!details || !details.url || !extension?.url) return details;
  const resolve = (u) => {
    try {
      const abs = new URL(String(u), extension.url).href;
      return /^(chrome|javascript|file):/i.test(abs) ? null : abs;
    } catch {
      return null;
    }
  };
  const urls = (Array.isArray(details.url) ? details.url : [details.url]).map(resolve).filter(Boolean);
  return { ...details, url: Array.isArray(details.url) ? urls : urls[0] };
}

function isGoogleSignIn(url) {
  try {
    const u = new URL(url);
    return u.origin === new URL(SOLANA_OS_URL).origin && u.pathname === "/api/auth/google";
  } catch {
    return false;
  }
}

/** Per-profile setup once its runtime exists. */
function configureRuntime(rt) {
  const ext = rt.extensions;

  // chrome.windows.create doesn't resolve relative URLs in electron-chrome-extensions
  // (tabs.create does). Wallets open their approval window with a relative URL
  // like "notification.html?...", which left the window blank and the site's
  // "Connect" spinning forever. Resolve them against the calling extension.
  const store = ext.ctx?.store;
  if (store && typeof store.createWindow === "function") {
    const createWindow = store.createWindow.bind(store);
    store.createWindow = (event, details = {}) => createWindow(event, resolveWindowUrls(details, event?.extension));
  }

  // Right-click menu on toolbar icons: the extension's own items plus Unpin and Remove.
  const browserActionApi = ext.api?.browserAction;
  if (browserActionApi && typeof browserActionApi.activateContextMenu === "function") {
    const original = browserActionApi.activateContextMenu.bind(browserActionApi);
    browserActionApi.activateContextMenu = (details) => {
      const x = rt.session.extensions.getExtension(details?.extensionId);
      if (!x) return original(details);
      const s = win.focusedShell(rt.id);
      const manifest = x.manifest || {};
      const optionsPage = manifest.options_page || manifest.options_ui?.page;
      let own = [];
      try {
        own = ext.ctx.store.buildMenuItems(x.id, "browser_action") || [];
      } catch {
        own = [];
      }
      const menu = new Menu();
      const add = (o) => menu.append(new MenuItem(o));
      add({ label: x.name, enabled: false });
      add({ type: "separator" });
      for (const item of own) menu.append(item);
      if (own.length) add({ type: "separator" });
      add({ label: "Options", enabled: Boolean(optionsPage), click: () => optionsPage && s?.newTab(`chrome-extension://${x.id}/${String(optionsPage).replace(/^\//, "")}`) });
      add({ label: "Unpin", click: () => ipc.setExtensionHidden(rt, x.id, true) });
      add({ label: "Remove from STRATA…", click: () => s && ipc.removeExtension(s, x.id, x.name) });
      add({ type: "separator" });
      add({ label: "Manage extensions", click: () => s?.newTab(`${SOLANA_OS_URL}/extensions#installed`) });
      const a = details?.anchorRect ?? { x: 0, y: 0, height: 0 };
      require("./popmenu").show(menu, { window: s?.win, x: Math.floor(a.x), y: Math.floor(a.y + (a.height ?? 0)), name: "extension", context: { window: s?.win } });
    };
  }

  // Keep windows and the menu bar current when bookmarks/settings change.
  let menuTimer = null;
  rt.library.onChange((what) => {
    if (what === "history") return;
    clearTimeout(menuTimer);
    menuTimer = setTimeout(() => {
      menus.buildMenuBar(ipc.actionsFor());
      for (const s of win.shellsOf(rt.id)) s.sendState();
    }, 200);
  });

  // Sync with the account signed in inside this profile.
  setTimeout(() => rt.library.syncNow(), 5000);
  rt.syncTimer = setInterval(() => rt.library.syncNow(), 30 * 60 * 1000);

  // Tabs sent from your other devices.
  devices.start(rt, (url, opts = {}) => {
    const s = win.focusedShell(rt.id) ?? ipc.openProfile(rt.id, { restore: false });
    if (s?.ready) s.newTab(url, opts);
  });

  // Developer mode: unpacked extensions load with the profile.
  if (rt.library.getSetting("developerMode", false)) ipc.loadUnpackedAtStart(rt);
}

runtime.setHooks({
  focusedShell: (profileId) => win.focusedShell(profileId),
  shellForWebContents: (wc) => win.shellFor(wc),
  openWindow: (profileId, opts) => new win.BrowserShell(profileId, opts),
  configure: configureRuntime,
});

win.setHooks({
  handleShortcut: (s, e, input) => ipc.handleShortcut(s, e, input),
  pageContextMenu: (s, wc, params) => menus.pageContextMenu(s, wc, params),
  isGoogleSignIn,
});

/* ------------------------------------------------------------ sign-in hand-off */

// Google sign-in runs in the system browser (Google blocks it inside embedded
// browsers) and comes back as solanaos-desktop://auth?token=... .
const PROTOCOL = "solanaos-desktop";
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient(PROTOCOL);

function handleProtocolUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return;
  }
  if (u.protocol !== `${PROTOCOL}:` || u.hostname !== "auth") return;
  const token = u.searchParams.get("token");
  if (!token || token.length > 4096) return;
  const s = win.focusedShell() ?? ipc.openProfile(profiles.lastUsed(), { restore: false });
  const open = () => s.newTab(`${SOLANA_OS_URL}/api/auth/desktop?token=${encodeURIComponent(token)}`);
  if (s.ready) open();
  else s.win.webContents.once("did-finish-load", () => setTimeout(open, 50));
  if (s.win.isMinimized()) s.win.restore();
  s.win.focus();
}

// One running copy: a second launch (e.g. from the sign-in link) hands its URL over.
if (!process.env.SOLANA_OS_ALLOW_MULTIPLE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) app.whenReady().then(() => handleProtocolUrl(url));
    else win.focusedShell()?.win.focus();
  });
}
app.on("open-url", (e, url) => {
  e.preventDefault();
  app.whenReady().then(() => handleProtocolUrl(url));
});

/* ------------------------------------------------------------ startup */

app.whenReady().then(() => {
  require("./appearance").init();
  // Extension icons in the toolbar are served over crx:// in the toolbar's session.
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  ipc.register();
  bubbles.registerIpc();
  require("./popmenu").registerIpc();
  menus.buildMenuBar(ipc.actionsFor());
  initUpdater();

  const first = ipc.openProfile(profiles.lastUsed());
  // Have the Extensions page's list ready before it's opened.
  setTimeout(() => prefetchWebStore(first.profile.session), 8000);
  const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (launchUrl) setTimeout(() => handleProtocolUrl(launchUrl), 1500);

  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) ipc.openProfile(profiles.lastUsed());
  });
});

app.on("before-quit", () => win.saveAllSessions());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Open solana: payment links in the system's wallet app.
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-navigate", (ev, url) => {
    if (url.startsWith("solana:")) {
      ev.preventDefault();
      shell.openExternal(url);
    }
  });
});
