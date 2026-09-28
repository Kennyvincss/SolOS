// Smoke test: loads a local MV3 "wallet-like" extension into the browser session
// and checks the content script runs in tabs and the toolbar action appears.
// Run: xvfb-run -a npx electron test/smoke-extension.js
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

// Serve the home page locally so the test doesn't depend on the network.
const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title><body>home</body>")).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;

const { app, BrowserWindow, session } = require("electron");

require("../src/main.js");

app.whenReady().then(() => {
  setTimeout(async () => {
    const result = { ok: false };
    try {
      const ses = session.fromPartition("persist:solanaos");
      const ext = await ses.extensions.loadExtension(path.join(__dirname, "fixtures", "fake-wallet"));
      result.extension = ext.name;
      const win = BrowserWindow.getAllWindows()[0];
      const tab = win.contentView.children.find((v) => v.webContents)?.webContents;
      tab.reload();
      await new Promise((r) => tab.once("did-finish-load", r));
      await new Promise((r) => setTimeout(r, 1500));
      result.contentScript = await tab.executeJavaScript("document.documentElement.dataset.fakeWallet || null");
      result.desktopUA = await tab.executeJavaScript("/SolanaOSDesktop\\//.test(navigator.userAgent)");
      result.toolbarActions = await win.webContents.executeJavaScript(
        "(() => { const el = document.querySelector('browser-action-list'); return el && el.shadowRoot ? el.shadowRoot.querySelectorAll('.action, [part~=action]').length : -1 })()",
      );
      // Click the toolbar icon: the popup must open, render, and stay inside the
      // browser window (it opens leftwards from the icon at the right edge).
      const before = new Set(BrowserWindow.getAllWindows());
      const pt = await win.webContents.executeJavaScript(
        "(() => { const el = document.querySelector('browser-action-list'); const b = el.shadowRoot.querySelector('.action, [part~=action]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()",
      );
      win.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      win.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      let popup = null;
      for (let i = 0; i < 40 && !popup; i++) {
        await new Promise((r) => setTimeout(r, 150));
        popup = BrowserWindow.getAllWindows().find((w) => !before.has(w) && w.webContents.getURL().includes("popup.html") && w.isVisible());
      }
      if (popup) {
        const pb = popup.getBounds();
        const wb = win.getBounds();
        result.popup = { visible: true, bounds: pb, window: wb, text: await popup.webContents.executeJavaScript("document.body.innerText.trim().slice(0, 40)") };
        result.popupInsideWindow = pb.x >= wb.x && pb.x + pb.width <= wb.x + wb.width;
        // Chrome APIs Electron lacks are polyfilled in pages and the service worker.
        result.apis = await popup.webContents.executeJavaScript(
          "chrome.storage.local.get('swProbe').then((r) => ({ page: { identity: chrome.identity.getRedirectURL('x'), sidePanel: typeof chrome.sidePanel.open, tabsCreate: typeof chrome.tabs.create }, worker: r.swProbe || null }))",
        );
      } else result.popup = { visible: false };
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SMOKE_OUT || "smoke-ext.png", img.toPNG());
      result.ok = result.contentScript === "injected" && result.toolbarActions > 0 && result.desktopUA === true && result.popup.visible && result.popupInsideWindow &&
        /chromiumapp\.org\/x$/.test(result.apis?.page?.identity) && /chromiumapp\.org\/cb$/.test(result.apis?.worker?.identity || "") && result.apis.worker.sidePanel === true;
    } catch (e) {
      result.error = String(e && e.stack || e);
    }
    console.log("SMOKE " + JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  }, 8000);
});
