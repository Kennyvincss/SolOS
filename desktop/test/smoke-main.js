// Smoke test: boots the real app, waits, screenshots the window, then quits.
// Run: xvfb-run -a npx electron test/smoke-main.js
const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, webContents } = require("electron");

require("../src/main.js");

const out = process.env.SMOKE_OUT || path.join(__dirname, "..", "smoke.png");
const errors = [];
app.on("web-contents-created", (_e, wc) => {
  wc.on("console-message", (details) => {
    if (details.level === "error") errors.push(`${wc.getURL()}: ${details.message}`);
  });
  wc.on("render-process-gone", (_ev, d) => errors.push(`render process gone: ${d.reason}`));
});

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const tabs = webContents.getAllWebContents().map((w) => ({ id: w.id, url: w.getURL(), type: w.getType() }));
    const img = await win.webContents.capturePage();
    // capturePage on the window only includes the toolbar; composite by capturing the tab too.
    const tab = win.contentView.children.find((v) => v.webContents)?.webContents;
    const tabImg = tab ? await tab.capturePage() : null;
    fs.writeFileSync(out, img.toPNG());
    if (tabImg) fs.writeFileSync(out.replace(/\.png$/, "-tab.png"), tabImg.toPNG());
    console.log(JSON.stringify({ ok: true, windows: BrowserWindow.getAllWindows().length, tabs, errors }, null, 2));
    app.exit(0);
  }, Number(process.env.SMOKE_WAIT || 9000));
});
