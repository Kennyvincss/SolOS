// Phantom's "Create wallet with your Google email" (needs internet; GitHub
// Actions): install Phantom, walk onboarding to the Google option, click it and
// log what happens (sign-in windows, chrome.identity calls, errors).
// Run: xvfb-run -a npx electron test/check-phantom-google.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const server = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title>home")).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${server.address().port}`;

const { app, BrowserWindow, session, webContents } = require("electron");
require("../src/main.js");
const { installExtension } = require("electron-chrome-web-store");

const PHANTOM = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const OUT = process.env.OUT_DIR || path.join(__dirname, "..", "diag");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[pg +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

app.on("web-contents-created", (_e, wc) => {
  wc.on("console-message", (d) => {
    if (/chrome-extension|accounts\.google|phantom/.test(wc.getURL()) && d.level !== "debug") log("console", d.level, wc.getURL().slice(0, 60), String(d.message).slice(0, 220));
  });
  wc.on("did-navigate", (_ev, url) => log("navigate", wc.id, wc.getType(), url.slice(0, 160)));
  wc.on("will-redirect", (d) => log("redirect", wc.id, String(d.url).slice(0, 160)));
});
app.on("browser-window-created", (_e, w) => log("window created", w.id, w.webContents.getURL() || "(blank)"));
process.on("unhandledRejection", (e) => log("UNHANDLED", String(e?.stack || e)));

const STATE = `(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return { url: location.href, text: document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 300) : "",
    buttons: [...document.querySelectorAll("button, [role=button], a")].filter(vis).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ")).filter(Boolean).slice(0, 20) }; })()`;
const click = (re) => `(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = [...document.querySelectorAll("button, [role=button], a")].filter(vis).find((b) => ${re}.test((b.innerText || b.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim()) && !b.disabled);
  if (!el) return false; el.click(); return (el.innerText || "").trim().slice(0, 60) || true; })()`;

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:solanaos");
  ses.serviceWorkers.on("console-message", (_e, d) => log("worker console", String(d.message).slice(0, 220)));
  await sleep(2500);
  const ext = await installExtension(PHANTOM, { session: ses });
  log("installed", ext.name, ext.version);
  // How Phantom's code runs the Google sign-in window.
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } };
  walk(ext.path);
  const pats = [/login\/start/g, /launchWebAuthFlow/g, /chromiumapp/g, /login\/callback/g, /onUpdated\.addListener/g, /connect\.phantom\.app/g];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const re of pats) for (const m of src.matchAll(re)) log("src", path.relative(ext.path, f), re.source, JSON.stringify(src.slice(Math.max(0, m.index - 400), m.index + 500)));
  }
  let ob = null;
  for (let i = 0; i < 40 && !ob; i++) {
    await sleep(500);
    ob = webContents.getAllWebContents().find((w) => w.getURL().includes(`${PHANTOM}/onboarding`));
  }
  if (!ob) {
    const w = new BrowserWindow({ width: 1000, height: 800, webPreferences: { session: ses } });
    await w.loadURL(`chrome-extension://${PHANTOM}/onboarding.html`);
    ob = w.webContents;
  }
  let clickedGoogle = false;
  for (let step = 0; step < 14 && !clickedGoogle; step++) {
    await sleep(2000);
    const st = await ob.executeJavaScript(STATE).catch((e) => ({ error: String(e) }));
    log(`step ${step}`, JSON.stringify(st));
    if (await ob.executeJavaScript(click("/google/i"))) { clickedGoogle = true; break; }
    if (await ob.executeJavaScript(click("/^(create a new wallet|create new wallet|create wallet|continue with email|sign up|new wallet)/i"))) continue;
  }
  log("clicked Google", clickedGoogle);
  fs.writeFileSync(path.join(OUT, "pg-0.png"), (await ob.capturePage()).toPNG());
  for (let i = 1; i <= 8; i++) {
    await sleep(3000);
    const wins = BrowserWindow.getAllWindows().map((w) => ({ id: w.id, url: w.webContents.getURL().slice(0, 140), visible: w.isVisible(), focused: w.isFocused(), bounds: w.getBounds(), title: w.getTitle() }));
    log(`after ${i * 3}s windows`, JSON.stringify(wins));
    const st = await ob.executeJavaScript(STATE).catch((e) => ({ error: String(e) }));
    log(`after ${i * 3}s onboarding`, JSON.stringify(st).slice(0, 300));
    for (const w of BrowserWindow.getAllWindows()) if (/google|phantom\.app|auth/.test(w.webContents.getURL())) {
      const t = await w.webContents.executeJavaScript("document.body ? document.body.innerText.replace(/\\s+/g,' ').slice(0,200) : ''").catch(() => "");
      log("  auth window text", w.id, JSON.stringify(t));
    }
  }
  for (const [i, w] of BrowserWindow.getAllWindows().entries()) fs.writeFileSync(path.join(OUT, `pg-win${i}.png`), (await w.webContents.capturePage()).toPNG());
  app.exit(0);
});
