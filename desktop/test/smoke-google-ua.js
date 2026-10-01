// On Google's sign-in pages (only), pages and their requests present as
// Firefox; elsewhere STRATA keeps Chrome's user agent. Google's sign-in is
// mapped to a local server here.
// Run: xvfb-run -a npx electron test/smoke-google-ua.js
const http = require("node:http");

const seen = [];
const page = (label) => `<!doctype html><title>${label}</title><body>${label}<script>window.ua = navigator.userAgent;</script></body>`;
const google = http.createServer((q, r) => {
  seen.push({ ua: q.headers["user-agent"], ch: q.headers["sec-ch-ua"] || null });
  r.setHeader("content-type", "text/html");
  r.end(page("google"));
}).listen(0);
process.env.STRATA_GOOGLE_SIGNIN_HOSTS = "signin.test";
const other = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(page("other") + `<script>window.otherHeaderUA = ${JSON.stringify(q.headers["user-agent"])}</script>`); }).listen(0);
process.env.SOLANA_OS_URL = `http://127.0.0.1:${other.address().port}`;

const { app } = require("electron");
app.commandLine.appendSwitch("host-resolver-rules", `MAP signin.test 127.0.0.1:${google.address().port}`);
require("../src/main.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
const loaded = (wc) => new Promise((r) => (wc.isLoading() ? wc.once("did-finish-load", r) : r()));

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...require("../src/window").shells][0];
    const tab = s.newTab(`http://localhost:${other.address().port}/`);
    await loaded(tab);
    const before = await tab.executeJavaScript("window.ua");
    check("other sites: Chrome user agent", /Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(before), before);
    await tab.loadURL("http://signin.test/signin");
    await wait(300);
    const g = await tab.executeJavaScript("window.ua");
    check("Google sign-in page sees Firefox", /Firefox\/\d+/.test(g) && !/Chrome/.test(g), g);
    check("requests to Google sign-in carry Firefox and no Chrome hints", seen.length && seen.every((x) => /Firefox/.test(x.ua) && !x.ch), seen);
    await tab.loadURL(`http://localhost:${other.address().port}/again`);
    await wait(300);
    const after = await tab.executeJavaScript("window.ua + ' | ' + window.otherHeaderUA");
    check("back to Chrome after leaving Google", /Chrome\/\d+\.0\.0\.0 Safari\/537\.36 \| .*Chrome\//.test(after) && !/Firefox/.test(after), after);
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[google-ua] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
