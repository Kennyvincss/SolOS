// Does Google's sign-in accept this browser? (needs internet; GitHub Actions)
// Types a made-up address on accounts.google.com and presses Next: Google then
// either refuses the browser ("This browser or app may not be secure") or goes
// on ("Couldn't find your Google Account", password, ...). No real account used.
// Env: MODE=strata (the app) | bare (plain Electron window); UA=chrome|full|firefox|edge; BRAND=1.
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");

const MODE = process.env.MODE || "bare";
const major = process.versions.chrome.split(".")[0];
const plat = { linux: "X11; Linux x86_64", win32: "Windows NT 10.0; Win64; x64", darwin: "Macintosh; Intel Mac OS X 10_15_7" }[process.platform];
const UAS = {
  chrome: `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
  full: `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
  firefox: `Mozilla/5.0 (${process.platform === "win32" ? "Windows NT 10.0; Win64; x64" : process.platform === "darwin" ? "Macintosh; Intel Mac OS X 10.15" : "X11; Linux x86_64"}; rv:140.0) Gecko/20100101 Firefox/140.0`,
  edge: `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
};
const tag = `[google MODE=${MODE} POPUP=${process.env.POPUP || 0} UA=${process.env.UA || "-"} BRAND=${process.env.BRAND || 0}]`;
const SIGNIN = "https://accounts.google.com/ServiceLogin?hl=en&continue=https://www.google.com/";
let opener = null;
if (MODE === "bare" && process.env.UA) app.userAgentFallback = UAS[process.env.UA];
if (MODE === "strata") {
  const http = require("node:http");
  const home = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(q.url.startsWith("/site") ? `<!doctype html><title>Site</title><button id="g" style="width:300px;height:100px">Continue with Google</button><script>document.getElementById("g").onclick = () => window.open(${JSON.stringify(SIGNIN)}, "google", "width=500,height=650");</script>` : "<!doctype html><title>Home</title>home"); }).listen(0);
  opener = `http://127.0.0.1:${home.address().port}/site`;
  process.env.SOLANA_OS_URL = `http://127.0.0.1:${home.address().port}`;
  if (process.env.UA) process.env.STRATA_TEST_UA = UAS[process.env.UA];
  require("../src/main.js");
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function brand(wc) {
  const full = process.versions.chrome;
  const meta = {
    brands: [{ brand: "Chromium", version: major }, { brand: "Google Chrome", version: major }, { brand: "Not A(Brand", version: "99" }],
    fullVersionList: [{ brand: "Chromium", version: full }, { brand: "Google Chrome", version: full }, { brand: "Not A(Brand", version: "99.0.0.0" }],
    fullVersion: full, platform: { linux: "Linux", win32: "Windows", darwin: "macOS" }[process.platform], platformVersion: "", architecture: "x86", model: "", mobile: false, bitness: "64", wow64: false,
  };
  const dbg = wc.debugger;
  dbg.attach("1.3");
  const params = { userAgent: wc.getUserAgent(), userAgentMetadata: meta };
  dbg.on("message", (_e, m, p) => {
    if (m !== "Target.attachedToTarget") return;
    dbg.sendCommand("Emulation.setUserAgentOverride", params, p.sessionId).catch(() => {}).finally(() => dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, p.sessionId).catch(() => {}));
  });
  await dbg.sendCommand("Emulation.setUserAgentOverride", params);
  await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
}

app.whenReady().then(async () => {
  let wc;
  if (MODE === "strata") {
    await wait(2500);
    const s = [...require("../src/window").shells][0];
    if (process.env.POPUP) {
      // Like "Continue with Google": the site opens Google's sign-in in a popup.
      const site = s.newTab(opener);
      await new Promise((r) => (site.isLoading() ? site.once("did-finish-load", r) : r()));
      await wait(500);
      const before = new Set(BrowserWindow.getAllWindows());
      const b = await site.executeJavaScript("(() => { const r = document.getElementById('g').getBoundingClientRect(); return { x: Math.round(r.x + 20), y: Math.round(r.y + 20) }; })()");
      site.sendInputEvent({ type: "mouseDown", x: b.x, y: b.y, button: "left", clickCount: 1 });
      site.sendInputEvent({ type: "mouseUp", x: b.x, y: b.y, button: "left", clickCount: 1 });
      let pop = null;
      for (let i = 0; i < 40 && !pop; i++) {
        await wait(250);
        pop = BrowserWindow.getAllWindows().find((w) => !before.has(w));
      }
      if (!pop) {
        console.log(tag, "NO POPUP");
        return app.exit(0);
      }
      wc = pop.webContents;
      await new Promise((r) => (wc.isLoading() ? wc.once("did-finish-load", r) : r()));
    } else wc = s.newTab("about:blank");
  } else {
    const win = new BrowserWindow({ width: 1100, height: 900, webPreferences: { session: session.fromPartition("persist:g"), sandbox: true } });
    wc = win.webContents;
    await wc.loadURL("about:blank");
  }
  if (process.env.BRAND) await brand(wc).catch((e) => console.log(tag, "brand failed", String(e)));
  if (!process.env.POPUP) await wc.loadURL(SIGNIN).catch(() => {});
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await wait(500);
    ok = await wc.executeJavaScript(`(() => { const e = document.querySelector('#identifierId, input[name=identifier], input[type=email]'); if (!e) return false; e.focus(); return true; })()`).catch(() => false);
  }
  if (!ok) {
    console.log(tag, "NO EMAIL FIELD", JSON.stringify(await wc.executeJavaScript("document.body.innerText.slice(0, 200)").catch(() => "")));
    return app.exit(0);
  }
  console.log(tag, "ua", await wc.executeJavaScript("navigator.userAgent + ' | ' + (navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand).join('/') : 'no UA-CH')"));
  await wc.insertText(`strata.signin.check.${Date.now()}@gmail.com`);
  await wait(300);
  wc.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  wc.sendInputEvent({ type: "char", keyCode: "\r" });
  wc.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  let text = "";
  for (let i = 0; i < 24; i++) {
    await wait(500);
    text = await wc.executeJavaScript("document.body.innerText.replace(/\\s+/g, ' ')").catch(() => "");
    if (/may not be secure|Couldn.t find (your Google Account|this account)|Enter your password|Verify it.s you|Try again|couldn.t sign you in/i.test(text)) break;
  }
  const verdict = /may not be secure|couldn.t sign you in/i.test(text) ? "BLOCKED (browser refused)" : /Couldn.t find (your Google Account|this account)|Enter your password|Verify it.s you/i.test(text) ? "ALLOWED" : "UNCLEAR";
  console.log(tag, verdict, JSON.stringify(text.slice(0, 160)));
  app.exit(0);
});
