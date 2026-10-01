// A page that closes its own tab (window.close(), as wallet onboarding pages do
// when they're finished) leaves the tab strip cleanly, and the browser keeps
// working: no errors, new tabs still open.
// Run: xvfb-run -a npx electron test/smoke-tab-selfclose.js
const http = require("node:http");
const server = http.createServer((q, r) => {
  r.setHeader("content-type", "text/html");
  r.end(q.url.startsWith("/bye") ? "<!doctype html><title>Bye</title><script>setTimeout(() => window.close(), 1500)</script>bye" : "<!doctype html><title>Home</title>home");
}).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${server.address().port}`;
const errors = [];
process.on("uncaughtException", (e) => errors.push(String(e?.stack || e)));
process.on("unhandledRejection", (e) => errors.push(String(e?.stack || e)));

const { app } = require("electron");
require("../src/main.js");
const W = require("../src/window");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...W.shells][0];
    const port = server.address().port;
    const before = s.tabs.size;
    // window.close() only works on tabs a script opened; open it like a site would.
    const opener = s.newTab(`http://localhost:${port}/`);
    await wait(800);
    await opener.executeJavaScript(`window.open("http://localhost:${port}/bye"); true`, true);
    await wait(500);
    const opened = s.tabs.size;
    check("the page opens in a new tab", opened === before + 2, { before, opened });
    for (let i = 0; i < 30 && s.tabs.size === opened; i++) await wait(100);
    check("the tab that closed itself leaves the tab strip", s.tabs.size === before + 1, { size: s.tabs.size });
    check("no leftover entry in the tab order", s.order.length === s.tabs.size && s.order.every((id) => s.tabs.has(id)), { order: s.order, tabs: [...s.tabs.keys()] });
    const wc = s.newTab(`http://localhost:${port}/after`);
    await wait(800);
    check("new tabs still open", s.tabs.has(wc.id) && /after/.test(wc.getURL()), wc.getURL());
    const state = await s.win.webContents.executeJavaScript("document.querySelectorAll('[data-tab-id], .tab').length").catch(() => -1);
    check("tab strip still updates", state !== 0, state);
  } catch (e) {
    errors.push(String(e?.stack || e));
  }
  check("no errors", errors.length === 0, errors);
  for (const c of checks) console.log(`[selfclose] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
