// Checks chrome.windows the way wallet extensions use it for approval popups:
// the popup opens on screen and in front, knows its own window, can be brought
// back to the front, and reads as gone once closed.
// Run: xvfb-run -a npx electron test/smoke-ext-windows.js
const path = require("node:path");
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
    const ext = await ses.extensions.loadExtension(path.join(__dirname, "fixtures", "popup-wallet"));
    const shell = [...require("../src/window").shells][0];
    const browser = shell.win;
    const base = `chrome-extension://${ext.id}`;

    // An extension page in a tab plays the wallet's background logic.
    const driverWc = shell.newTab(`${base}/driver.html`);
    await new Promise((r) => (driverWc.isLoading() ? driverWc.once("did-finish-load", r) : r()));
    await wait(500);
    const run = (code) => { console.log("[ext-windows] run", code.slice(0, 60)); return Promise.race([driverWc.executeJavaScript(`(async () => { ${code} })()`), wait(8000).then(() => { throw new Error("timed out: " + code.slice(0, 60)); })]); };
    console.log("[ext-windows] driver", driverWc.getURL(), await driverWc.executeJavaScript("typeof chrome.windows + ' ' + typeof chrome.windows?.create"));

    // 1. Create a popup at a position off every screen (wallets compute it from the last window).
    const before = new Set(BrowserWindow.getAllWindows());
    const created = await run(`return await chrome.windows.create({ url: "approve.html", type: "popup", width: 360, height: 600, left: -5000, top: -5000 });`);
    await wait(800);
    const popup = BrowserWindow.getAllWindows().find((w) => !before.has(w));
    check("popup window opens", popup && created?.id === popup.id, { created, popup: popup?.id });
    check("create reports type popup", created?.type === "popup", created?.type);
    if (popup) {
      const pb = popup.getBounds();
      const { screen } = require("electron");
      const area = screen.getDisplayMatching(pb).workArea;
      check("popup is on screen", pb.x >= area.x && pb.y >= area.y && pb.x + pb.width <= area.x + area.width && pb.y + pb.height <= area.y + area.height, { pb, area });
      check("popup is visible", popup.isVisible());

      // 2. The popup asks which window it is in while the browser window has focus.
      await new Promise((r) => (popup.webContents.isLoading() ? popup.webContents.once("did-finish-load", r) : r()));
      browser.focus();
      await wait(300);
      const current = await popup.webContents.executeJavaScript("chrome.windows.getCurrent()");
      check("getCurrent in the popup is the popup", current?.id === popup.id && current?.type === "popup", { current: current?.id, popup: popup.id, browser: browser.id });

      // 3. Bring it back to the front.
      browser.focus();
      await wait(300);
      const updated = await run(`return await chrome.windows.update(${popup.id}, { focused: true });`);
      await wait(400);
      check("update({ focused: true }) focuses the popup", popup.isFocused() || updated?.focused, { focused: popup.isFocused(), updated });

      // 4. The popup closes itself after the user approves.
      const id = popup.id;
      popup.webContents.executeJavaScript("chrome.windows.getCurrent().then((w) => chrome.windows.remove(w.id))").catch(() => {}); // the page goes away with its window
      await wait(800);
      check("popup closed", popup.isDestroyed());
      check("browser window still open", !browser.isDestroyed());
      const after = await run(`return (await chrome.windows.get(${id})) ?? null;`);
      check("get on the closed popup returns nothing", after === null || after === undefined, after);
      const last = await run(`return await chrome.windows.getLastFocused();`);
      check("getLastFocused still answers after the popup closed", last && last.id === browser.id, last);
      const all = await run(`return (await chrome.windows.getAll()).map((w) => w.id);`);
      check("getAll no longer lists the popup", Array.isArray(all) && !all.includes(id), all);

      // 5. A second request opens a fresh popup.
      const before2 = new Set(BrowserWindow.getAllWindows());
      const again = await run(`return await chrome.windows.create({ url: "approve.html", type: "popup", width: 360, height: 600 });`);
      await wait(800);
      const popup2 = BrowserWindow.getAllWindows().find((w) => !before2.has(w));
      check("second popup opens and has focus", popup2 && again?.id === popup2.id && popup2.isVisible(), { again, p2: popup2?.id });
      popup2?.close();
      await wait(500);

      // 6. Like a wallet: the request goes to the service worker, which opens the
      //    popup while the browser window has focus. Twice in a row.
      const beat = { last: Date.now(), worst: 0 };
      const hb = setInterval(() => { const now = Date.now(); beat.worst = Math.max(beat.worst, now - beat.last); beat.last = now; }, 100);
      for (const round of [1, 2]) {
        browser.focus();
        await wait(200);
        const before3 = new Set(BrowserWindow.getAllWindows());
        const resp = await run(`return await chrome.runtime.sendMessage({ type: "open-popup" });`);
        await wait(800);
        const p3 = BrowserWindow.getAllWindows().find((w) => !before3.has(w));
        const opened = BrowserWindow.getAllWindows().find((w) => w.id === resp?.id);
        check(`worker-opened popup ${round} shows`, opened && opened.isVisible() && !before3.has(opened), { resp, p3: p3?.id });
        if (opened && opened !== p3) opened.close();
        p3?.close();
        await wait(500);
      }
      clearInterval(hb);
      check("main process never stalls (> 1 s)", beat.worst < 1000, beat.worst);
    }
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[ext-windows] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
