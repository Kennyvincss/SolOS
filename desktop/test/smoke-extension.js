// Smoke test: loads a local MV3 "wallet-like" extension into the browser session
// and checks the content script runs in tabs and the toolbar action appears.
// Run: xvfb-run -a npx electron test/smoke-extension.js
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

// Serve the home page locally so the test doesn't depend on the network.
const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title><body>home</body>")).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;

const { app, BrowserWindow, Menu, session } = require("electron");

require("../src/main.js");

app.whenReady().then(() => {
  setTimeout(async () => {
    const result = { ok: false };
    try {
      const ses = session.fromPartition("persist:solanaos");
      const ext = await ses.extensions.loadExtension(path.join(__dirname, "fixtures", "fake-wallet"));
      result.extension = ext.name;
      const shell = [...require("../src/window").shells][0];
      const win = shell.win;
      const tab = shell.activeTab.view.webContents;
      tab.reload();
      await new Promise((r) => tab.once("did-finish-load", r));
      await new Promise((r) => setTimeout(r, 1500));
      result.contentScript = await tab.executeJavaScript("document.documentElement.dataset.fakeWallet || null");
      result.desktopUA = await tab.executeJavaScript("/Chrome\\/\\d+\\.0\\.0\\.0 Safari\\/537\\.36$/.test(navigator.userAgent) && !/Electron|SolanaOS/.test(navigator.userAgent)");
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
          "chrome.storage.local.get('swProbe').then((r) => ({ page: { identity: chrome.identity.getRedirectURL('x'), sidePanel: typeof chrome.sidePanel.open, tabsCreate: typeof chrome.tabs.create, browserIsChrome: typeof browser === 'undefined' || browser === chrome }, worker: r.swProbe || null }))",
        );
        // Like Phantom's approval window: chrome.windows.create with a relative URL.
        const beforeApprove = new Set(BrowserWindow.getAllWindows());
        await popup.webContents.executeJavaScript("chrome.windows.create({ url: 'popup.html?approve=1', type: 'popup', width: 360, height: 600 }).then(() => true)").catch((e) => String(e));
        let approve = null;
        for (let i = 0; i < 30 && !approve; i++) {
          await new Promise((r) => setTimeout(r, 200));
          approve = BrowserWindow.getAllWindows().find((w) => !beforeApprove.has(w) && w.webContents.getURL().includes("popup.html?approve=1"));
        }
        result.approvalWindow = approve ? approve.webContents.getURL() : null;
      } else result.popup = { visible: false };
      // Right-click the toolbar icon: our menu with Hide and Remove, and Hide works.
      let menu = null;
      const popmenu = require("../src/popmenu");
      const origShow = popmenu.show;
      popmenu.show = (m) => {
        menu = m;
      };
      win.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "right", clickCount: 1 });
      win.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "right", clickCount: 1 });
      for (let i = 0; i < 20 && !menu; i++) await new Promise((r) => setTimeout(r, 150));
      popmenu.show = origShow;
      result.contextMenu = menu ? menu.items.map((i) => i.label).filter(Boolean) : null;
      const hide = menu?.items.find((i) => i.label === "Unpin");
      if (hide) {
        hide.click();
        await new Promise((r) => setTimeout(r, 800));
        result.hiddenAfterClick = await win.webContents.executeJavaScript(
          "(() => { const b = document.querySelector('browser-action-list').shadowRoot.querySelector('.action, [part~=action]'); return b ? getComputedStyle(b).display === 'none' : true })()",
        );
      }
      // The puzzle-piece Extensions panel: lists the extension, re-pins it, and opens its popup.
      const openPanel = async () => {
        const known = new Set(BrowserWindow.getAllWindows());
        const r = await win.webContents.executeJavaScript("(() => { const r = document.getElementById('extensions').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
        win.webContents.sendInputEvent({ type: "mouseDown", x: r.x, y: r.y, button: "left", clickCount: 1 });
        win.webContents.sendInputEvent({ type: "mouseUp", x: r.x, y: r.y, button: "left", clickCount: 1 });
        for (let i = 0; i < 30; i++) {
          await new Promise((res) => setTimeout(res, 150));
          const w = BrowserWindow.getAllWindows().find((x) => !known.has(x) && x.webContents.getURL().endsWith("extensions-panel.html") && x.isVisible());
          if (w) return w;
        }
        return null;
      };
      const panel = await openPanel();
      if (panel) {
        const pb = panel.getBounds();
        const wb = win.getBounds();
        result.panel = {
          rows: await panel.webContents.executeJavaScript("[...document.querySelectorAll('#list li .open span')].map((s) => s.textContent)"),
          pinnedBefore: await panel.webContents.executeJavaScript("document.querySelector('#list .pin').classList.contains('on')"),
          inside: pb.x >= wb.x && pb.x + pb.width <= wb.x + wb.width,
          hasIcon: await panel.webContents.executeJavaScript("Boolean(document.querySelector('#list img'))"),
        };
        if (process.env.PANEL_OUT) fs.writeFileSync(process.env.PANEL_OUT, (await panel.webContents.capturePage()).toPNG());
        await panel.webContents.executeJavaScript("document.querySelector('#list .pin').click()");
        await new Promise((res) => setTimeout(res, 800));
        result.panel.pinnedAfter = await panel.webContents.executeJavaScript("document.querySelector('#list .pin').classList.contains('on')");
        result.panel.toolbarShowsAfterPin = await win.webContents.executeJavaScript(
          "(() => { const b = document.querySelector('browser-action-list').shadowRoot.querySelector('.action, [part~=action]'); return Boolean(b) && getComputedStyle(b).display !== 'none' })()",
        );
        const beforeOpen = new Set(BrowserWindow.getAllWindows());
        await panel.webContents.executeJavaScript("document.querySelector('#list .open').click()");
        let pop = null;
        for (let i = 0; i < 30 && !pop; i++) {
          await new Promise((res) => setTimeout(res, 150));
          pop = BrowserWindow.getAllWindows().find((w) => !beforeOpen.has(w) && w.webContents.getURL().includes("popup.html") && w.isVisible());
        }
        result.panel.popupFromPanel = Boolean(pop);
        result.panel.closedAfterOpen = panel.isDestroyed();
      } else result.panel = null;
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SMOKE_OUT || "smoke-ext.png", img.toPNG());
      result.ok = result.contentScript === "injected" && result.toolbarActions > 0 && result.desktopUA === true && result.popup.visible && result.popupInsideWindow && /^chrome-extension:\/\/[a-p]{32}\/popup\.html\?approve=1$/.test(result.approvalWindow || "") &&
        /chromiumapp\.org\/x$/.test(result.apis?.page?.identity) && /chromiumapp\.org\/cb$/.test(result.apis?.worker?.identity || "") && result.apis.worker.sidePanel === true && result.apis.worker.browserIsChrome === true && result.apis.page.browserIsChrome === true &&
        Array.isArray(result.contextMenu) && result.contextMenu.includes("Unpin") && result.contextMenu.includes("Remove from STRATA…") && result.hiddenAfterClick === true &&
        result.panel?.rows?.includes("Fake Wallet (test)") && result.panel.pinnedBefore === false && result.panel.pinnedAfter === true && result.panel.toolbarShowsAfterPin === true && result.panel.popupFromPanel === true && result.panel.closedAfterOpen === true && result.panel.inside === true;
    } catch (e) {
      result.error = String(e && e.stack || e);
    }
    console.log("SMOKE " + JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  }, 8000);
});
