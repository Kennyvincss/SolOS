// Clicking an extension that has no toolbar popup opens its page as a popup
// window (not a tab); the same page opened without a click still gets a tab.
// Also saves a screenshot of the toolbar's extension area (OUT_DIR).
// Run: xvfb-run -a npx electron test/smoke-ext-click-popup.js
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title><body>home</body>")).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;

const { app, BrowserWindow, session } = require("electron");
require("../src/main.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const ses = session.fromPartition("persist:solanaos");
    const ext = await ses.extensions.loadExtension(path.join(__dirname, "fixtures", "click-page"));
    const s = [...require("../src/window").shells][0];
    // Start the extension through one of its pages, as smoke-ext-windows does (a
    // freshly loaded unpacked extension's worker otherwise starts without the APIs).
    const driver = s.newTab(`chrome-extension://${ext.id}/page.html?driver=1`);
    await new Promise((r) => (driver.isLoading() ? driver.once("did-finish-load", r) : r()));
    await wait(1500);
    const tabsBefore = s.tabs.size;
    const winsBefore = new Set(BrowserWindow.getAllWindows());
    // Click the extension's toolbar icon.
    s.profile.extensions.api.browserAction.activateClick({ extensionId: ext.id, tabId: s.activeId, anchorRect: { x: 900, y: 40, width: 30, height: 30 }, alignment: "bottom left" });
    let pop = null;
    for (let i = 0; i < 40 && !pop; i++) {
      await wait(100);
      pop = BrowserWindow.getAllWindows().find((w) => !winsBefore.has(w) && /page\.html/.test(w.webContents.getURL()));
    }
    check("clicking it opens the extension's page in a popup", pop && pop.isVisible(), pop?.webContents.getURL());
    check("no new tab", s.tabs.size === tabsBefore, s.tabs.size);
    if (pop) {
      const b = pop.getContentBounds();
      check("popup is popup-sized", b.width <= 400 && b.height <= 640, b);
      pop.close();
      await wait(400);
    }
    // Without a click: a tab, as before.
    const tabs2 = s.tabs.size;
    await driver.executeJavaScript(`chrome.runtime.sendMessage("open-tab"); true`).catch(() => {});
    for (let i = 0; i < 30 && s.tabs.size === tabs2; i++) await wait(100);
    check("opened without a click, it's still a tab", s.tabs.size === tabs2 + 1, s.tabs.size);

    // Toolbar screenshot (extension capsule).
    s.selectTab(driver.id);
    await wait(600);
    const [w] = s.win.getContentSize();
    const shot = await s.win.webContents.capturePage({ x: Math.max(0, w - 560), y: 0, width: 560, height: 100 });
    fs.writeFileSync(path.join(process.env.OUT_DIR || require("node:os").tmpdir(), "toolbar.png"), shot.toPNG());
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[ext-click] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
