// "Continue with Google": Google's sign-in pages (only) see window.chrome
// filled in the way Chrome fills it, in a tab and in a sign-in popup, with
// STRATA's normal Chrome user agent; other sites are left untouched. Also in Google frames embedded in a site. Google's
// sign-in is mapped to a local server here.
// Run: xvfb-run -a npx electron test/smoke-google-signin.js
const http = require("node:http");

const probe = `window.info = { ua: navigator.userAgent, chrome: Object.keys(window.chrome || {}).sort().join(","), csi: typeof window.chrome?.csi === "function" && typeof window.chrome.csi().startE === "number", opener: window.opener !== null };`;
const page = (label) => `<!doctype html><title>${label}</title><body>${label}<script>${probe}</script></body>`;
const google = http.createServer((_q, r) => {
  r.setHeader("content-type", "text/html");
  r.end(page("google"));
}).listen(0);
process.env.STRATA_NO_PASSKEY_HOSTS = "signin.test";
const other = http.createServer((q, r) => {
  r.setHeader("content-type", "text/html");
  if (q.url.startsWith("/embed")) return r.end(`<!doctype html><iframe src="http://signin.test/gsi/button"></iframe>`);
  if (q.url.startsWith("/site")) return r.end(`<!doctype html><button id="g" style="width:300px;height:100px">Continue with Google</button><script>document.getElementById("g").onclick = () => window.open("http://signin.test/popup", "g", "width=480,height=600");</script>`);
  r.end(page("other"));
}).listen(0);
process.env.SOLANA_OS_URL = `http://127.0.0.1:${other.address().port}`;

const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch("host-resolver-rules", `MAP signin.test 127.0.0.1:${google.address().port}`);
require("../src/main.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
const loaded = (wc) => new Promise((r) => (wc.isLoading() ? wc.once("did-finish-load", r) : r()));
const chromeUA = /Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/;
const filled = (i) => i && /app/.test(i.chrome) && /csi/.test(i.chrome) && /loadTimes/.test(i.chrome) && i.csi;

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...require("../src/window").shells][0];
    const tab = s.newTab(`http://localhost:${other.address().port}/`);
    await loaded(tab);
    const o = await tab.executeJavaScript("window.info");
    check("other sites: Chrome user agent, window.chrome untouched", chromeUA.test(o?.ua) && !/csi|loadTimes/.test(o?.chrome), o);
    await tab.loadURL("http://signin.test/signin");
    await wait(300);
    const g = await tab.executeJavaScript("window.info");
    check("Google sign-in page: Chrome user agent and window.chrome like Chrome", chromeUA.test(g?.ua) && filled(g), g);

    // "Sign in with Google" button / One Tap: a Google frame inside the site.
    const emb = s.newTab(`http://localhost:${other.address().port}/embed`);
    await loaded(emb);
    await wait(500);
    const f = emb.mainFrame.frames.find((x) => /signin\.test/.test(x.url));
    // Applied when the frame commits, so it can land after the frame's first
    // inline script; Google's checks run from scripts that load later.
    const fi = f ? await f.executeJavaScript(`(() => { ${probe} return window.info; })()`).catch(() => null) : null;
    check("Google sign-in frame inside a site: window.chrome like Chrome", filled(fi), fi);

    // "Continue with Google" opens the sign-in in a popup.
    const site = s.newTab(`http://localhost:${other.address().port}/site`);
    await loaded(site);
    await wait(300);
    const winsBefore = new Set(BrowserWindow.getAllWindows());
    const b = await site.executeJavaScript("(() => { const r = document.getElementById('g').getBoundingClientRect(); return { x: Math.round(r.x + 20), y: Math.round(r.y + 20) }; })()");
    site.sendInputEvent({ type: "mouseDown", x: b.x, y: b.y, button: "left", clickCount: 1 });
    site.sendInputEvent({ type: "mouseUp", x: b.x, y: b.y, button: "left", clickCount: 1 });
    let pop = null;
    for (let i = 0; i < 40 && !pop; i++) { await wait(100); pop = BrowserWindow.getAllWindows().find((w) => !winsBefore.has(w)); }
    let p = null;
    for (let i = 0; i < 30 && pop && !pop.isDestroyed() && !p; i++) {
      await wait(200);
      p = await pop.webContents.executeJavaScript("window.info || null").catch(() => null);
    }
    check("Google sign-in in a popup: window.chrome like Chrome", p && chromeUA.test(p.ua) && filled(p), p);
    check("the popup can still answer the site (window.opener)", p?.opener, p);
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[google-signin] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
