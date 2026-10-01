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
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d.result);
};
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

let printed = false;
for (const url of PAGES) {
  await send("Page.navigate", { url });
  await wait(4000);
  if (!printed) {
    printed = true;
    log("fingerprint", JSON.stringify(await evalJs(`(async () => ({ ua: navigator.userAgent, brands: navigator.userAgentData?.brands.map((b) => b.brand + " " + b.version), chrome: typeof window.chrome, chromeKeys: window.chrome ? Object.keys(window.chrome) : null, webdriver: navigator.webdriver }))()`)));
  }
  let token = -1;
  for (let i = 0; i < 26 && !(token > 0); i++) {
    await wait(1000);
    token = await evalJs(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); return i ? i.value.length : -1; })()`);
  }
  log(url, token > 0 ? "PASSED" : "NOT PASSED", JSON.stringify({ token }));
}
proc.kill();
process.exit(0);
