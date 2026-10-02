// Site permissions, like Chrome: a site gets the camera, microphone,
// location, notifications, clipboard reading, MIDI, ... only after you allow
// it, and STRATA remembers your choice for that site. (Electron's default is
// to grant everything without asking.) Decisions stay on this computer
// (permissions.json in the profile folder); they are never synced.
// SPDX-License-Identifier: GPL-3.0-only

const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow } = require("electron");
const prompt = require("./permission-prompt");
const { SOLANA_OS_URL } = require("./lib");

/** Granted without asking, as in Chrome. */
const ALWAYS = new Set(["fullscreen", "pointerLock", "keyboardLock", "clipboard-sanitized-write", "background-sync", "accessibility-events", "speaker-selection", "window-placement"]);
/** Asked for with a prompt; anything else is refused. */
const ASKABLE = {
  media: "use your camera or microphone",
  geolocation: "know your location",
  notifications: "show notifications",
  "clipboard-read": "see text and images you copy",
  midi: "use your MIDI devices",
  midiSysex: "control your MIDI devices",
  "idle-detection": "know when you're using this device",
  "persistent-storage": "store data permanently on this device",
  "storage-access": "use cookies and site data it saved while you visited other sites",
  "top-level-storage-access": "use cookies and site data it saved while you visited other sites",
  "local-fonts": "use the fonts on your computer",
  openExternal: "open an app on your computer",
  "display-capture": "see your screen",
};

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};
const homeOrigin = originOf(SOLANA_OS_URL);

/** STRATA's own pages and extension pages are trusted. */
function trusted(origin) {
  return origin === homeOrigin || origin.startsWith("chrome-extension://") || origin === "file://" || origin === "null";
}

/** What to ask for, e.g. "use your camera" or "use your microphone". */
function describe(permission, details) {
  if (permission === "media") {
    const t = details?.mediaTypes || [];
    if (t.includes("video") && t.includes("audio")) return "use your camera and microphone";
    if (t.includes("video")) return "use your camera";
    if (t.includes("audio")) return "use your microphone";
  }
  return ASKABLE[permission];
}

/** Key a decision is stored under (camera and microphone are separate, like Chrome). */
function keysFor(permission, details) {
  if (permission === "media") {
    const t = details?.mediaTypes?.length ? details.mediaTypes : ["video", "audio"];
    return t.map((x) => (x === "video" ? "camera" : x === "audio" ? "microphone" : `media-${x}`));
  }
  if (permission === "top-level-storage-access") return ["storage-access"];
  return [permission];
}

/**
 * Wire one profile's session. `dir` is the profile folder; `shellFor(wc)`
 * returns the browser window (shell) a tab is in, if any.
 */
function install(ses, dir, shellFor) {
  const file = path.join(dir, "permissions.json");
  let store = {};
  try {
    store = JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch {
    store = {};
  }
  const save = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(store, null, 1), { mode: 0o600 });
    } catch {
      /* best effort */
    }
  };
  const decision = (origin, key) => store[origin]?.[key];
  const remember = (origin, keys, value) => {
    store[origin] = { ...(store[origin] || {}) };
    for (const k of keys) store[origin][k] = value;
    save();
  };
  const pending = new Map(); // `${origin} ${keys}` -> Promise<boolean>

  const allowedNow = (origin, permission, details) => {
    if (trusted(origin) || ALWAYS.has(permission)) return true;
    if (!(permission in ASKABLE)) return false;
    return keysFor(permission, details).every((k) => decision(origin, k) === "allow");
  };

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    const origin = originOf(details?.requestingUrl || requestingOrigin) || requestingOrigin;
    return allowedNow(origin, permission, details);
  });

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = originOf(details?.requestingUrl || wc?.getURL?.() || "");
    if (allowedNow(origin, permission, details)) return callback(true);
    const what = describe(permission, details);
    const keys = keysFor(permission, details);
    if (!what || keys.some((k) => decision(origin, k) === "block")) return callback(false);
    // Ask once per site and permission at a time.
    const id = `${origin} ${keys.join(",")}`;
    if (!pending.has(id)) {
      const host = (() => {
        try {
          return new URL(origin).host;
        } catch {
          return origin;
        }
      })();
      // In the tab's browser window, under the address bar; in an extension
      // or sign-in popup, at the top of that popup.
      const shell = wc ? shellFor(wc) : null;
      const own = wc && !wc.isDestroyed() ? BrowserWindow.fromWebContents(wc) : null;
      const parent = shell?.win ?? own ?? BrowserWindow.getFocusedWindow();
      const anchor = shell && parent === shell.win ? () => ({ left: shell.sidebarWidth() + 104, top: shell.toolbarHeight() - 4 }) : null;
      const ask = prompt
        .ask(parent, { host, what, anchor })
        .then((answer) => {
          // Closing it without choosing asks again next time, like Chrome.
          if (answer === "dismiss") return false;
          remember(origin, keys, answer);
          return answer === "allow";
        })
        .catch(() => false)
        .finally(() => pending.delete(id));
      pending.set(id, ask);
    }
    pending.get(id).then(callback, () => callback(false));
  });

  // USB / HID / serial / Bluetooth devices: only STRATA's own pages and extensions (hardware wallets).
  ses.setDevicePermissionHandler?.((details) => trusted(originOf(details?.origin || "")));

  return {
    list: () => JSON.parse(JSON.stringify(store)),
    reset(origin) {
      if (origin) delete store[origin];
      else store = {};
      save();
    },
  };
}

module.exports = { install, ALWAYS, ASKABLE, trusted, keysFor };
