// A running profile: its browser session, Chrome extensions, library and passwords.
// SPDX-License-Identifier: GPL-3.0-only

const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, ipcMain, net, session } = require("electron");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const { installChromeWebStore } = require("electron-chrome-web-store");
const { SOLANA_OS_URL, acceptLanguages, chromeUserAgent } = require("./lib");
const profiles = require("./profiles");
const { createLibrary } = require("./library");
const { createPasswords } = require("./passwords");
const extWindows = require("./extension-windows");
const permissions = require("./permissions");


/** Set by main: how to reach windows (avoids a require cycle). */
let hooks = {
  focusedShell: (_profileId) => null,
  shellForWebContents: (_wc) => null,
  openWindow: (_profileId, _opts) => null,
  configure: (_rt) => {},
};
function setHooks(h) {
  hooks = { ...hooks, ...h };
}

/* Domains of Solana apps from the STRATA App Store, to label history and bookmarks. */
let appHosts = new Set();
let appHostsLoaded = false;
async function loadAppHosts() {
  if (appHostsLoaded) return;
  appHostsLoaded = true;
  try {
    const res = await net.fetch(`${SOLANA_OS_URL}/api/apps?limit=500`);
    if (!res.ok) return;
    const body = await res.json();
    const apps = Array.isArray(body) ? body : body.data ?? body.apps ?? [];
    for (const a of apps) {
      try {
        if (a.website) appHosts.add(new URL(a.website).hostname.replace(/^www\./, ""));
      } catch {
        /* skip */
      }
    }
  } catch {
    appHostsLoaded = false;
  }
}

const runtimes = new Map();

function runtimeBySession(ses) {
  for (const rt of runtimes.values()) if (rt.session === ses) return rt;
  return null;
}

/** Profile runtime (created on first use). */
function getRuntime(profileId) {
  if (runtimes.has(profileId)) return runtimes.get(profileId);
  const meta = profiles.get(profileId);
  if (!meta) throw new Error(`Unknown profile ${profileId}`);
  const dir = profiles.dataDir(profileId);
  const partition = profiles.partition(profileId);
  const ses = session.fromPartition(partition);

  // Present exactly as Chrome does: no Electron or STRATA tokens and the
  // shortened version ("Chrome/152.0.0.0", as Chrome has sent since 2023).
  // Bot checks such as Cloudflare Turnstile ("Verify you are human") compare
  // the user agent with the real browser; a full build number or extra tokens
  // look like an automated browser. The STRATA site recognises the app through
  // its bridge (window.solanaOSDesktop), not the user agent.
  ses.setUserAgent(process.env.STRATA_TEST_UA || chromeUserAgent(ses.getUserAgent()), acceptLanguages(app.getPreferredSystemLanguages()));

  // Chrome APIs Electron lacks (chrome.identity, chrome.sidePanel, ...). Must be
  // registered before ElectronChromeExtensions, which freezes `chrome`.
  const polyfillPath = path.join(__dirname, "extension-polyfills.js");
  ses.registerPreloadScript({ id: "solanaos-crx-polyfills-frame", type: "frame", filePath: polyfillPath });
  ses.registerPreloadScript({ id: "solanaos-crx-polyfills-worker", type: "service-worker", filePath: polyfillPath });
  // No surprise "Windows Security: insert your security key" prompts (passkeys).
  ses.registerPreloadScript({ id: "strata-webauthn", type: "frame", filePath: path.join(__dirname, "preload-webauthn.js") });

  const rt = {
    id: profileId,
    get meta() {
      return profiles.get(profileId) ?? meta;
    },
    partition,
    dir,
    // Chrome Web Store installs: the main profile keeps the original folder.
    extensionsPath: path.join(dir, "Extensions"),
    session: ses,
    library: createLibrary(dir, { appHosts: () => appHosts }),
    passwords: createPasswords(dir),
    closedTabs: [], // most recent last; { url, title, entries, index, pinned, groupId, group }
    extensions: null,
  };
  runtimes.set(profileId, rt);

  // A small window in front of the browser, like a wallet's approval prompt.
  const extensionPopup = (details) => {
    const popup = new BrowserWindow({
      width: details.width ?? 360,
      height: details.height ?? 620,
      show: false,
      resizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: "#111111",
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
    });
    extWindows.markPopup(popup);
    // On screen, over the browser window (wallets compute a position that
    // can land off-screen or on another display), then in front with focus.
    extWindows.placeOnScreen(popup, details, hooks.focusedShell(profileId)?.win ?? BrowserWindow.getFocusedWindow());
    rt.extensions.addTab(popup.webContents, popup);
    const url = Array.isArray(details.url) ? details.url[0] : details.url;
    if (url) popup.loadURL(url);
    if (details.focused !== false) extWindows.bringToFront(popup);
    else popup.showInactive();
    return popup;
  };
  // When an extension without a toolbar popup is clicked, it usually opens its
  // own page in a tab; right after a click, that page opens as a popup instead.
  // Setup pages (onboarding, welcome, options) still get a full tab.
  const clickedAt = new Map(); // extension id -> time of the toolbar click
  const opensAsPopup = (url) => {
    const id = /^chrome-extension:\/\/([a-p]{32})\//.exec(url || "")?.[1];
    if (!id || Date.now() - (clickedAt.get(id) ?? 0) > 4000) return false;
    if (/onboard|welcome|setup|install|options|settings|fullscreen|expand/i.test(url)) return false;
    clickedAt.delete(id);
    return true;
  };

  rt.extensions = new ElectronChromeExtensions({
    license: "GPL-3.0",
    session: ses,
    async createTab(details) {
      if (opensAsPopup(details.url)) {
        const popup = extensionPopup({ url: details.url, width: 380, height: 620 });
        return [popup.webContents, popup];
      }
      const s = hooks.focusedShell(profileId) ?? hooks.openWindow(profileId, { url: "about:blank" });
      const wc = s.newTab(details.url ?? SOLANA_OS_URL, { background: details.active === false });
      return [wc, s.win];
    },
    selectTab(wc) {
      hooks.shellForWebContents(wc)?.selectTab(wc.id);
    },
    removeTab(wc) {
      hooks.shellForWebContents(wc)?.closeTab(wc.id);
    },
    async createWindow(details) {
      // Wallet approval prompts use chrome.windows.create({ type: "popup" }).
      if (details.type === "popup" || details.type === "panel") return extensionPopup(details);
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      return hooks.openWindow(profileId, { url }).win;
    },
    removeWindow(win) {
      if (!win.isDestroyed()) win.close();
    },
  });

  // Remember toolbar clicks (see opensAsPopup).
  const actions = rt.extensions.api.browserAction;
  const activateClick = actions.activateClick.bind(actions);
  actions.activateClick = (details) => {
    if (details?.extensionId) clickedAt.set(details.extensionId, Date.now());
    return activateClick(details);
  };

  quietExtensionPreload(ses);
  extWindows.install(rt.extensions, () => hooks.focusedShell(profileId)?.win ?? null);

  // Camera, microphone, location, notifications, ...: ask first, like Chrome.
  rt.permissions = permissions.install(ses, dir, (wc) => (wc ? hooks.shellForWebContents(wc)?.win : null) ?? hooks.focusedShell(profileId)?.win ?? null);

  // "Add to Chrome" on chromewebstore.google.com installs into this profile.
  installChromeWebStore({ session: ses, extensionsPath: rt.extensionsPath }).catch((err) => console.error("[extensions] web store setup failed:", err));

  // Sync with the STRATA account signed in inside this profile.
  const scope = profileId === "default" ? "" : `?profile=${encodeURIComponent(slug(rt.meta.name) || profileId)}`;
  rt.library.configureSync((method, body) =>
    ses.fetch(`${SOLANA_OS_URL}/api/sync/desktop${scope}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify({ data: body }) : undefined,
    }),
  );

  watchExtensionWorkers(rt);
  hooks.configure(rt);
  loadAppHosts();
  return rt;
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Close a profile's session (after its windows are closed). */
function dropRuntime(profileId) {
  const rt = runtimes.get(profileId);
  if (!rt) return null;
  rt.library.flush();
  rt.library.flushSession();
  runtimes.delete(profileId);
  return rt;
}

/* ------------------------------------------------------------ extension API preload */

/**
 * electron-chrome-extensions 4.9 ships its extension-API preload with debug
 * logging switched on: every chrome.* call, every result and every browser
 * event (each tab update, to every extension page and worker) is written to
 * the console with its arguments. STRATA uses a copy with that logging off.
 * STRATA_CRX_VERBOSE=1 keeps the library's original.
 */
let quietPreload;
function quietPreloadPath() {
  if (quietPreload !== undefined) return quietPreload;
  quietPreload = null;
  try {
    const original = require.resolve("electron-chrome-extensions/preload");
    const src = fs.readFileSync(original, "utf8");
    const quiet = src.replace(/if \(true\) \{(\s*console\.log\()/g, "if (false) {$1");
    if (quiet === src) return null; // a version without the logging
    const file = path.join(app.getPath("userData"), `crx-preload-${require("node:crypto").createHash("sha256").update(quiet).digest("hex").slice(0, 12)}.js`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, quiet);
    quietPreload = file;
  } catch {
    quietPreload = null;
  }
  return quietPreload;
}

function quietExtensionPreload(ses) {
  if (process.env.STRATA_CRX_VERBOSE) return;
  const file = quietPreloadPath();
  if (!file || typeof ses.unregisterPreloadScript !== "function") return;
  const ids = new Set(ses.getPreloadScripts().map((p) => p.id));
  if (!ids.has("crx-mv2-preload") || !ids.has("crx-mv3-preload")) return;
  ses.unregisterPreloadScript("crx-mv2-preload");
  ses.unregisterPreloadScript("crx-mv3-preload");
  ses.registerPreloadScript({ id: "crx-mv2-preload", type: "frame", filePath: file });
  ses.registerPreloadScript({ id: "crx-mv3-preload", type: "service-worker", filePath: file });
}

/* ------------------------------------------------------------ chrome.identity.launchWebAuthFlow */

// Extensions sign users in (e.g. "Continue with Google") by opening a login
// page and waiting for a redirect to https://<extension-id>.chromiumapp.org/.
function webAuthFlow(ses, extensionId, { url, interactive }) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(String(url));
    } catch {
      return reject(new Error("Invalid auth URL"));
    }
    if (target.protocol !== "https:") return reject(new Error("Auth URL must be https"));
    const redirectPrefix = `https://${extensionId}.chromiumapp.org/`;
    // Attached to the window you're in, so it stays in front of it instead of
    // ending up behind STRATA (the extension would wait for it forever).
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent,
      show: interactive !== false,
      title: "Sign in",
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      webPreferences: { session: ses, sandbox: true, contextIsolation: true },
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
    if (interactive !== false) win.once("ready-to-show", () => !win.isDestroyed() && (win.moveTop(), win.focus()));
    win.loadURL(target.toString()).catch(() => {});
  });
}

const idFrom = (u) => /^chrome-extension:\/\/([a-p]{32})\//.exec(u || "")?.[1];

let identityIpc = false;
function watchExtensionWorkers(rt) {
  // From extension pages (any profile: the sender's session picks the profile).
  if (!identityIpc) {
    identityIpc = true;
    ipcMain.handle("solanaos-identity-auth", (e, opts) => {
      const id = idFrom(e.senderFrame?.url);
      if (!id) throw new Error("Not an extension");
      return webAuthFlow(e.sender.session, id, opts || {});
    });
  }
  // From extension service workers (they have their own IPC channel).
  const seen = new WeakSet();
  rt.session.serviceWorkers.on("running-status-changed", ({ runningStatus, versionId }) => {
    if (runningStatus !== "starting") return;
    const worker = rt.session.serviceWorkers.getWorkerFromVersionID(versionId);
    const id = idFrom(worker?.scope);
    if (!worker || !id || seen.has(worker)) return;
    seen.add(worker);
    worker.ipc.handle("solanaos-identity-auth", (_e, opts) => webAuthFlow(rt.session, id, opts || {}));
  });
}

module.exports = { setHooks, getRuntime, dropRuntime, runtimeBySession, runtimes, slug };
