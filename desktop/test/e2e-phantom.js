// End-to-end check (needs internet; runs in GitHub Actions): install Phantom,
// set it up with a throwaway test wallet, connect it to a local dApp page and
// time each step. Prints "[e2e]" lines; screenshots go to $OUT_DIR.
// Run: xvfb-run -a npx electron test/e2e-phantom.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// The dApp: connects through Phantom's injected provider and the Wallet Standard.
const DAPP = `<!doctype html><title>dApp</title><body><button id="c">Connect</button><pre id="o"></pre>
<script>
window.result = null;
window.connectStart = 0;
document.getElementById("c").onclick = async () => {
  window.connectStart = performance.now();
  try {
    const r = await window.phantom.solana.connect();
    window.result = { ok: true, address: r.publicKey.toString(), ms: Math.round(performance.now() - window.connectStart) };
  } catch (e) {
    window.result = { ok: false, error: String(e && e.message || e), ms: Math.round(performance.now() - window.connectStart) };
  }
  document.getElementById("o").textContent = JSON.stringify(window.result);
};
</script></body>`;
const server = http.createServer((req, res) => res.end(req.url.startsWith("/dapp") ? DAPP : "<!doctype html><title>Home</title>home")).listen(0);
const PORT = server.address().port;
process.env.SOLANA_OS_URL = `http://localhost:${PORT}`;

const { app, BrowserWindow, session, webContents } = require("electron");
require("../src/main.js");
const { installExtension } = require("electron-chrome-web-store");
const { generateMnemonic } = require("@scure/bip39");
const { wordlist } = require("@scure/bip39/wordlists/english.js");

const PHANTOM = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const OUT = process.env.OUT_DIR || path.join(__dirname, "..", "diag");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[e2e +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const errors = [];
app.on("web-contents-created", (_e, wc) => {
  wc.on("console-message", (d) => {
    if (d.level === "error") errors.push(`${wc.getURL().slice(0, 70)} :: ${String(d.message).slice(0, 200)}`);
  });
});

// Page helpers (run inside extension pages).
const PAGE_STATE = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    url: location.href,
    text: document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 300) : "",
    buttons: [...document.querySelectorAll("button, [role=button], a")].filter(vis).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean).slice(0, 20),
    inputs: [...document.querySelectorAll("input, textarea")].filter(vis).map((i) => i.type || i.tagName).slice(0, 30),
  };
})()`;
const clickText = (re) => `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const els = [...document.querySelectorAll("button, [role=button], a")].filter(vis);
  const label = (b) => (b.innerText || b.getAttribute("aria-label") || "").trim().split("\\n")[0].trim();
  const el = els.find((b) => ${re}.test(label(b)) && !b.disabled);
  if (!el) return false;
  el.click();
  return (el.innerText || "").trim().slice(0, 40) || true;
})()`;
const fillInputs = (values) => `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const set = (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const vals = ${JSON.stringify(values)};
  const inputs = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), textarea")].filter(vis);
  inputs.forEach((el, i) => { if (vals[i] !== undefined) set(el, vals[i]); });
  document.querySelectorAll("input[type=checkbox]").forEach((c) => { if (!c.checked) c.click(); });
  return inputs.length;
})()`;

async function drive(wc, words, password) {
  // Walk Phantom's onboarding by what's on screen; log every step.
  for (let step = 0; step < 25; step++) {
    await sleep(1500);
    if (wc.isDestroyed()) return log("onboarding page closed");
    const st = await wc.executeJavaScript(PAGE_STATE).catch((e) => ({ error: String(e) }));
    log(`step ${step}`, JSON.stringify(st));
    if (st.error) continue;
    const text = st.text.toLowerCase();
    if (/you're all (done|set)|all done|welcome to phantom|get started/.test(text) && (await wc.executeJavaScript(clickText("/^(get started|finish|done|open phantom)$/i")))) {
      log("finished onboarding");
      return true;
    }
    if (await wc.executeJavaScript(clickText("/^i already have a wallet$/i"))) continue;
    if (await wc.executeJavaScript(clickText("/^import (secret )?recovery phrase$/i"))) continue;
    const textInputs = st.inputs.filter((t) => t === "text" || t === "TEXTAREA" || t === "password");
    const pw = st.inputs.filter((t) => t === "password").length;
    if (st.inputs.length >= 12 && pw < 2) {
      // Type like a person (Phantom ignores scripted value changes).
      for (let i = 0; i < 12; i++) {
        await wc.executeJavaScript(`(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll("input")].filter(vis)[${i}]; el && el.focus(); })()`);
        await wc.insertText(words[i]);
      }
      log("typed recovery phrase");
      await sleep(800);
      await wc.executeJavaScript(clickText("/^(import wallet|import|continue|next)$/i"));
      continue;
    }
    if (pw >= 1) {
      const n = st.inputs.length;
      for (let i = 0; i < n; i++) {
        if (st.inputs[i] !== "password") continue;
        await wc.executeJavaScript(`(() => { const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll("input:not([type=checkbox])")].filter(vis)[${i}]; el && el.focus(); })()`);
        await wc.insertText(password);
      }
      await wc.executeJavaScript(`document.querySelectorAll("input[type=checkbox]").forEach((c) => { if (!c.checked) c.click(); }); [...document.querySelectorAll("[role=checkbox]")].forEach((c) => { if (c.getAttribute("aria-checked") !== "true") c.click(); }); true`);
      log("typed password");
      await sleep(800);
      await wc.executeJavaScript(clickText("/^(continue|next|save|submit)$/i"));
      continue;
    }
    if (textInputs.length === 0 && (await wc.executeJavaScript(clickText("/^(continue|next|import|import wallet|skip|done|got it|agree)$/i")))) continue;
  }
  return false;
}

process.on("unhandledRejection", (e) => log("UNHANDLED", String(e && e.stack || e)));
app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:solanaos");
  const shellWin = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("shell.html")) || BrowserWindow.getAllWindows()[0];
  await sleep(2500);

  let t = Date.now();
  const ext = await installExtension(PHANTOM, { session: ses });
  log("installed", ext.name, ext.version, `${Date.now() - t}ms`);

  // Phantom opens its onboarding tab by itself after install.
  let onboarding = null;
  for (let i = 0; i < 40 && !onboarding; i++) {
    await sleep(500);
    onboarding = webContents.getAllWebContents().find((w) => w.getURL().includes(`${PHANTOM}/onboarding`));
  }
  log("onboarding tab", onboarding ? "opened" : "missing");
  if (!onboarding) {
    onboarding = (await (async () => {
      const w = new BrowserWindow({ width: 1000, height: 800, webPreferences: { session: ses } });
      await w.loadURL(`chrome-extension://${PHANTOM}/onboarding.html`);
      return w.webContents;
    })());
  }
  const words = generateMnemonic(wordlist).split(" ");
  const done = await drive(onboarding, words, "SolanaOS-test-Pa55!");
  log("onboarding", done ? "complete" : "INCOMPLETE");
  if (!onboarding.isDestroyed()) fs.writeFileSync(path.join(OUT, "onboarding.png"), (await onboarding.capturePage()).toPNG());

  // Connect from a dApp in a real tab.
  const tab = [...require("../src/window").shells][0].activeTab.view.webContents;
  await tab.loadURL(`http://localhost:${PORT}/dapp`);
  await sleep(2000);
  log("provider", await tab.executeJavaScript("({ phantom: !!(window.phantom && window.phantom.solana), isPhantom: !!(window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) })"));
  const before = new Set(BrowserWindow.getAllWindows());
  t = Date.now();
  await tab.executeJavaScript("document.getElementById('c').click()", true);
  let popup = null;
  for (let i = 0; i < 120 && !popup; i++) {
    await sleep(250);
    popup = BrowserWindow.getAllWindows().find((w) => !before.has(w));
  }
  log("approval window", popup ? `appeared after ${Date.now() - t}ms` : "NEVER appeared (30s)");
  if (popup) {
    popup.on("closed", () => log("approval window closed", `${Date.now() - t}ms`));
    popup.webContents.on("did-finish-load", () => log("approval loaded", popup.webContents.getURL(), `${Date.now() - t}ms`));
    popup.webContents.on("render-process-gone", (_e, d) => log("approval renderer gone", d.reason));
  }
  if (popup) {
    // Don't executeJavaScript yet (it waits for the page to load): just watch.
    let beat = Date.now();
    const hb = setInterval(() => {
      const lag = Date.now() - beat - 500;
      if (lag > 300) log("main process lag", `${lag}ms`);
      beat = Date.now();
    }, 500);
    popup.webContents.on("console-message", (d) => log("approval console", d.level, String(d.message).slice(0, 200)));
    popup.webContents.on("did-fail-load", (_e, code, desc, url) => log("approval did-fail-load", code, desc, url));
    popup.webContents.session.webRequest.onCompleted({ urls: ["<all_urls>"] }, (d) => {
      if (d.webContentsId === popup.webContents.id) log("approval request", d.statusCode, d.url.slice(0, 100));
    });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (popup.isDestroyed()) break;
      const wc = popup.webContents;
      if (i % 4 === 0) log("approval state", JSON.stringify({ url: wc.getURL(), loading: wc.isLoading(), mainFrameLoading: wc.isLoadingMainFrame(), waiting: wc.isWaitingForResponse(), crashed: wc.isCrashed(), visible: popup.isVisible(), bounds: popup.getBounds() }));
      if (!wc.isLoading()) break;
    }
    clearInterval(hb);
  }
  if (popup && !popup.isDestroyed() && !popup.webContents.isLoading()) try {
    // Wait for content, then approve.
    let st = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      st = await popup.webContents.executeJavaScript(PAGE_STATE).catch(() => null);
      if (st && st.buttons.some((b) => /connect|approve|confirm/i.test(b))) break;
    }
    log("approval content", `${Date.now() - t}ms`, JSON.stringify(st), "visible:", popup.isVisible(), JSON.stringify(popup.getBounds()));
    fs.writeFileSync(path.join(OUT, "approval.png"), (await popup.webContents.capturePage()).toPNG());
    const clicked = await popup.webContents.executeJavaScript(clickText("/^(connect|approve|confirm)$/i")).catch(() => false);
    log("clicked", clicked);
  } catch (e) {
    log("approval step error", String(e && e.stack || e));
  }
  let result = null;
  for (let i = 0; i < 60 && !result; i++) {
    await sleep(500);
    result = await tab.executeJavaScript("window.result").catch(() => null);
  }
  log("connect result", JSON.stringify(result), `total ${Date.now() - t}ms`);


  // What real sites do next: sign a message, then reconnect later. Keep focus on
  // the browser window (as when the popup opens without taking focus).
  async function approveNext(label, start) {
    const before = new Set(BrowserWindow.getAllWindows());
    if (!shellWin.isDestroyed()) shellWin.focus();
    const t1 = Date.now();
    log(`${label}: start`);
    // Start it without waiting for the approval (executeJavaScript can wait on page work).
    await Promise.race([tab.executeJavaScript(`setTimeout(() => { ${start} }, 0); true`, true), sleep(5000).then(() => log(`${label}: start call still pending after 5s`))]).catch((e) => log(`${label}: start failed`, String(e)));
    let pop = null;
    for (let i = 0; i < 80 && !pop; i++) {
      await sleep(250);
      pop = BrowserWindow.getAllWindows().find((w) => !before.has(w));
    }
    log(`${label}: popup`, pop ? `after ${Date.now() - t1}ms visible=${pop.isVisible()} focused=${pop.isFocused()} bounds=${JSON.stringify(pop.getBounds())}` : "none (may be auto-approved)");
    if (pop) {
      if (!shellWin.isDestroyed()) shellWin.focus(); // the browser keeps focus
      let clicked = false;
      for (let i = 0; i < 40 && !clicked && !pop.isDestroyed(); i++) {
        await sleep(500);
        clicked = await pop.webContents.executeJavaScript(clickText("/^(connect|approve|confirm|sign)$/i")).catch(() => false);
      }
      log(`${label}: clicked`, clicked);
    }
    let out = null;
    for (let i = 0; i < 40 && !out; i++) {
      await sleep(500);
      out = await tab.executeJavaScript("window.result2").catch(() => null);
    }
    log(`${label}: result`, JSON.stringify(out), `${Date.now() - t1}ms`, "browser window open:", !shellWin.isDestroyed());
    await Promise.race([tab.executeJavaScript("window.result2 = null"), sleep(2000)]).catch(() => {});
  }
  log("after connect: browser window open", !shellWin.isDestroyed(), "tab alive", !tab.isDestroyed());
  // From here on: a heartbeat (shows whether the main process stops responding),
  // new windows, crashed processes and the extension library's own debug log.
  setInterval(() => log("heartbeat"), 2000).unref();
  app.on("browser-window-created", (_e, w) => log("window created", w.id, w.webContents.getURL() || "(no url yet)"));
  app.on("child-process-gone", (_e, d) => log("child process gone", JSON.stringify(d)));
  app.on("render-process-gone", (_e, _wc, d) => log("renderer gone", JSON.stringify(d)));
  try {
    const dbg = require(require.resolve("debug", { paths: [path.dirname(require.resolve("electron-chrome-extensions"))] }));
    dbg.log = (...a) => log("[crx]", a.join(" ").slice(0, 300));
    dbg.enable("electron-chrome-extensions:*");
  } catch (e) {
    log("debug log unavailable", String(e));
  }
  if (result && result.ok) {
    await approveNext("sign message", `window.result2 = null; window.phantom.solana.signMessage(new TextEncoder().encode("Sign in to STRATA test"), "utf8").then((r) => (window.result2 = { ok: true, sigBytes: r.signature.length }), (e) => (window.result2 = { ok: false, error: String(e && e.message || e) }))`);
    await Promise.race([tab.executeJavaScript("window.phantom.solana.disconnect().then(() => true)").catch(() => {}), sleep(3000)]);
    await sleep(500);
    await approveNext("reconnect", `window.result2 = null; window.phantom.solana.connect().then((r) => (window.result2 = { ok: true, address: r.publicKey.toString() }), (e) => (window.result2 = { ok: false, error: String(e && e.message || e) }))`);
    await approveNext("sign again", `window.result2 = null; window.phantom.solana.signMessage(new TextEncoder().encode("Second message"), "utf8").then((r) => (window.result2 = { ok: true, sigBytes: r.signature.length }), (e) => (window.result2 = { ok: false, error: String(e && e.message || e) }))`);
  }

  // Toolbar popup speed (click the Phantom icon).
  const pt = await shellWin.webContents.executeJavaScript("(() => { const el = document.querySelector('browser-action-list'); const b = el && el.shadowRoot.querySelector('.action, [part~=action]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
  if (pt) {
    const before2 = new Set(BrowserWindow.getAllWindows());
    t = Date.now();
    shellWin.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    shellWin.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    let pop = null;
    for (let i = 0; i < 80; i++) {
      await sleep(100);
      pop = BrowserWindow.getAllWindows().find((w) => !before2.has(w) && w.isVisible());
      if (pop) break;
    }
    log("toolbar popup", pop ? `visible after ${Date.now() - t}ms` : "not visible after 8s");
    if (pop) {
      await sleep(3000);
      log("toolbar popup content", JSON.stringify(await pop.webContents.executeJavaScript(PAGE_STATE).catch(() => null)));
      fs.writeFileSync(path.join(OUT, "toolbar-popup.png"), (await pop.webContents.capturePage()).toPNG());
    }
  }
  log("console errors", JSON.stringify(errors.slice(0, 40), null, 1));
  app.exit(0);
});
