// Solana OS Desktop — a Chromium browser for the Solana ecosystem.
// SPDX-License-Identifier: GPL-3.0-only
//
// Wallet extensions (Phantom, Solflare, Backpack, ...) are installed from the
// real Chrome Web Store and run with full popup/tab support through
// electron-chrome-extensions (used under GPL-3.0).

const path = require("node:path");
const { app, BrowserWindow, Menu, WebContentsView, dialog, ipcMain, net, session, shell } = require("electron");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installChromeWebStore, installExtension, uninstallExtension } = require("electron-chrome-web-store");
const { WALLETS, SOLANA_OS_URL, normalizeInput, riskFromReport, hostOf } = require("./lib");

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
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      webPreferences: {
        preload: path.join(__dirname, "preload-shell.js"),
        contextIsolation: true,
        // The toolbar preload needs Node's require() to inject <browser-action-list>.
        sandbox: false,
      },
    });
    windows.add(this);
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
    wc.on("did-navigate", async (_e, navUrl) => {
      const t = this.tabs.get(wc.id);
      if (!t) return;
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
      };
    });
    this.win.webContents.send("shell:state", { tabs, activeId: this.activeId, home: SOLANA_OS_URL, platform: process.platform });
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

function shellFor(webContents) {
  for (const s of windows) if (s.win.webContents === webContents || s.tabs.has(webContents.id)) return s;
  return null;
}

function focusedShell() {
  const w = BrowserWindow.getFocusedWindow();
  for (const s of windows) if (s.win === w) return s;
  return [...windows][0] ?? null;
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
        ? { label: `${w.name}  ✓ Installed`, submenu: [{ label: `Remove ${w.name}…`, click: () => removeWallet(s, w) }] }
        : {
            label: `Install ${w.name}`,
            click: () =>
              installExtension(w.id, { session: browserSession })
                .then(() => s.activeTab?.view.webContents.reload())
                .catch((err) => dialog.showErrorBox(`Couldn't install ${w.name}`, String(err?.message ?? err))),
          },
    );
    items.push({ type: "separator" }, { label: "Browse Chrome Web Store…", click: () => s.newTab("https://chromewebstore.google.com/category/extensions") });
    Menu.buildFromTemplate(items).popup({ window: s.win, x: Math.round(pos?.x ?? 0), y: Math.round(pos?.y ?? 0) });
  });

  ipcMain.handle("shell:removeWallet", async (e, id) => {
    const wallet = WALLETS.find((w) => w.id === id);
    if (!wallet) throw new Error("Unknown wallet");
    return removeWallet(shellFor(e.sender), wallet);
  });
}

async function removeWallet(s, wallet) {
  const { response } = await dialog.showMessageBox(s?.win, {
    type: "warning",
    buttons: ["Cancel", "Remove"],
    defaultId: 0,
    cancelId: 0,
    message: `Remove ${wallet.name}?`,
    detail: "Make sure you have your recovery phrase saved. Removing the extension deletes its data from Solana OS Desktop.",
  });
  if (response !== 1) return false;
  await uninstallExtension(wallet.id, { session: browserSession });
  return true;
}

/* ------------------------------------------------------------ app menu */

function buildMenu() {
  const act = (fn) => () => {
    const s = focusedShell();
    if (s) fn(s);
  };
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: act((s) => s.newTab(SOLANA_OS_URL)) },
        { label: "New Window", accelerator: "CmdOrCtrl+N", click: () => new BrowserShell() },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: act((s) => s.closeTab(s.activeId)) },
        { type: "separator" },
        { label: "Open Location…", accelerator: "CmdOrCtrl+L", click: act((s) => s.win.webContents.send("shell:focusAddress")) },
        ...(process.platform === "darwin" ? [] : [{ type: "separator" }, { role: "quit" }]),
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
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "About Solana OS", click: () => shell.openExternal(SOLANA_OS_URL) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------ startup */

app.setName("Solana OS");

app.whenReady().then(async () => {
  browserSession = session.fromPartition(PARTITION);

  // Present as Chrome (without the Electron token) so sites and the Chrome Web
  // Store treat this like a regular Chromium browser, plus a Solana OS marker.
  const ua = browserSession.getUserAgent().replace(/\s(Electron|solana-os-desktop|Solana\s?OS)\/\S+/gi, "");
  browserSession.setUserAgent(`${ua} ${DESKTOP_UA_TOKEN}`);

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

  // Extension icons in the toolbar are served over crx:// in the toolbar's session.
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);

  // "Add to Chrome" on chromewebstore.google.com installs into this browser.
  await installChromeWebStore({ session: browserSession }).catch((err) => console.error("[extensions] web store setup failed:", err));

  registerIpc();
  buildMenu();
  new BrowserShell();

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
