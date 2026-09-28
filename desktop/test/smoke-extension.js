// Smoke test: loads a local MV3 "wallet-like" extension into the browser session
// and checks the content script runs in tabs and the toolbar action appears.
// Run: xvfb-run -a npx electron test/smoke-extension.js
const path = require("node:path");
const fs = require("node:fs");
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
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SMOKE_OUT || "smoke-ext.png", img.toPNG());
      result.ok = result.contentScript === "injected" && result.toolbarActions > 0 && result.desktopUA === true;
    } catch (e) {
      result.error = String(e && e.stack || e);
    }
    console.log("SMOKE " + JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  }, 8000);
});
