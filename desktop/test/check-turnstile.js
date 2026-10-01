// Cloudflare Turnstile in STRATA (needs internet; run in GitHub Actions):
// loads public Turnstile demo pages and reports whether the check passes,
// plus what a bot check sees (user agent, client hints, window.chrome, ...).
// Run: xvfb-run -a npx electron test/check-turnstile.js
const http = require("node:http");
const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title>home")).listen(0);
process.env.SOLANA_OS_URL = `http://127.0.0.1:${home.address().port}`;

const { app } = require("electron");
require("../src/main.js");
const W = require("../src/window");

const PAGES = (process.env.TURNSTILE_PAGES || "https://nopecha.com/demo/cloudflare,https://2captcha.com/demo/cloudflare-turnstile,https://seleniumbase.io/apps/turnstile").split(",");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[turnstile]", ...a);

const FINGERPRINT = `(async () => {
  const d = navigator.userAgentData;
  let hi = null;
  try { hi = d ? await d.getHighEntropyValues(["fullVersionList", "platform", "platformVersion"]) : null; } catch {}
  return {
    ua: navigator.userAgent,
    brands: d ? d.brands.map((b) => b.brand + " " + b.version) : null,
    fullVersionList: hi && hi.fullVersionList ? hi.fullVersionList.map((b) => b.brand + " " + b.version) : null,
    chrome: typeof window.chrome, chromeKeys: window.chrome ? Object.keys(window.chrome) : null,
    webdriver: navigator.webdriver, plugins: navigator.plugins.length, languages: navigator.languages,
    pkcNative: typeof PublicKeyCredential === "function" && String(CredentialsContainer.prototype.get).includes("[native code]"),
  };
})()`;

app.whenReady().then(async () => {
  await wait(2500);
  const s = [...W.shells][0];
  let printed = false;
  for (const url of PAGES) {
    const tab = s.newTab(url);
    await new Promise((r) => (tab.isLoading() ? tab.once("did-finish-load", r) : r()));
    if (!printed) {
      log("fingerprint", JSON.stringify(await tab.executeJavaScript(FINGERPRINT).catch((e) => String(e))));
      printed = true;
    }
    const consoleLines = [];
    const onConsole = (d) => { const m = String(d.message || ""); if (/turnstile|cloudflare|challenge|600\d{3}|300\d{3}|110\d{3}/i.test(m)) consoleLines.push(m.slice(0, 160)); };
    tab.on("console-message", onConsole);
    let state = null;
    let clicked = false;
    for (let i = 0; i < 30; i++) {
      await wait(1000);
      const token = await tab.executeJavaScript(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); return i ? i.value.length : -1; })()`).catch(() => -2);
      const frames = tab.mainFrame.framesInSubtree.filter((f) => /challenges\.cloudflare\.com/.test(f.url));
      let text = "";
      for (const f of frames) text += await f.executeJavaScript("document.body ? document.body.innerText.replace(/\\s+/g, ' ').slice(0, 120) : ''").catch(() => "");
      state = { token, widgetFrames: frames.length, widget: text, clicked };
      if (token > 0) break;
      // After a few seconds, click the checkbox (left side of the widget), like a person.
      if (!clicked && i >= 6) {
        const r = await tab.executeJavaScript(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); const box = i && (i.closest('.cf-turnstile, [class*="turnstile"]') || i.parentElement); if (!box) return null; const b = box.getBoundingClientRect(); return { x: Math.round(b.x + 30), y: Math.round(b.y + Math.min(b.height, 65) / 2) }; })()`).catch(() => null);
        if (r) {
          tab.sendInputEvent({ type: "mouseMove", x: r.x - 40, y: r.y + 10 });
          await wait(120);
          tab.sendInputEvent({ type: "mouseMove", x: r.x, y: r.y });
          tab.sendInputEvent({ type: "mouseDown", x: r.x, y: r.y, button: "left", clickCount: 1 });
          await wait(90);
          tab.sendInputEvent({ type: "mouseUp", x: r.x, y: r.y, button: "left", clickCount: 1 });
          clicked = r;
        }
      }
    }
    tab.off("console-message", onConsole);
    log(url, state && state.token > 0 ? "PASSED" : "NOT PASSED", JSON.stringify({ ...state, console: consoleLines.slice(0, 6) }));
  }
  app.exit(0);
});
