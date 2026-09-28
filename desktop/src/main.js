// Solana OS Desktop — a Chromium browser for the Solana ecosystem.
// SPDX-License-Identifier: GPL-3.0-only
//
// Wallet extensions (Phantom, Solflare, Backpack, ...) are installed from the
// real Chrome Web Store and run with full popup/tab support through
// electron-chrome-extensions (used under GPL-3.0).

const path = require("node:path");
const { app, BrowserWindow, Menu, MenuItem, WebContentsView, dialog, ipcMain, nativeImage, net, session, shell } = require("electron");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installChromeWebStore, installExtension, uninstallExtension } = require("electron-chrome-web-store");
const { WALLETS, SOLANA_OS_URL, normalizeInput, riskFromReport, hostOf } = require("./lib");
const library = require("./library");
const passwords = require("./passwords");
const { initUpdater, checkForUpdatesInteractive } = require("./updater");
const { searchWebStore, prefetch: prefetchWebStore } = require("./webstore-search");

const PARTITION = "persist:solanaos";
const TOOLBAR_HEIGHT = 88;
const DESKTOP_UA_TOKEN = "SolanaOSDesktop/" + app.getVersion();

let browserSession;
let extensions;
const windows = new Set();

/* ------------------------------------------------------------ site safety */

// Every site's domain is checked with the Solana OS Security Center
// (registry match, lookalike domains, bait keywords). Cached per host.
const riskCache = new Map();
async function checkSite(url) {
  const host = hostOf(url);
  if (!host) return null;
  if (host === hostOf(SOLANA_OS_URL)) return { level: "low", label: "Solana OS" };
  if (riskCache.has(host)) return riskCache.get(host);
  try {
    const res = await net.fetch(`${SOLANA_OS_URL}/api/security?q=${encodeURIComponent(url)}`);
    const risk = res.ok ? riskFromReport(await res.json()) : null;
    riskCache.set(host, risk);
    return risk;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ browser window */

class BrowserShell {
  constructor({ url } = {}) {
    this.tabs = new Map(); // webContents.id -> { view, risk }
    this.activeId = null;
    this.win = new BrowserWindow({
      width: 1360,
      height: 880,
      minWidth: 720,
      minHeight: 480,
      title: "Solana OS",
      backgroundColor: "#07080a",
      // Tabs live in the title bar, like Chrome. macOS keeps its traffic lights;
      // Windows/Linux draw the window buttons over the right end of the tab strip.
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
      ...(process.platform === "darwin" ? {} : { titleBarOverlay: { color: "#0d0f12", symbolColor: "#9ba1ab", height: 40 } }),
      webPreferences: {
        preload: path.join(__dirname, "preload-shell.js"),
        contextIsolation: true,
        // The toolbar preload needs Node's require() to inject <browser-action-list>.
        sandbox: false,
      },
    });
    windows.add(this);
    // No menu bar on Windows/Linux: the ⋮ button opens the menu and shortcuts are handled below.
    if (process.platform !== "darwin") this.win.removeMenu();
    this.win.webContents.on("before-input-event", (e, input) => handleShortcut(this, e, input));
    this.win.loadFile(path.join(__dirname, "ui", "shell.html"));
    this.win.on("resize", () => this.layout());
    this.win.on("closed", () => {
      windows.delete(this);
      for (const { view } of this.tabs.values()) if (!view.webContents.isDestroyed()) view.webContents.close();
      this.tabs.clear();
    });
    this.win.webContents.once("did-finish-load", () => {
      this.newTab(url ?? SOLANA_OS_URL);
    });
  }

  get activeTab() {
    return this.tabs.get(this.activeId);
  }

  newTab(url, { background = false } = {}) {
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Password manager (save/fill logins). Runs isolated from the page.
        preload: path.join(__dirname, "preload-tab.js"),
      },
    });
    const wc = view.webContents;
    this.tabs.set(wc.id, { view, risk: null });
    extensions.addTab(wc, this.win);

    wc.setWindowOpenHandler(({ url: target, disposition }) => {
      if (target.startsWith("chrome-extension://")) return { action: "allow" };
      this.newTab(target, { background: disposition === "background-tab" });
      return { action: "deny" };
    });
    const push = () => this.sendState();
    for (const ev of ["did-start-loading", "did-stop-loading", "page-title-updated", "page-favicon-updated", "did-navigate-in-page"]) wc.on(ev, push);
    wc.on("page-favicon-updated", (_e, favicons) => {
      const t = this.tabs.get(wc.id);
      if (t) t.favicon = favicons[0];
      push();
    });
    wc.on("page-title-updated", (_e, title) => library.addHistory(wc.getURL(), title));
    wc.on("did-navigate", async (_e, navUrl) => {
      const t = this.tabs.get(wc.id);
      if (!t) return;
      library.addHistory(navUrl, wc.getTitle());
      t.risk = null;
      push();
      const risk = await checkSite(navUrl);
      const cur = this.tabs.get(wc.id);
      if (cur && hostOf(wc.getURL()) === hostOf(navUrl)) {
        cur.risk = risk;
        push();
      }
    });
    wc.on("context-menu", (_e, params) => this.contextMenu(wc, params));
    wc.on("before-input-event", (e, input) => handleShortcut(this, e, input));
    // Google blocks sign-in inside embedded browsers: do it in the system browser.
    wc.on("will-navigate", (e, url) => {
      if (isGoogleSignIn(url)) {
        e.preventDefault();
        shell.openExternal(`${SOLANA_OS_URL}/api/auth/google?desktop=1`);
      }
    });

    wc.loadURL(url).catch(() => {});
    if (!background || !this.activeId) this.selectTab(wc.id);
    else this.sendState();
    return wc;
  }

  selectTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const prev = this.activeTab;
    if (prev && prev.view !== tab.view) this.win.contentView.removeChildView(prev.view);
    this.win.contentView.addChildView(tab.view);
    this.activeId = id;
    this.layout();
    tab.view.webContents.focus();
    extensions.selectTab(tab.view.webContents);
    this.sendState();
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const ids = [...this.tabs.keys()];
    const idx = ids.indexOf(id);
    this.win.contentView.removeChildView(tab.view);
    this.tabs.delete(id);
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    if (!this.tabs.size) return this.win.close();
    if (this.activeId === id) this.selectTab(ids[idx + 1] ?? ids[idx - 1]);
    else this.sendState();
  }

  layout() {
    const tab = this.activeTab;
    if (!tab) return;
    const [width, height] = this.win.getContentSize();
    tab.view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
  }

  navigate(input) {
    const url = normalizeInput(input);
    const tab = this.activeTab;
    if (tab) tab.view.webContents.loadURL(url).catch(() => {});
    else this.newTab(url);
  }

  focusAddress() {
    this.win.webContents.focus();
    this.win.webContents.send("shell:focusAddress");
  }

  toggleBookmark() {
    const wc = this.activeTab?.view.webContents;
    if (!wc || !/^https?:/.test(wc.getURL())) return;
    library.toggleBookmark(wc.getURL(), wc.getTitle());
    this.sendState();
  }

  sendState() {
    if (this.win.isDestroyed()) return;
    const tabs = [...this.tabs.entries()].map(([id, t]) => {
      const wc = t.view.webContents;
      return {
        id,
        title: wc.getTitle() || "New tab",
        url: wc.getURL(),
        favicon: t.favicon,
        loading: wc.isLoading(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        risk: t.risk,
        bookmarked: library.isBookmarked(wc.getURL()),
      };
    });
    this.win.webContents.send("shell:state", { tabs, activeId: this.activeId, home: SOLANA_OS_URL, platform: process.platform, hiddenExtensions: hiddenExtensions() });
    const active = this.activeTab;
    this.win.setTitle(active ? `${active.view.webContents.getTitle() || "Solana OS"} — Solana OS` : "Solana OS");
  }

  contextMenu(wc, params) {
    const items = [
      { label: "Back", enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: "Forward", enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: "Reload", click: () => wc.reload() },
      { type: "separator" },
    ];
    if (params.linkURL) items.push({ label: "Open link in new tab", click: () => this.newTab(params.linkURL, { background: true }) }, { type: "separator" });
    if (params.selectionText) items.push({ role: "copy" });
    if (params.isEditable) items.push({ role: "cut" }, { role: "copy" }, { role: "paste" });
    const ext = extensions.getContextMenuItems(wc, params);
    if (ext.length) items.push({ type: "separator" }, ...ext);
    items.push({ type: "separator" }, { label: "Inspect", click: () => wc.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(items).popup({ window: this.win });
  }
}

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

function shellFor(webContents) {
  for (const s of windows) if (s.win.webContents === webContents || s.tabs.has(webContents.id)) return s;
  return null;
}

function focusedShell() {
  const w = BrowserWindow.getFocusedWindow();
  for (const s of windows) if (s.win === w) return s;
  return [...windows][0] ?? null;
}

/* ------------------------------------------------------------ keyboard shortcuts */

// Windows/Linux have no menu bar (so no menu accelerators); handle Chrome's
// shortcuts directly. macOS uses the menu bar at the top of the screen.
function handleShortcut(s, event, input) {
  if (process.platform === "darwin" || input.type !== "keyDown") return;
  const ctrl = input.control && !input.alt;
  const key = input.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const wc = s.activeTab?.view.webContents;
  const ids = [...s.tabs.keys()];
  const idx = ids.indexOf(s.activeId);
  const zoom = (d) => wc && wc.setZoomLevel(d === 0 ? 0 : wc.getZoomLevel() + d);
  let act = null;
  if (ctrl && !input.shift) {
    act = {
      t: () => s.newTab(SOLANA_OS_URL),
      n: () => new BrowserShell(),
      w: () => s.closeTab(s.activeId),
      F4: () => s.closeTab(s.activeId),
      l: () => s.focusAddress(),
      r: () => wc?.reload(),
      d: () => s.toggleBookmark(),
      Tab: () => ids.length && s.selectTab(ids[(idx + 1) % ids.length]),
      PageDown: () => ids.length && s.selectTab(ids[(idx + 1) % ids.length]),
      PageUp: () => ids.length && s.selectTab(ids[(idx - 1 + ids.length) % ids.length]),
      "=": () => zoom(0.5),
      "+": () => zoom(0.5),
      "-": () => zoom(-0.5),
      0: () => zoom(0),
      F5: () => wc?.reloadIgnoringCache(),
    }[lower];
    if (!act && /^[1-9]$/.test(key)) act = () => s.selectTab(key === "9" ? ids[ids.length - 1] : ids[Number(key) - 1]);
  } else if (ctrl && input.shift) {
    act = {
      Tab: () => ids.length && s.selectTab(ids[(idx - 1 + ids.length) % ids.length]),
      r: () => wc?.reloadIgnoringCache(),
      i: () => wc?.toggleDevTools(),
      w: () => s.win.close(),
      "+": () => zoom(0.5),
    }[lower];
  } else if (input.alt && !input.control && !input.shift) {
    act = { ArrowLeft: () => wc?.navigationHistory.goBack(), ArrowRight: () => wc?.navigationHistory.goForward(), d: () => s.focusAddress(), Home: () => s.navigate(SOLANA_OS_URL) }[lower];
  } else if (!input.control && !input.alt && !input.meta) {
    act = { F5: () => wc?.reload(), F6: () => s.focusAddress(), F11: () => s.win.setFullScreen(!s.win.isFullScreen()), F12: () => wc?.toggleDevTools() }[key];
  }
  if (act) {
    event.preventDefault();
    act();
  }
}

/** The ⋮ menu (Chrome-style). Accelerators here are only labels; see handleShortcut. */
function chromeMenu(s) {
  const wc = s.activeTab?.view.webContents;
  const acc = (a) => ({ accelerator: a, registerAccelerator: false });
  const sync = library.getSyncState();
  const zoomPct = wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100;
  const bookmarks = library.bookmarks();
  const history = library.recentHistory(15);
  const installed = browserSession.extensions.getAllExtensions();
  return Menu.buildFromTemplate([
    { label: "New tab", ...acc("Ctrl+T"), click: () => s.newTab(SOLANA_OS_URL) },
    { label: "New window", ...acc("Ctrl+N"), click: () => new BrowserShell() },
    { type: "separator" },
    {
      label: "History",
      submenu: [
        ...(history.length ? history.map((h) => ({ label: (h.title || h.url).slice(0, 60), click: () => s.newTab(h.url) })) : [{ label: "No history yet", enabled: false }]),
        { type: "separator" },
        { label: "Clear browsing history…", click: () => confirmClearHistory() },
      ],
    },
    {
      label: "Bookmarks",
      submenu: [
        { label: wc && library.isBookmarked(wc.getURL()) ? "Remove bookmark" : "Bookmark this page", ...acc("Ctrl+D"), enabled: Boolean(wc && /^https?:/.test(wc.getURL())), click: () => s.toggleBookmark() },
        { type: "separator" },
        ...(bookmarks.length ? bookmarks.slice(-40).reverse().map((b) => ({ label: b.title.slice(0, 60) || b.url, click: () => s.newTab(b.url) })) : [{ label: "No bookmarks yet", enabled: false }]),
      ],
    },
    { label: "Passwords", click: () => openPasswords() },
    {
      label: "Extensions",
      submenu: [
        { label: "Solana extensions…", click: () => s.newTab(`${SOLANA_OS_URL}/extensions`) },
        { label: "Chrome Web Store", click: () => s.newTab("https://chromewebstore.google.com/category/extensions") },
        ...(installed.length
          ? [
              { type: "separator" },
              ...installed.map((x) => {
                const hidden = hiddenExtensions().includes(x.id);
                return {
                  label: hidden ? x.name : `${x.name} (pinned)`,
                  submenu: [
                    { label: hidden ? "Pin to toolbar" : "Unpin from toolbar", click: () => setExtensionHidden(x.id, !hidden) },
                    { label: `Remove ${x.name}…`, click: () => removeExtension(s, x.id, x.name) },
                  ],
                };
              }),
            ]
          : []),
      ],
    },
    { type: "separator" },
    { label: `Zoom in (${zoomPct}%)`, ...acc("Ctrl+="), click: () => wc && wc.setZoomLevel(wc.getZoomLevel() + 0.5) },
    { label: "Zoom out", ...acc("Ctrl+-"), click: () => wc && wc.setZoomLevel(wc.getZoomLevel() - 0.5) },
    { label: "Reset zoom", ...acc("Ctrl+0"), click: () => wc?.setZoomLevel(0) },
    { label: "Full screen", ...acc("F11"), click: () => s.win.setFullScreen(!s.win.isFullScreen()) },
    { type: "separator" },
    {
      label: sync.status === "ok" ? `Synced ${new Date(sync.at).toLocaleTimeString()}` : sync.status === "signed-out" ? "Sign in to sync bookmarks" : sync.status === "unavailable" ? "Sync isn't set up on the server" : sync.status === "error" ? "Sync failed — retry" : "Sync now",
      click: () => (sync.status === "signed-out" ? s.newTab(`${SOLANA_OS_URL}/login`) : library.syncNow().then(buildMenu)),
    },
    { label: "Check for updates…", click: () => checkForUpdatesInteractive() },
    { label: "Developer tools", ...acc("F12"), click: () => wc?.toggleDevTools() },
    { label: "About Solana OS", click: () => s.newTab(SOLANA_OS_URL) },
    { type: "separator" },
    { label: "Exit", click: () => app.quit() },
  ]);
}

async function confirmClearHistory() {
  const { response } = await dialog.showMessageBox({ type: "warning", buttons: ["Clear", "Cancel"], defaultId: 1, cancelId: 1, message: "Clear browsing history?", detail: "This removes the list of sites you visited. Bookmarks, passwords and cookies are kept." });
  if (response === 0) library.clearHistory();
}

/* ------------------------------------------------------------ IPC from toolbar */

function registerIpc() {
  const on = (ch, fn) => ipcMain.on(ch, (e, ...args) => {
    const s = shellFor(e.sender);
    if (s) fn(s, ...args);
  });
  on("shell:newTab", (s, url) => s.newTab(url ?? SOLANA_OS_URL));
  on("shell:closeTab", (s, id) => s.closeTab(id));
  on("shell:selectTab", (s, id) => s.selectTab(id));
  on("shell:navigate", (s, input) => s.navigate(input));
  on("shell:back", (s) => s.activeTab?.view.webContents.navigationHistory.goBack());
  on("shell:forward", (s) => s.activeTab?.view.webContents.navigationHistory.goForward());
  on("shell:reload", (s) => s.activeTab?.view.webContents.reload());
  on("shell:stop", (s) => s.activeTab?.view.webContents.stop());
  on("shell:home", (s) => s.navigate(SOLANA_OS_URL));
  on("shell:openWebStore", (s) => s.newTab("https://chromewebstore.google.com/category/extensions"));
  on("shell:ready", (s) => s.sendState());

  ipcMain.handle("shell:wallets", () => {
    const installed = new Set(browserSession.extensions.getAllExtensions().map((x) => x.id));
    return WALLETS.map((w) => ({ ...w, installed: installed.has(w.id) }));
  });
  ipcMain.handle("shell:installWallet", async (e, id) => {
    const wallet = WALLETS.find((w) => w.id === id);
    if (!wallet) throw new Error("Unknown wallet");
    await installExtension(wallet.id, { session: browserSession });
    shellFor(e.sender)?.activeTab?.view.webContents.reload();
    return true;
  });
  // Native menu (web content would cover an HTML dropdown).
  ipcMain.on("shell:walletMenu", (e, pos) => {
    const s = shellFor(e.sender);
    if (!s) return;
    const installed = new Set(browserSession.extensions.getAllExtensions().map((x) => x.id));
    const items = WALLETS.map((w) =>
      installed.has(w.id)
        ? { label: `${w.name}  ✓ Installed`, submenu: [{ label: `Remove ${w.name}…`, click: () => removeExtension(s, w.id, w.name) }] }
        : {
            label: `Install ${w.name}`,
            click: () =>
              installExtension(w.id, { session: browserSession })
                .then(() => s.activeTab?.view.webContents.reload())
                .catch((err) => dialog.showErrorBox(`Couldn't install ${w.name}`, String(err?.message ?? err))),
          },
    );
    items.push(
      { type: "separator" },
      { label: "More Solana wallets and extensions…", click: () => s.newTab(`${SOLANA_OS_URL}/extensions#browser`) },
      { label: "Browse Chrome Web Store…", click: () => s.newTab("https://chromewebstore.google.com/category/extensions") },
    );
    Menu.buildFromTemplate(items).popup({ window: s.win, x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? 0) });
  });

  ipcMain.handle("shell:removeWallet", async (e, id) => {
    const wallet = WALLETS.find((w) => w.id === id);
    if (!wallet) throw new Error("Unknown wallet");
    return removeExtension(shellFor(e.sender), wallet.id, wallet.name);
  });


  /* Solana OS site -> browser extensions (one-click install from the Extensions page).
     Only the Solana OS home site, in a top-level frame of our tabs, may call these;
     every install is confirmed in a native dialog. */
  const HOME_ORIGIN = new URL(SOLANA_OS_URL).origin;
  const fromHome = (e) => {
    const f = e.senderFrame;
    if (!f || f.parent !== null || !shellFor(e.sender)) return false;
    try {
      return new URL(f.url).origin === HOME_ORIGIN;
    } catch {
      return false;
    }
  };
  ipcMain.on("desktop:homeOrigin", (e) => (e.returnValue = HOME_ORIGIN));
  ipcMain.handle("desktop:extensions", (e) => {
    if (!fromHome(e)) return null;
    const hidden = new Set(hiddenExtensions());
    return browserSession.extensions.getAllExtensions().map((x) => ({ id: x.id, name: x.name, version: x.version, hidden: hidden.has(x.id), description: String(x.manifest?.description ?? "").slice(0, 200) }));
  });
  ipcMain.handle("desktop:setExtensionHidden", (e, id, hidden) => {
    if (!fromHome(e) || typeof id !== "string" || !browserSession.extensions.getExtension(id)) return false;
    setExtensionHidden(id, Boolean(hidden));
    return true;
  });
  ipcMain.handle("desktop:installExtension", async (e, id, claimedName) => {
    if (!fromHome(e) || typeof id !== "string" || !/^[a-p]{32}$/.test(id)) return { ok: false, error: "Not allowed" };
    if (browserSession.extensions.getExtension(id)) return { ok: true };
    const s = shellFor(e.sender);
    const label = typeof claimedName === "string" && claimedName.trim() ? claimedName.trim().slice(0, 60) : "this extension";
    const { response } = await dialog.showMessageBox(s?.win, {
      type: "question",
      buttons: ["Install", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: `Install ${label}?`,
      detail: `From the Chrome Web Store (ID ${id}). Extensions can read and change the sites you visit, so only install ones you trust.`,
    });
    if (response !== 0) return { ok: false, cancelled: true };
    try {
      const ext = await installExtension(id, { session: browserSession });
      // Guard against a wrong ID in the catalog: the store's name must match what the page said.
      const word = label.split(/\s+/)[0].toLowerCase();
      if (label !== "this extension" && !ext.name.toLowerCase().includes(word)) {
        await uninstallExtension(id, { session: browserSession }).catch(() => {});
        return { ok: false, error: `The Chrome Web Store returned "${ext.name}" instead of ${label}, so it was not kept.` };
      }
      return { ok: true, name: ext.name };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });
  ipcMain.handle("desktop:searchExtensions", async (e, query) => {
    if (!fromHome(e)) return null;
    try {
      return { ok: true, results: await searchWebStore(browserSession, typeof query === "string" ? query : "solana") };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err), results: [] };
    }
  });
  ipcMain.handle("desktop:removeExtension", async (e, id) => {
    if (!fromHome(e) || typeof id !== "string") return false;
    const x = browserSession.extensions.getExtension(id);
    if (!x) return true;
    return removeExtension(shellFor(e.sender), id, x.name);
  });

  /* bookmarks */
  on("shell:toggleBookmark", (s) => s.toggleBookmark());
  on("shell:extensionsPanel", (s, rect) => rect && openExtensionsPanel(s, { left: Number(rect.left) || 0, top: Number(rect.top) || 0, right: Number(rect.right) || 0, bottom: Number(rect.bottom) || 0 }));
  on("shell:appMenu", (s, pos) => chromeMenu(s).popup({ window: s.win, x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? 0) }));

  /* password manager (messages come from the tab preload) */
  const prompting = new Set();
  const mainFrameOrigin = (e) => {
    const frame = e.senderFrame;
    // Only top-level pages in our tabs; the origin comes from the frame, not the page.
    if (!frame || frame.parent !== null || !shellFor(e.sender)) return null;
    return passwords.eligibleOrigin(frame.url);
  };
  ipcMain.on("pw:captured", async (e, payload) => {
    const origin = mainFrameOrigin(e);
    const username = typeof payload?.username === "string" ? payload.username.slice(0, 256) : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (!origin || !password || password.length > 512 || !passwords.available() || !library.getSetting("savePasswords", true)) return;
    const kind = passwords.classify(origin, username, password);
    if (kind === "never" || kind === "same" || prompting.has(origin)) return;
    const s = shellFor(e.sender);
    prompting.add(origin);
    try {
      const host = new URL(origin).host;
      const update = kind === "update";
      const { response } = await dialog.showMessageBox(s.win, {
        type: "question",
        buttons: update ? ["Update password", "Not now"] : ["Save password", "Never for this site", "Not now"],
        defaultId: 0,
        cancelId: update ? 1 : 2,
        message: update ? `Update your saved password for ${host}?` : `Save password for ${host}?`,
        detail: `${username ? `Username: ${username}\n` : ""}Stored encrypted on this computer with your system keychain. It is never synced or uploaded.`,
      });
      if (response === 0) passwords.save(origin, username, password);
      else if (!update && response === 1) passwords.neverFor(origin);
    } finally {
      prompting.delete(origin);
    }
  });
  ipcMain.handle("pw:get", (e) => {
    const origin = mainFrameOrigin(e);
    if (!origin || !library.getSetting("autofillPasswords", true)) return [];
    return passwords.forOrigin(origin).map(({ username, password }) => ({ username, password }));
  });

  /* Passwords page (a local, privileged window) */
  const fromPasswordsPage = (e) => passwordsWindow && e.sender === passwordsWindow.webContents;
  ipcMain.handle("pwm:list", (e) => (fromPasswordsPage(e) ? { entries: passwords.list(), never: passwords.neverList(), available: passwords.available(), save: library.getSetting("savePasswords", true), autofill: library.getSetting("autofillPasswords", true) } : null));
  ipcMain.handle("pwm:reveal", async (e, id) => {
    if (!fromPasswordsPage(e)) return null;
    if (!(await confirmIdentity("show a saved password"))) return null;
    return passwords.reveal(id);
  });
  ipcMain.handle("pwm:remove", (e, id) => fromPasswordsPage(e) && (passwords.remove(id), true));
  ipcMain.handle("pwm:allowAgain", (e, origin) => fromPasswordsPage(e) && (passwords.allowAgain(origin), true));
  ipcMain.handle("pwm:setting", (e, key, value) => {
    if (!fromPasswordsPage(e) || !["savePasswords", "autofillPasswords"].includes(key)) return false;
    library.setSetting(key, Boolean(value));
    return true;
  });
}

/** Ask for Touch ID on Macs that have it; otherwise a confirmation dialog. */
async function confirmIdentity(reason) {
  const { systemPreferences } = require("electron");
  if (process.platform === "darwin" && systemPreferences.canPromptTouchID?.()) {
    return systemPreferences.promptTouchID(reason).then(() => true, () => false);
  }
  const { response } = await dialog.showMessageBox(passwordsWindow ?? undefined, {
    type: "warning",
    buttons: ["Show password", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    message: "Show this password?",
    detail: "Make sure no one else can see your screen.",
  });
  return response === 0;
}

let passwordsWindow = null;
function openPasswords() {
  if (passwordsWindow && !passwordsWindow.isDestroyed()) return passwordsWindow.focus();
  passwordsWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: "Passwords — Solana OS",
    backgroundColor: "#07080a",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload-passwords.js"), contextIsolation: true, sandbox: true },
  });
  passwordsWindow.loadFile(path.join(__dirname, "ui", "passwords.html"));
  passwordsWindow.on("closed", () => (passwordsWindow = null));
}

/** Extensions hidden from the toolbar (they keep working). Stored in synced settings. */
function hiddenExtensions() {
  const v = library.getSetting("hiddenExtensions", []);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function setExtensionHidden(id, hidden) {
  const set = new Set(hiddenExtensions());
  if (hidden) set.add(id);
  else set.delete(id);
  library.setSetting("hiddenExtensions", [...set]);
  for (const w of windows) w.sendState();
}

async function removeExtension(s, id, name) {
  const { response } = await dialog.showMessageBox(s?.win, {
    type: "warning",
    buttons: ["Cancel", "Remove"],
    defaultId: 0,
    cancelId: 0,
    message: `Remove ${name}?`,
    detail: "If this is a wallet, make sure you have its recovery phrase saved. Removing the extension deletes its data from Solana OS Desktop.",
  });
  if (response !== 1) return false;
  await uninstallExtension(id, { session: browserSession });
  return true;
}

/* ------------------------------------------------------------ Extensions panel (puzzle-piece button) */

// Like Chrome's: every installed extension with a pin toggle (pinned ones show
// next to the address bar) and a ⋮ menu; clicking one opens its popup.
const PANEL_WIDTH = 320;
let extPanel = null; // { win, shell, anchor }
let panelClosed = { shell: null, at: 0 }; // clicking the button while open closes it (blur fires first)

function extensionIcon(ext) {
  const m = ext.manifest || {};
  const sets = [m.icons, (m.action || m.browser_action || {}).default_icon];
  for (const set of sets) {
    if (!set) continue;
    const rel = typeof set === "string" ? set : set[Object.keys(set).map(Number).filter((n) => n >= 32).sort((a, b) => a - b)[0]] || set[Object.keys(set).sort((a, b) => b - a)[0]];
    if (!rel) continue;
    const file = path.join(ext.path, String(rel).replace(/^\//, ""));
    if (!file.startsWith(ext.path)) continue;
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img.resize({ width: 40, height: 40, quality: "best" }).toDataURL();
  }
  return null;
}

function panelItems() {
  const hidden = new Set(hiddenExtensions());
  return browserSession.extensions
    .getAllExtensions()
    .filter((x) => !(x.manifest && x.manifest.theme))
    .map((x) => ({ id: x.id, name: x.name, pinned: !hidden.has(x.id), icon: extensionIcon(x) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function closeExtensionsPanel() {
  const p = extPanel;
  extPanel = null;
  if (p) panelClosed = { shell: p.shell, at: Date.now() };
  if (p && !p.win.isDestroyed()) p.win.destroy();
}

/** anchor: the puzzle button's rect in the browser window's content coordinates. */
function openExtensionsPanel(s, anchor) {
  if (extPanel) {
    const same = extPanel.shell === s;
    closeExtensionsPanel();
    if (same) return; // second click on the button closes it, like Chrome
  }
  if (panelClosed.shell === s && Date.now() - panelClosed.at < 300) return;
  const content = s.win.getContentBounds();
  const x = Math.round(content.x + Math.min(anchor.right, content.width) - PANEL_WIDTH);
  const y = Math.round(content.y + anchor.bottom + 4);
  const win = new BrowserWindow({
    parent: s.win,
    x: Math.max(content.x, x),
    y,
    width: PANEL_WIDTH,
    height: 200,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#1b1e23",
    webPreferences: { preload: path.join(__dirname, "preload-panel.js"), contextIsolation: true, sandbox: true },
  });
  extPanel = { win, shell: s, anchor, holdOpen: false };
  win.loadFile(path.join(__dirname, "ui", "extensions-panel.html"));
  win.on("blur", () => {
    if (extPanel?.win === win && !extPanel.holdOpen) setTimeout(() => extPanel?.win === win && !extPanel.holdOpen && closeExtensionsPanel(), 0);
  });
  win.on("closed", () => extPanel?.win === win && (extPanel = null));
}

function registerPanelIpc() {
  const fromPanel = (e) => extPanel && !extPanel.win.isDestroyed() && e.sender === extPanel.win.webContents;
  ipcMain.handle("panel:list", (e) => (fromPanel(e) ? panelItems() : []));
  ipcMain.handle("panel:setPinned", (e, id, pinned) => {
    if (!fromPanel(e) || typeof id !== "string" || !browserSession.extensions.getExtension(id)) return false;
    setExtensionHidden(id, !pinned);
    return true;
  });
  ipcMain.on("panel:resize", (e, height) => {
    if (!fromPanel(e)) return;
    const h = Math.max(80, Math.min(560, Math.ceil(Number(height) || 0)));
    const b = extPanel.win.getBounds();
    extPanel.win.setBounds({ ...b, height: h });
    if (!extPanel.win.isVisible()) extPanel.win.show();
  });
  ipcMain.on("panel:close", (e) => fromPanel(e) && closeExtensionsPanel());
  ipcMain.on("panel:manage", (e) => {
    if (!fromPanel(e)) return;
    const s = extPanel.shell;
    closeExtensionsPanel();
    s.newTab(`${SOLANA_OS_URL}/extensions#installed`);
  });
  ipcMain.on("panel:findMore", (e) => {
    if (!fromPanel(e)) return;
    const s = extPanel.shell;
    closeExtensionsPanel();
    s.newTab(`${SOLANA_OS_URL}/extensions`);
  });
  // Clicking an extension opens its popup (or runs its click action), anchored to the puzzle button.
  ipcMain.on("panel:open", (e, id) => {
    if (!fromPanel(e) || typeof id !== "string" || !browserSession.extensions.getExtension(id)) return;
    const { shell: s, anchor } = extPanel;
    closeExtensionsPanel();
    s.win.focus();
    try {
      extensions.api.browserAction.activateClick({ extensionId: id, tabId: s.activeId ?? -1, anchorRect: { x: anchor.left, y: anchor.top, width: anchor.right - anchor.left, height: anchor.bottom - anchor.top }, alignment: "bottom left" });
    } catch (err) {
      console.error("[extensions] open failed:", err);
    }
  });
  ipcMain.on("panel:itemMenu", (e, pos) => {
    if (!fromPanel(e)) return;
    const ext = browserSession.extensions.getExtension(pos?.id);
    if (!ext) return;
    const p = extPanel;
    const s = p.shell;
    const manifest = ext.manifest || {};
    const optionsPage = manifest.options_page || manifest.options_ui?.page;
    const pinned = !hiddenExtensions().includes(ext.id);
    const refresh = () => extPanel?.win === p.win && p.win.webContents.send("panel:refresh");
    const menu = Menu.buildFromTemplate([
      { label: ext.name, enabled: false },
      { type: "separator" },
      { label: pinned ? "Unpin" : "Pin", click: () => (setExtensionHidden(ext.id, pinned), refresh()) },
      { label: "Options", enabled: Boolean(optionsPage), click: () => (closeExtensionsPanel(), s.newTab(`chrome-extension://${ext.id}/${String(optionsPage).replace(/^\//, "")}`)) },
      {
        label: "Remove from Solana OS…",
        click: async () => {
          p.holdOpen = true;
          await removeExtension(s, ext.id, ext.name).catch(() => false);
          p.holdOpen = false;
          if (extPanel?.win === p.win) {
            refresh();
            p.win.focus();
          }
        },
      },
      { type: "separator" },
      { label: "Manage extensions", click: () => (closeExtensionsPanel(), s.newTab(`${SOLANA_OS_URL}/extensions#installed`)) },
    ]);
    p.holdOpen = true;
    menu.popup({ window: p.win, x: Math.round(pos.x ?? 0), y: Math.round(pos.y ?? 0), callback: () => setTimeout(() => (p.holdOpen = false), 0) });
  });
}

/* ------------------------------------------------------------ chrome.identity.launchWebAuthFlow */

// Extensions sign users in (e.g. "Continue with Google") by opening a login
// page and waiting for a redirect to https://<extension-id>.chromiumapp.org/.
function webAuthFlow(extensionId, { url, interactive }) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(String(url));
    } catch {
      return reject(new Error("Invalid auth URL"));
    }
    if (target.protocol !== "https:") return reject(new Error("Auth URL must be https"));
    const redirectPrefix = `https://${extensionId}.chromiumapp.org/`;
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      show: interactive !== false,
      title: "Sign in",
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: { session: browserSession, sandbox: true, contextIsolation: true },
    });
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      if (!win.isDestroyed()) win.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const check = (event, next) => {
      if (typeof next === "string" && next.startsWith(redirectPrefix)) {
        event.preventDefault();
        finish(null, next);
      }
    };
    win.webContents.on("will-redirect", check);
    win.webContents.on("will-navigate", check);
    win.webContents.on("will-frame-navigate", (e) => check(e, e.url));
    win.on("closed", () => finish(new Error("The user did not approve access.")));
    if (interactive === false) setTimeout(() => finish(new Error("User interaction required.")), 15000);
    win.loadURL(target.toString()).catch(() => {});
  });
}

function setupWebAuthFlow() {
  const idFrom = (u) => /^chrome-extension:\/\/([a-p]{32})\//.exec(u || "")?.[1];
  // From extension pages.
  ipcMain.handle("solanaos-identity-auth", (e, opts) => {
    const id = idFrom(e.senderFrame?.url);
    if (!id) throw new Error("Not an extension");
    return webAuthFlow(id, opts || {});
  });
  // From extension service workers (they have their own IPC channel).
  const seen = new WeakSet();
  browserSession.serviceWorkers.on("running-status-changed", ({ runningStatus, versionId }) => {
    if (runningStatus !== "starting") return;
    const worker = browserSession.serviceWorkers.getWorkerFromVersionID(versionId);
    const id = idFrom(worker?.scope);
    if (!worker || !id || seen.has(worker)) return;
    seen.add(worker);
    worker.ipc.handle("solanaos-identity-auth", (_e, opts) => webAuthFlow(id, opts || {}));
  });
}

/* ------------------------------------------------------------ app menu */

function buildMenu() {
  const act = (fn) => () => {
    const s = focusedShell();
    if (s) fn(s);
  };
  const sync = library.getSyncState();
  const syncLabel =
    sync.status === "ok" ? `Synced ${new Date(sync.at).toLocaleTimeString()}` : sync.status === "signed-out" ? "Sign in to Solana OS to sync" : sync.status === "unavailable" ? "Sync not set up on server" : sync.status === "error" ? "Sync failed — retry" : "Sync now";
  const updatesItem = { label: "Check for Updates…", click: () => checkForUpdatesInteractive() };
  const template = [
    ...(process.platform === "darwin"
      ? [{ label: app.name, submenu: [{ role: "about" }, updatesItem, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: act((s) => s.newTab(SOLANA_OS_URL)) },
        { label: "New Window", accelerator: "CmdOrCtrl+N", click: () => new BrowserShell() },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: act((s) => s.closeTab(s.activeId)) },
        { type: "separator" },
        { label: "Open Location…", accelerator: "CmdOrCtrl+L", click: act((s) => s.win.webContents.send("shell:focusAddress")) },
        { type: "separator" },
        { label: "Passwords…", click: () => openPasswords() },
        { label: syncLabel, click: act((s) => (sync.status === "signed-out" ? s.newTab(`${SOLANA_OS_URL}/login`) : library.syncNow().then(buildMenu))) },
        ...(process.platform === "darwin" ? [] : [{ type: "separator" }, updatesItem, { type: "separator" }, { role: "quit" }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: act((s) => s.activeTab?.view.webContents.reload()) },
        { label: "Back", accelerator: "CmdOrCtrl+[", click: act((s) => s.activeTab?.view.webContents.navigationHistory.goBack()) },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: act((s) => s.activeTab?.view.webContents.navigationHistory.goForward()) },
        { type: "separator" },
        { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: act((s) => { const wc = s.activeTab?.view.webContents; if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5); }) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: act((s) => { const wc = s.activeTab?.view.webContents; if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5); }) },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: act((s) => s.activeTab?.view.webContents.setZoomLevel(0)) },
        { type: "separator" },
        { label: "Developer Tools", accelerator: process.platform === "darwin" ? "Alt+Cmd+I" : "Ctrl+Shift+I", click: act((s) => s.activeTab?.view.webContents.toggleDevTools()) },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Extensions",
      submenu: [
        { label: "Chrome Web Store", click: act((s) => s.newTab("https://chromewebstore.google.com/category/extensions")) },
        { type: "separator" },
        ...WALLETS.map((w) => ({ label: `Get ${w.name}`, click: act((s) => s.newTab(`https://chromewebstore.google.com/detail/${w.id}`)) })),
      ],
    },
    {
      label: "Bookmarks",
      submenu: [
        { label: "Bookmark This Page", accelerator: "CmdOrCtrl+D", click: act((s) => { const wc = s.activeTab?.view.webContents; if (wc && /^https?:/.test(wc.getURL())) { library.toggleBookmark(wc.getURL(), wc.getTitle()); s.sendState(); } }) },
        { type: "separator" },
        ...(library.bookmarks().length
          ? library.bookmarks().slice(-40).reverse().map((b) => ({ label: b.title.slice(0, 60) || b.url, click: act((s) => s.newTab(b.url)) }))
          : [{ label: "No bookmarks yet", enabled: false }]),
      ],
    },
    {
      label: "History",
      submenu: [
        ...(library.recentHistory(15).length
          ? library.recentHistory(15).map((h) => ({ label: (h.title || h.url).slice(0, 60), click: act((s) => s.newTab(h.url)) }))
          : [{ label: "No history yet", enabled: false }]),
        { type: "separator" },
        { label: "Clear History…", click: () => confirmClearHistory() },
      ],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "About Solana OS", click: () => shell.openExternal(SOLANA_OS_URL) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------ startup */

app.setName("Solana OS");

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
  const s = focusedShell() ?? new BrowserShell({ url: "about:blank" });
  s.newTab(`${SOLANA_OS_URL}/api/auth/desktop?token=${encodeURIComponent(token)}`);
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
    else focusedShell()?.win.focus();
  });
}
app.on("open-url", (e, url) => {
  e.preventDefault();
  app.whenReady().then(() => handleProtocolUrl(url));
});

app.whenReady().then(async () => {
  browserSession = session.fromPartition(PARTITION);

  // Present as Chrome (without the Electron token) so sites and the Chrome Web
  // Store treat this like a regular Chromium browser, plus a Solana OS marker.
  const ua = browserSession.getUserAgent().replace(/\s(Electron|solana-os-desktop|Solana\s?OS)\/\S+/gi, "");
  browserSession.setUserAgent(`${ua} ${DESKTOP_UA_TOKEN}`);

  // Chrome APIs Electron lacks (chrome.identity, chrome.sidePanel, ...). Must be
  // registered before ElectronChromeExtensions, which freezes `chrome`.
  const polyfillPath = path.join(__dirname, "extension-polyfills.js");
  browserSession.registerPreloadScript({ id: "solanaos-crx-polyfills-frame", type: "frame", filePath: polyfillPath });
  browserSession.registerPreloadScript({ id: "solanaos-crx-polyfills-worker", type: "service-worker", filePath: polyfillPath });
  setupWebAuthFlow();

  extensions = new ElectronChromeExtensions({
    license: "GPL-3.0",
    session: browserSession,
    async createTab(details) {
      const s = focusedShell() ?? new BrowserShell({ url: "about:blank" });
      const wc = s.newTab(details.url ?? SOLANA_OS_URL, { background: details.active === false });
      return [wc, s.win];
    },
    selectTab(wc) {
      shellFor(wc)?.selectTab(wc.id);
    },
    removeTab(wc) {
      shellFor(wc)?.closeTab(wc.id);
    },
    async createWindow(details) {
      // Wallet approval prompts use chrome.windows.create({ type: "popup" }).
      if (details.type === "popup" || details.type === "panel") {
        const popup = new BrowserWindow({
          width: details.width ?? 360,
          height: details.height ?? 620,
          x: details.left,
          y: details.top,
          resizable: false,
          minimizable: false,
          fullscreenable: false,
          alwaysOnTop: true,
          autoHideMenuBar: true,
          backgroundColor: "#111111",
          webPreferences: { session: browserSession, sandbox: true, contextIsolation: true },
        });
        extensions.addTab(popup.webContents, popup);
        const url = Array.isArray(details.url) ? details.url[0] : details.url;
        if (url) popup.loadURL(url);
        return popup;
      }
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      return new BrowserShell({ url }).win;
    },
    removeWindow(win) {
      if (!win.isDestroyed()) win.close();
    },
  });

  // chrome.windows.create doesn't resolve relative URLs in electron-chrome-extensions
  // (tabs.create does). Wallets open their approval window with a relative URL
  // like "notification.html?...", which left the window blank and the site's
  // "Connect" spinning forever. Resolve them against the calling extension.
  const store = extensions.ctx?.store;
  if (store && typeof store.createWindow === "function") {
    const createWindow = store.createWindow.bind(store);
    store.createWindow = (event, details = {}) => createWindow(event, resolveWindowUrls(details, event?.extension));
  } else {
    console.warn("[extensions] could not patch windows.create URL handling");
  }

  // Right-click menu on toolbar icons: the library's items plus Hide and Remove.
  const browserActionApi = extensions.api?.browserAction;
  if (browserActionApi && typeof browserActionApi.activateContextMenu === "function") {
    const original = browserActionApi.activateContextMenu.bind(browserActionApi);
    browserActionApi.activateContextMenu = (details) => {
      const ext = browserSession.extensions.getExtension(details?.extensionId);
      if (!ext) return original(details);
      const s = focusedShell();
      const manifest = ext.manifest || {};
      const optionsPage = manifest.options_page || manifest.options_ui?.page;
      let own = [];
      try {
        own = extensions.ctx.store.buildMenuItems(ext.id, "browser_action") || [];
      } catch {
        own = [];
      }
      const extra = new Menu();
      const add = (o) => extra.append(new MenuItem(o));
      add({ label: ext.name, enabled: false });
      add({ type: "separator" });
      for (const item of own) extra.append(item);
      if (own.length) add({ type: "separator" });
      add({ label: "Options", enabled: Boolean(optionsPage), click: () => optionsPage && s?.newTab(`chrome-extension://${ext.id}/${String(optionsPage).replace(/^\//, "")}`) });
      add({ label: "Unpin", click: () => setExtensionHidden(ext.id, true) });
      add({ label: "Remove from Solana OS…", click: () => removeExtension(s, ext.id, ext.name) });
      add({ type: "separator" });
      add({ label: "Manage extensions", click: () => s?.newTab(`${SOLANA_OS_URL}/extensions#installed`) });
      const a = details?.anchorRect ?? { x: 0, y: 0, height: 0 };
      extra.popup({ window: s?.win, x: Math.floor(a.x), y: Math.floor(a.y + (a.height ?? 0)) });
    };
  }

  // Extension icons in the toolbar are served over crx:// in the toolbar's session.
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);

  // "Add to Chrome" on chromewebstore.google.com installs into this browser.
  await installChromeWebStore({ session: browserSession }).catch((err) => console.error("[extensions] web store setup failed:", err));

  registerIpc();
  registerPanelIpc();
  buildMenu();

  // Keep the Bookmarks/History menus current.
  let menuTimer = null;
  library.onChange(() => {
    clearTimeout(menuTimer);
    menuTimer = setTimeout(buildMenu, 500);
  });

  // Sync bookmarks and settings with the Solana OS account signed in inside the
  // browser (the request carries that session's cookies).
  library.configureSync((method, body) =>
    browserSession.fetch(`${SOLANA_OS_URL}/api/sync/desktop`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify({ data: body }) : undefined,
    }),
  );
  const syncAndRefresh = () => library.syncNow().then(buildMenu, () => {});
  setTimeout(syncAndRefresh, 5000);
  setInterval(syncAndRefresh, 30 * 60 * 1000);

  initUpdater();
  new BrowserShell();
  // Have the Extensions page's list ready before it's opened.
  setTimeout(() => prefetchWebStore(browserSession), 8000);
  const launchUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (launchUrl) setTimeout(() => handleProtocolUrl(launchUrl), 1500);

  app.on("activate", () => {
    if (!windows.size) new BrowserShell();
  });
});

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
