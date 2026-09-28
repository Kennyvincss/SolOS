// Diagnostic (needs internet, so it runs in GitHub Actions): installs real
// wallet extensions from the Chrome Web Store, opens their popups the way the
// toolbar does, and prints what rendered plus every console error from the
// popup and the extension's service worker. Also runs a store search.
// Run: xvfb-run -a npx electron --no-sandbox test/check-real-extensions.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title><body>home</body>")).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;

const { app, BrowserWindow, session } = require("electron");
require("../src/main.js");
const { installExtension } = require("electron-chrome-web-store");
const { searchWebStore } = require("../src/webstore-search");

const IDS = (process.env.EXT_IDS || "bfnaelmomeimhlpmgjnjophhpkkoljpa,bhhhlbepdkbapadjdnnojkbgioiodbic,aflkmfhebedbjioipglgcbcmnbpgliof").split(",");
const OUT = process.env.OUT_DIR || path.join(__dirname, "..", "diag");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[diag]", ...a);

const consoleByUrl = [];
app.on("web-contents-created", (_e, wc) => {
  wc.on("console-message", (d) => {
    if (d.level === "error" || d.level === "warning") consoleByUrl.push(`${d.level} ${wc.getURL().slice(0, 80)} :: ${String(d.message).slice(0, 300)}`);
  });
  wc.on("render-process-gone", (_ev, d) => consoleByUrl.push(`render-process-gone ${wc.getURL()} ${d.reason}`));
});

app.whenReady().then(async () => {
  await sleep(4000);
  const ses = session.fromPartition("persist:solanaos");
  ses.serviceWorkers.on("console-message", (_e, d) => consoleByUrl.push(`sw ${d.sourceUrl?.slice(0, 80)} :: ${String(d.message).slice(0, 300)}`));

  // 1) Store search.
  try {
    const t = Date.now();
    const results = await searchWebStore(ses, "solana wallet", { limit: 40 });
    log("SEARCH", JSON.stringify({ ms: Date.now() - t, count: results.length, sample: results.slice(0, 6) }));
    if (!results.length) {
      // What did the store page look like?
      const w = new BrowserWindow({ show: false, width: 1280, height: 2000, webPreferences: { session: ses, backgroundThrottling: false } });
      await w.loadURL("https://chromewebstore.google.com/search/solana%20wallet?hl=en");
      await sleep(8000);
      const info = await w.webContents.executeJavaScript(`({ url: location.href, title: document.title, anchors: document.querySelectorAll("a").length, detail: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h && h.includes("detail")).slice(0, 8), text: document.body.innerText.slice(0, 1500), html: document.body.innerHTML.slice(0, 3000) })`);
      log("SEARCH-PAGE", JSON.stringify(info));
      w.destroy();
    }
  } catch (e) {
    log("SEARCH-ERROR", e.stack || e);
  }

  // 2) Install and open each extension's popup.
  for (const id of IDS) {
    consoleByUrl.length = 0;
    try {
      const ext = await installExtension(id, { session: ses });
      const m = ext.manifest;
      log("INSTALLED", JSON.stringify({ id, name: ext.name, version: ext.version, mv: m.manifest_version, popup: m.action?.default_popup || m.browser_action?.default_popup, permissions: m.permissions, sw: m.background?.service_worker }));
      await sleep(5000); // let the service worker start
      const popupPath = m.action?.default_popup || m.browser_action?.default_popup;
      if (popupPath) {
        const win = new BrowserWindow({ width: 360, height: 600, show: true, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
        await win.loadURL(`chrome-extension://${id}/${popupPath}`).catch((e) => log("POPUP-LOAD-ERROR", id, String(e)));
        await sleep(8000);
        const info = await win.webContents
          .executeJavaScript(`({ text: document.body ? document.body.innerText.slice(0, 200) : null, html: document.body ? document.body.innerHTML.length : 0, apis: Object.keys(chrome || {}).sort().join(","), size: [innerWidth, innerHeight] })`)
          .catch((e) => ({ error: String(e) }));
        log("POPUP", id, JSON.stringify(info));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(OUT, `${id}.png`), img.toPNG());
        win.destroy();
      }
    } catch (e) {
      log("INSTALL-ERROR", id, e.stack || e);
    }
    log("CONSOLE", id, JSON.stringify(consoleByUrl.slice(0, 60), null, 1));
  }

  // 3) Real toolbar click on the first action (what users do).
  try {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith("shell.html"));
    const before = new Set(BrowserWindow.getAllWindows());
    const pt = await win.webContents.executeJavaScript("(() => { const el = document.querySelector('browser-action-list'); const b = el.shadowRoot.querySelector('.action, [part~=action]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
    win.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    win.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    await sleep(8000);
    const popup = BrowserWindow.getAllWindows().find((w) => !before.has(w));
    if (popup) {
      const info = await popup.webContents.executeJavaScript("({ url: location.href, text: document.body ? document.body.innerText.slice(0, 200) : null, size: [innerWidth, innerHeight] })").catch((e) => ({ error: String(e) }));
      log("TOOLBAR-POPUP", JSON.stringify({ visible: popup.isVisible(), bounds: popup.getBounds(), ...info }));
      fs.writeFileSync(path.join(OUT, "toolbar-popup.png"), (await popup.webContents.capturePage()).toPNG());
    } else log("TOOLBAR-POPUP none");
  } catch (e) {
    log("TOOLBAR-ERROR", e.stack || e);
  }
  app.exit(0);
});
