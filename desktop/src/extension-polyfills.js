// Preload for extension pages and service workers: adds Chrome APIs that
// Electron doesn't provide, so extensions that call them at startup (Phantom,
// Solflare, ...) don't crash with a blank popup.
// SPDX-License-Identifier: GPL-3.0-only
//
// Must be registered BEFORE electron-chrome-extensions, which freezes
// `chrome` after adding its own APIs.

const { contextBridge, ipcRenderer } = require("electron");

const isWorker = process.type === "service-worker";
const isExtensionPage = typeof location !== "undefined" && location.href.startsWith("chrome-extension://");

function polyfill(bridge) {
  const c = globalThis.chrome;
  if (!c || !c.runtime || !c.runtime.id) return;
  const id = c.runtime.id;
  let manifest = {};
  try {
    manifest = c.runtime.getManifest();
  } catch {
    /* not available */
  }
  const define = (name, value) => {
    if (c[name]) return;
    try {
      Object.defineProperty(c, name, { value, enumerable: true, configurable: true, writable: true });
    } catch {
      /* frozen */
    }
  };
  const event = () => {
    const ls = new Set();
    return { addListener: (f) => ls.add(f), removeListener: (f) => ls.delete(f), hasListener: (f) => ls.has(f), hasListeners: () => ls.size > 0, _emit: (...a) => ls.forEach((f) => f(...a)) };
  };
  // Callback-or-promise helper, like Chrome's APIs.
  const api = (fn) =>
    function (...args) {
      const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
      const p = Promise.resolve().then(() => fn(...args));
      if (!cb) return p;
      p.then((r) => cb(r), (e) => {
        try {
          c.runtime.lastError = { message: String(e && e.message ? e.message : e) };
        } catch {
          /* read-only */
        }
        cb(undefined);
      });
    };

  // chrome.identity: redirect URLs and web auth flows (used by "Sign in with Google/Apple").
  define("identity", {
    getRedirectURL: (path) => `https://${id}.chromiumapp.org/${String(path || "").replace(/^\//, "")}`,
    launchWebAuthFlow: api(async (details) => {
      if (!details || !details.url) throw new Error("url is required");
      return bridge.launchWebAuthFlow(String(details.url), `https://${id}.chromiumapp.org/`, details.interactive !== false);
    }),
    getAuthToken: api(async () => {
      throw new Error("Google account sign-in isn't available in this browser. Use the extension's other sign-in options.");
    }),
    removeCachedAuthToken: api(async () => undefined),
    clearAllCachedAuthTokens: api(async () => undefined),
    getProfileUserInfo: api(async () => ({ email: "", id: "" })),
    getAccounts: api(async () => []),
    onSignInChanged: event(),
  });

  // chrome.sidePanel: open the extension's side panel page in its own window.
  const sidePanelPath = manifest.side_panel && manifest.side_panel.default_path;
  let panelOptions = { enabled: Boolean(sidePanelPath), path: sidePanelPath };
  let panelBehavior = { openPanelOnActionClick: false };
  define("sidePanel", {
    setOptions: api(async (o) => {
      panelOptions = { ...panelOptions, ...(o || {}) };
    }),
    getOptions: api(async () => ({ ...panelOptions })),
    setPanelBehavior: api(async (b) => {
      panelBehavior = { ...panelBehavior, ...(b || {}) };
    }),
    getPanelBehavior: api(async () => ({ ...panelBehavior })),
    open: api(async () => {
      const path = panelOptions.path || sidePanelPath;
      if (!path || !c.windows || !c.windows.create) return;
      await c.windows.create({ url: c.runtime.getURL(path), type: "popup", width: 400, height: 720 });
    }),
    onOpened: event(),
    onClosed: event(),
  });

  // Rarely used APIs that some wallets touch at startup: harmless stand-ins.
  define("idle", {
    queryState: api(async () => "active"),
    setDetectionInterval: () => {},
    onStateChanged: event(),
  });
  define("declarativeNetRequest", {
    MAX_NUMBER_OF_DYNAMIC_RULES: 5000,
    MAX_NUMBER_OF_SESSION_RULES: 5000,
    updateDynamicRules: api(async () => undefined),
    updateSessionRules: api(async () => undefined),
    updateEnabledRulesets: api(async () => undefined),
    getDynamicRules: api(async () => []),
    getSessionRules: api(async () => []),
    getEnabledRulesets: api(async () => []),
    isRegexSupported: api(async () => ({ isSupported: true })),
    onRuleMatchedDebug: event(),
  });
  define("system", {
    display: { getInfo: api(async () => []) },
    cpu: { getInfo: api(async () => ({ numOfProcessors: 4, archName: "", modelName: "", features: [], processors: [] })) },
    memory: { getInfo: api(async () => ({ capacity: 0, availableCapacity: 0 })) },
  });
  define("fontSettings", { getFontList: api(async () => []) });

  // Newer Chromium also exposes the extension APIs as a separate `browser`
  // object, which doesn't get the APIs added here or by
  // electron-chrome-extensions. Wallets that use `browser.*` (Phantom,
  // Solflare) then crash, so make `browser` the same object as `chrome`.
  try {
    if (globalThis.browser !== c) Object.defineProperty(globalThis, "browser", { value: c, configurable: true, writable: true, enumerable: false });
  } catch {
    /* not configurable */
  }
}

// launchWebAuthFlow runs in the main process (it opens a login window).
const bridge = {
  launchWebAuthFlow: (url, redirectPrefix, interactive) => ipcRenderer.invoke("solanaos-identity-auth", { url, redirectPrefix, interactive }),
};

if (isWorker || isExtensionPage) {
  try {
    // `polyfill` is serialized and run in the page's own world; `bridge`'s
    // function is proxied back to this preload.
    contextBridge.executeInMainWorld({ func: polyfill, args: [bridge] });
  } catch (err) {
    console.error("[solana-os] extension polyfills failed", err);
  }
}

module.exports = { polyfill };
