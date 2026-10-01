// Checks the offline page: with no connection the start page shows STRATA's
// "check your internet connection" page with Solana Q&A, the address bar keeps
// the page that failed, and the page reloads once the connection is back.
// Run: xvfb-run -a npx electron test/smoke-offline.js
process.env.SOLANA_OS_URL = "http://strata-offline-check.invalid";

const { app, net } = require("electron");
let online = false;
net.isOnline = () => online;
const realFetch = net.fetch.bind(net);
net.fetch = (url, opts) => (online ? Promise.resolve(new Response("{}", { status: 200 })) : realFetch(url, opts));
require("../src/main.js");
const W = require("../src/window");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });

app.whenReady().then(async () => {
  try {
    await wait(4000);
    const s = [...W.shells][0];
    const t = s.activeTab;
    const wc = t.view.webContents;
    check("offline page shown", wc.getURL().endsWith("/ui/offline.html"), wc.getURL());
    check("tab remembers the page to reload", t.offlineFor?.startsWith(process.env.SOLANA_OS_URL), t.offlineFor);
    const text = await wc.executeJavaScript("document.body.innerText");
    check("asks to check the connection", /check your internet connection/i.test(text), text.slice(0, 200));
    check("has Solana questions", /What is Solana\?/.test(text));
    const first = await wc.executeJavaScript("document.getElementById('track')?.style.transform || ''");
    await wait(7600);
    const later = await wc.executeJavaScript("document.getElementById('track')?.style.transform || ''");
    check("slides to the next question", first !== later, { first, later });
    await wc.capturePage().then((img) => require("node:fs").writeFileSync(process.env.SHOT || "offline.png", img.toPNG()));
    online = true;
    await wait(4500);
    check("reloads when the connection is back", !t.offlineFor && !wc.getURL().startsWith("file:"), wc.getURL());
  } catch (e) {
    check("no crash", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[offline] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
