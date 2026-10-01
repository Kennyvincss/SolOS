// Site permissions: nothing is granted until you allow it (Electron's
// default grants everything), the choice is remembered per site, and
// STRATA's own pages are trusted.
// Run: xvfb-run -a npx electron test/smoke-permissions.js
const http = require("node:http");
const PAGE = `<!doctype html><title>perm</title><body><button id="b" style="width:300px;height:200px">ask</button><script>
window.q = async () => { const o = {}; for (const n of ["notifications", "geolocation", "camera", "microphone", "clipboard-read", "midi"]) o[n] = (await navigator.permissions.query({ name: n })).state; o.notification = Notification.permission; return o; };
</script></body>`;
const site = http.createServer((_q, r) => { r.setHeader("content-type", "text/html"); r.end(PAGE); }).listen(0);
const home = http.createServer((_q, r) => { r.setHeader("content-type", "text/html"); r.end(PAGE); }).listen(0);
process.env.SOLANA_OS_URL = `http://127.0.0.1:${home.address().port}`;

const { app, dialog } = require("electron");
const asked = [];
let answer = 0; // 0 = Allow, 1 = Block
dialog.showMessageBox = async (_w, opts) => { asked.push((opts || _w).message); return { response: answer }; };
require("../src/main.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
const load = async (s, url) => { const wc = s.newTab(url); await new Promise((r) => (wc.isLoading() ? wc.once("did-finish-load", r) : r())); await wait(300); return wc; };

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...require("../src/window").shells][0];
    const tab = await load(s, `http://localhost:${site.address().port}/`);
    const before = await tab.executeJavaScript("q()");
    check("a new site has no permissions", Object.entries(before).every(([k, v]) => v !== "granted"), before);

    answer = 0;
    const n = await tab.executeJavaScript("Notification.requestPermission()", true);
    check("asking shows a prompt", asked.length === 1 && /wants to show notifications/.test(asked[0]), asked);
    check("Allow grants it", n === "granted", n);
    const n2 = await tab.executeJavaScript("Notification.requestPermission()", true);
    check("the choice is remembered (no second prompt)", n2 === "granted" && asked.length === 1, { n2, asked });

    answer = 1;
    const geo = await tab.executeJavaScript("new Promise((r) => navigator.geolocation.getCurrentPosition(() => r('ok'), (e) => r('error ' + e.code), { timeout: 3000 }))", true);
    check("Block refuses location", /error 1/.test(geo) && asked.some((m) => /know your location/.test(m)), { geo, asked });
    const after = await tab.executeJavaScript("q()");
    check("other permissions still not granted", after.camera !== "granted" && after.microphone !== "granted" && after.geolocation !== "granted", after);

    const own = await load(s, `${process.env.SOLANA_OS_URL}/`);
    const ownState = await own.executeJavaScript("q()");
    check("STRATA's own pages are trusted", ownState.notifications === "granted", ownState);
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[permissions] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
