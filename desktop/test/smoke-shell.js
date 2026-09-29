// Smoke test for the browser chrome: real mouse clicks on tab close buttons,
// keyboard shortcuts, the ⋮ menu, and the STRATA extensions bridge.
// Run: xvfb-run -a npx electron test/smoke-shell.js
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

// Two local sites: the "STRATA" home (gets the bridge) and another site (must not).
const page = (title) => `<!doctype html><title>${title}</title><body style="background:#111;color:#eee">${title}</body>`;
const home = http.createServer((_q, r) => r.end(page("Home"))).listen(0);
const other = http.createServer((_q, r) => r.end(page("Other"))).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;
const OTHER = `http://127.0.0.1:${other.address().port}`;

const { app, BrowserWindow, Menu, dialog } = require("electron");
require("../src/main.js");

// Never block on dialogs in the test.
dialog.showMessageBox = async () => ({ response: 1 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const fail = (msg) => {
  console.log(JSON.stringify({ ok: false, error: msg, results }, null, 2));
  app.exit(1);
};

async function click(wc, selector) {
  const rect = await wc.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  wc.sendInputEvent({ type: "mouseMove", x, y });
  wc.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
  await wait(60); // let the state round-trip re-render the tab strip mid-click
  wc.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
  await wait(400);
}
const key = async (wc, keyCode, modifiers = []) => {
  wc.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  wc.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  await wait(500);
};
const tabCount = (wc) => wc.executeJavaScript("document.querySelectorAll('#tabs .tab').length");

app.whenReady().then(async () => {
  await wait(3000);
  const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith("shell.html"));
  if (!win) return fail("no browser window");
  const shell = win.webContents;
  results.menuBar = process.platform === "darwin" ? "n/a" : win.isMenuBarVisible() ? "visible" : "hidden";

  // Ctrl+T twice from the toolbar -> 3 tabs.
  await key(shell, "T", ["control"]);
  await key(shell, "T", ["control"]);
  results.afterCtrlT = await tabCount(shell);

  // Real clicks on the close button of the last tab, then the active one.
  await click(shell, "#tabs .tab:last-child .close");
  results.afterCloseClick = await tabCount(shell);
  await click(shell, "#tabs .tab.active .close");
  results.afterSecondClose = await tabCount(shell);

  // Ctrl+W from inside the page closes the tab (then the window, if it was the last).
  await key(shell, "T", ["control"]);
  await wait(800);
  const pageWc = require("../src/window").shellFor(win.webContents)?.activeTab?.view.webContents;
  if (!pageWc) return fail("no active tab");
  await key(pageWc, "W", ["control"]);
  results.afterCtrlWInPage = await tabCount(shell);

  // The ⋮ menu: STRATA's own Chrome-style menu window.
  const menuWins = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.getURL().endsWith("/ui/menu.html"));
  const tabsBeforeMenu = await tabCount(shell);
  await click(shell, "#menu");
  await wait(700);
  const root = menuWins()[0];
  if (!root) return fail("⋮ menu did not open");
  const labels = () => root.webContents.executeJavaScript("[...document.querySelectorAll('.row .label')].map((e) => e.textContent)");
  results.menu = await labels();
  results.menuVisible = root.isVisible();
  results.menuHasZoomRow = await root.webContents.executeJavaScript("Boolean(document.querySelector('.row.zoom .val'))");
  results.menuIcons = await root.webContents.executeJavaScript("document.querySelectorAll('.row .ic svg').length");
  // Hovering History opens its submenu beside the menu.
  const rowPos = (label) => root.webContents.executeJavaScript(`(() => { const r = [...document.querySelectorAll('.row')].find((e) => e.querySelector('.label')?.textContent === ${JSON.stringify(label)}).getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; })()`);
  const h = await rowPos("History");
  root.webContents.sendInputEvent({ type: "mouseMove", x: h.x, y: h.y });
  await wait(700);
  results.submenuOpened = menuWins().length === 2;
  // Clicking "New tab" runs it and closes the menu.
  const n = await rowPos("New tab");
  root.webContents.sendInputEvent({ type: "mouseMove", x: n.x, y: n.y });
  root.webContents.sendInputEvent({ type: "mouseDown", x: n.x, y: n.y, button: "left", clickCount: 1 });
  root.webContents.sendInputEvent({ type: "mouseUp", x: n.x, y: n.y, button: "left", clickCount: 1 });
  await wait(700);
  results.menuClosedAfterClick = menuWins().length === 0;
  results.newTabFromMenu = (await tabCount(shell)) === tabsBeforeMenu + 1;

  // Bridge: present on the home site, absent elsewhere; bad IDs refused.
  const tab = require("../src/window").shellFor(win.webContents).activeTab.view.webContents;
  await tab.loadURL(process.env.SOLANA_OS_URL);
  results.bridgeOnHome = await tab.executeJavaScript("typeof window.solanaOSDesktop");
  results.extensionsList = await tab.executeJavaScript("window.solanaOSDesktop.extensions()");
  results.badInstall = await tab.executeJavaScript("window.solanaOSDesktop.installExtension('../../etc', 'x')");
  results.cancelledInstall = await tab.executeJavaScript("window.solanaOSDesktop.installExtension('bfnaelmomeimhlpmgjnjophhpkkoljpa', 'Phantom')");
  await tab.loadURL(OTHER);
  results.bridgeOnOther = await tab.executeJavaScript("typeof window.solanaOSDesktop");

  try {
    fs.writeFileSync(process.env.SMOKE_OUT || path.join(__dirname, "..", "smoke-shell.png"), (await shell.capturePage()).toPNG());
  } catch {}

  const ok =
    results.afterCtrlT === 3 &&
    results.afterCloseClick === 2 &&
    results.afterSecondClose === 1 &&
    results.afterCtrlWInPage === 1 &&
    Array.isArray(results.menu) && results.menu.includes("New tab") && results.menuHasZoomRow && results.menuIcons > 5 &&
    results.submenuOpened && results.menuClosedAfterClick && results.newTabFromMenu &&
    results.bridgeOnHome === "object" &&
    Array.isArray(results.extensionsList) &&
    results.badInstall?.ok === false &&
    results.cancelledInstall?.cancelled === true &&
    results.bridgeOnOther === "undefined" &&
    (process.platform === "darwin" || results.menuBar === "hidden");
  console.log(JSON.stringify({ ok, results }, null, 2));
  app.exit(ok ? 0 : 1);
});
