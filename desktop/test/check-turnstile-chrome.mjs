// Baseline for check-turnstile.js: the same Turnstile pages in real Google
// Chrome on the same machine, driven over the DevTools protocol (no
// automation flags), so a failure here means the network, not STRATA.
// Run: xvfb-run -a node test/check-turnstile-chrome.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PAGES = (process.env.TURNSTILE_PAGES || "https://nopecha.com/demo/cloudflare,https://2captcha.com/demo/cloudflare-turnstile,https://seleniumbase.io/apps/turnstile").split(",");
const CHROME = process.env.CHROME_BIN || "google-chrome";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[turnstile-chrome]", ...a);

const port = 9333;
const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ts-"))}`, "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let targets = null;
for (let i = 0; i < 40 && !targets; i++) {
  await wait(500);
  targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const consoleLines = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d.result);
  if (d.method === "Runtime.consoleAPICalled") {
    const t = (d.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    if (/turnstile|cloudflare|challenge|600\d{3}|300\d{3}|110\d{3}/i.test(t)) consoleLines.push(t.slice(0, 160));
  }
};
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

await send("Runtime.enable");
let printed = false;
for (const url of PAGES) {
  await send("Page.navigate", { url });
  await wait(4000);
  if (!printed) {
    printed = true;
    log("fingerprint", JSON.stringify(await evalJs(`(async () => ({ ua: navigator.userAgent, brands: navigator.userAgentData?.brands.map((b) => b.brand + " " + b.version), chrome: typeof window.chrome, chromeKeys: window.chrome ? Object.keys(window.chrome) : null, webdriver: navigator.webdriver }))()`)));
  }
  consoleLines.length = 0;
  let token = -1;
  let clicked = false;
  for (let i = 0; i < 26 && !(token > 0); i++) {
    await wait(1000);
    token = await evalJs(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); return i ? i.value.length : -1; })()`);
    if (!(token > 0) && !clicked && i >= 3) {
      const r = await evalJs(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); const box = i && (i.closest('.cf-turnstile, [class*="turnstile"]') || i.parentElement); if (!box) return null; const b = box.getBoundingClientRect(); return { x: Math.round(b.x + 30), y: Math.round(b.y + Math.min(b.height, 65) / 2) }; })()`);
      if (r) {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x - 40, y: r.y + 10 });
        await wait(120);
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
        await wait(90);
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
        clicked = r;
      }
    }
  }
  log(url, token > 0 ? "PASSED" : "NOT PASSED", JSON.stringify({ token, clicked, console: consoleLines.slice(0, 6) }));
}
proc.kill();
process.exit(0);
