// Popup windows opened by pages with window.open(url, name, "width=…,height=…"),
// e.g. "Continue with Google" or a wallet's sign-in. Like Chrome, these are
// small windows linked to the page that opened them (window.opener), so the
// sign-in can report back and close itself. Opening them as a new browser
// window or tab cut that link and left the sign-in on a blank page.
// SPDX-License-Identifier: GPL-3.0-only

const { screen } = require("electron");
const { hostOf, popupFeatures } = require("./lib");

/** Options for a popup child window, placed over `over` unless the page chose a position. */
function popupWindowOptions(features, over) {
  const f = popupFeatures(features) ?? { width: 500, height: 640 };
  const ref = over && !over.isDestroyed() ? over.getBounds() : screen.getPrimaryDisplay().workArea;
  let x = Number.isFinite(f.left) ? f.left : Math.round(ref.x + (ref.width - f.width) / 2);
  let y = Number.isFinite(f.top) ? f.top : Math.round(ref.y + Math.max(40, (ref.height - f.height) / 2));
  const area = screen.getDisplayMatching({ x, y, width: f.width, height: f.height }).workArea;
  x = Math.min(Math.max(x, area.x), area.x + Math.max(0, area.width - f.width));
  y = Math.min(Math.max(y, area.y), area.y + Math.max(0, area.height - f.height));
  return {
    x,
    y,
    width: Math.min(f.width, area.width),
    height: Math.min(f.height, area.height),
    useContentSize: true,
    autoHideMenuBar: true,
    fullscreenable: false,
    backgroundColor: "#ffffff",
    title: "Sign in",
  };
}

/**
 * Set up a popup window created for a page. `openElsewhere(url, disposition)`
 * opens links the popup sends to a new tab/window in the browser.
 */
function setupPopup(win, openElsewhere) {
  win.setMenu?.(null);
  const wc = win.webContents;
  // Show which site the popup is on (it has no address bar).
  const title = () => {
    if (win.isDestroyed()) return;
    const host = hostOf(wc.getURL()) || "";
    const page = wc.getTitle() || "";
    win.setTitle(host && page && page !== host ? `${host} — ${page}` : host || page || "Sign in");
  };
  wc.on("page-title-updated", (e) => {
    e.preventDefault();
    title();
  });
  wc.on("did-navigate", title);
  wc.setWindowOpenHandler((details) => handleWindowOpen(details, win, openElsewhere));
  wc.on("did-create-window", (child) => setupPopup(child, openElsewhere));
}

/** Window-open handler shared by tabs and popups. */
function handleWindowOpen({ url, disposition, features }, over, openElsewhere) {
  if (url.startsWith("chrome-extension://")) return { action: "allow" };
  if (disposition === "new-window" && popupFeatures(features)) {
    return { action: "allow", overrideBrowserWindowOptions: popupWindowOptions(features, over) };
  }
  openElsewhere(url, disposition);
  return { action: "deny" };
}

module.exports = { popupWindowOptions, setupPopup, handleWindowOpen };
