// How fast extensions respond (needs internet; GitHub Actions): install Phantom,
// set it up with a throwaway wallet, then time, at 50 ms resolution:
// - page loads with and without Phantom (its content script runs in every page)
// - the toolbar popup (click → window → wallet UI ready)
// - connect / sign approvals (call → window → ready → click → answer)
// - an already-approved reconnect
// - main-process stalls during all of it
// Prints "[perf]" lines. Run: xvfb-run -a npx electron test/perf-extensions.js
const http = require("node:http");

const DAPP = `<!doctype html><title>dApp</title><body>dApp<script>window.t0 = performance.now();</script></body>`;
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(req.url.startsWith("/dapp") ? DAPP : "<!doctype html><title>Home</title>home");
}).listen(0);
const PORT = server.address().port;
process.env.SOLANA_OS_URL = `http://localhost:${PORT}`;

const { app, BrowserWindow, session } = require("electron");
require("../src/main.js");
const { installExtension } = require("electron-chrome-web-store");
const { generateMnemonic } = require("@scure/bip39");
const { wordlist } = require("@scure/bip39/wordlists/english.js");
const { PAGE_STATE, clickText, drive } = require("./lib-phantom");

const PHANTOM = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[perf +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const results = {};
const record = (name, ms) => {
  (results[name] ??= []).push(ms);
  log(`${name}: ${ms}ms`);
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

// Main-process stalls: a 50 ms timer that should never be late.
let worstLag = 0;
let lagWhere = "";
let phase = "start";
let beat = Date.now();
setInterval(() => {
  const lag = Date.now() - beat - 50;
  if (lag > worstLag) {
    worstLag = lag;
    lagWhere = phase;
  }
  if (lag > 250) log(`main process stalled ${lag}ms during "${phase}"`);
  beat = Date.now();
}, 50).unref();

const until = async (fn, timeout = 20000, step = 50) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
};
const newWindow = (before) => BrowserWindow.getAllWindows().find((w) => !before.has(w) && !w.isDestroyed());
const ready = (wc, re) => wc.executeJavaScript(PAGE_STATE).then((st) => st && st.buttons.some((b) => re.test(b))).catch(() => false);

async function loadTimes(tab, label, n = 5) {
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    await Promise.race([tab.loadURL(`http://localhost:${PORT}/dapp?${label}${i}`).catch(() => {}), sleep(15000)]);
    record(`page load (${label})`, Date.now() - t);
  }
}

/** Ask the dApp for something that needs an approval; time each stage. */
async function approval(name, tab, call, button) {
  phase = name;
  const before = new Set(BrowserWindow.getAllWindows());
  const t = Date.now();
  await tab.executeJavaScript(`window.r = null; setTimeout(() => (${call}).then((v) => (window.r = { ok: true, v: String(v) }), (e) => (window.r = { ok: false, e: String(e && e.message || e) })), 0); true`, true);
  const pop = await until(() => newWindow(before), 15000);
  if (!pop) {
    // No window: answered without asking (already approved).
    const r = await until(() => tab.executeJavaScript("window.r").catch(() => null), 15000);
    record(`${name}: answer (no window)`, Date.now() - t);
    log(name, "no approval window; answer", JSON.stringify(r), `${Date.now() - t}ms`);
    return;
  }
  record(`${name}: window appears`, Date.now() - t);
  const shown = await until(() => pop.isDestroyed() || pop.isVisible(), 10000);
  if (shown) record(`${name}: window visible`, Date.now() - t);
  const ok = await until(() => !pop.isDestroyed() && ready(pop.webContents, button), 20000);
  record(`${name}: ${ok ? "ready to approve" : "NEVER ready (20s)"}`, Date.now() - t);
  if (!ok) return log(name, "not ready", JSON.stringify(await pop.webContents.executeJavaScript(PAGE_STATE).catch(() => null)));
  const tc = Date.now();
  await pop.webContents.executeJavaScript(clickText(button.toString())).catch(() => {});
  const r = await until(() => tab.executeJavaScript("window.r").catch(() => null), 15000);
  record(`${name}: answer after click`, Date.now() - tc);
  log(name, JSON.stringify(r).slice(0, 120));
  await until(() => pop.isDestroyed(), 3000);
}

const oneLine = (e) => String(e?.stack || e).replace(/\s*\n\s*/g, " | ");
process.on("unhandledRejection", (e) => log("UNHANDLED", oneLine(e)));
process.on("uncaughtException", (e) => log("UNCAUGHT", oneLine(e)));
app.whenReady().then(async () => {
  try {
    await sleep(2500);
    const ses = session.fromPartition("persist:solanaos");
    const shell = [...require("../src/window").shells][0];
    let tab = shell.newTab(`http://localhost:${PORT}/`);

    phase = "page loads without extensions";
    await loadTimes(tab, "no extensions");

    phase = "install";
    let t = Date.now();
    await installExtension(PHANTOM, { session: ses });
    record("install Phantom", Date.now() - t);
    const ob = await until(() => require("electron").webContents.getAllWebContents().find((w) => w.getURL().includes(`${PHANTOM}/onboarding`)), 20000, 250);
    phase = "onboarding";
    const done = ob && (await drive(ob, generateMnemonic(wordlist).split(" "), "Strata-perf-Pa55!", () => {}));
    log("onboarding", done ? "complete" : "INCOMPLETE");
    if (!done) throw new Error("onboarding failed");
    await sleep(2000);
    tab = shell.newTab(`http://localhost:${PORT}/`);
    await sleep(500);

    phase = "page loads with Phantom";
    await loadTimes(tab, "with Phantom");
    await until(() => tab.executeJavaScript("!!(window.phantom && window.phantom.solana)").catch(() => false), 5000);
    t = Date.now();
    await Promise.race([tab.loadURL(`http://localhost:${PORT}/dapp?provider`).catch(() => {}), sleep(15000)]);
    await until(() => tab.executeJavaScript("!!(window.phantom && window.phantom.solana)").catch(() => false), 10000, 10);
    record("page load → window.phantom ready", Date.now() - t);

    // Toolbar popup, three times.
    for (let i = 0; i < 3; i++) {
      phase = "toolbar popup";
      const pt = await shell.webContents.executeJavaScript("(() => { const el = document.querySelector('browser-action-list'); const b = el && el.shadowRoot.querySelector('.action, [part~=action]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
      if (!pt) break;
      const before = new Set(BrowserWindow.getAllWindows());
      t = Date.now();
      shell.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      shell.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
      const pop = await until(() => { const w = newWindow(before); return w && w.isVisible() ? w : null; }, 10000);
      if (!pop) {
        record("toolbar popup: NEVER visible", Date.now() - t);
        continue;
      }
      record("toolbar popup: visible", Date.now() - t);
      const ok = await until(() => ready(pop.webContents, /^(send|receive|swap|buy)$/i), 15000);
      record(`toolbar popup: ${ok ? "wallet ready" : "NEVER ready (15s)"}`, Date.now() - t);
      pop.close();
      await sleep(800);
    }

    // Approvals.
    await Promise.race([tab.loadURL(`http://localhost:${PORT}/dapp?approvals`).catch(() => {}), sleep(15000)]);
    await until(() => tab.executeJavaScript("!!(window.phantom && window.phantom.solana)").catch(() => false), 10000);
    await approval("connect", tab, "window.phantom.solana.connect().then((r) => r.publicKey.toString())", /^connect$/i);
    for (let i = 0; i < 2; i++) await approval("sign message", tab, `window.phantom.solana.signMessage(new TextEncoder().encode("perf ${i}"), "utf8").then((r) => r.signature.length)`, /^(confirm|sign|approve)$/i);
    for (let i = 0; i < 3; i++) {
      await Promise.race([tab.loadURL(`http://localhost:${PORT}/dapp?again${i}`).catch(() => {}), sleep(15000)]);
      await until(() => tab.executeJavaScript("!!(window.phantom && window.phantom.solana)").catch(() => false), 10000, 10);
      await approval("reconnect (already approved)", tab, "window.phantom.solana.connect().then((r) => r.publicKey.toString())", /^connect$/i);
    }
  } catch (e) {
    log("ERROR", oneLine(e));
  }
  phase = "done";
  console.log("[perf] ===== results (median of runs, ms) =====");
  for (const [k, v] of Object.entries(results)) console.log(`[perf] ${k.padEnd(48)} ${String(median(v)).padStart(6)}   runs: ${v.join(", ")}`);
  console.log(`[perf] worst main-process stall: ${worstLag}ms during "${lagWhere}"`);
  app.exit(0);
});
