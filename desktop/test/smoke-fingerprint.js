// What a bot check sees must match across the page, its iframes and its
// workers (Cloudflare Turnstile compares them): user agent, client hints,
// languages, no Electron/STRATA tokens, untouched built-ins.
// Run: xvfb-run -a npx electron test/smoke-fingerprint.js
const http = require("node:http");

const PROBE = `(async () => {
  const d = navigator.userAgentData;
  let hi = null; try { hi = d ? await d.getHighEntropyValues(["fullVersionList", "platform"]) : null; } catch {}
  return JSON.stringify({ ua: navigator.userAgent, brands: d ? d.brands.map((b) => b.brand + " " + b.version).join(",") : null,
    full: hi && hi.fullVersionList ? hi.fullVersionList.map((b) => b.brand + " " + b.version).join(",") : null,
    platform: d ? d.platform : null, languages: (navigator.languages || []).join(","), webdriver: navigator.webdriver });
})()`;
const PAGE = `<!doctype html><title>fp</title><body><iframe id="f" src="http://127.0.0.2:PORT/frame"></iframe><script>
window.main = null; window.worker = null; window.frameFp = null; window.sw = null;
${"(" + "async () => { window.main = await " + PROBE + "; })();"}
const w = new Worker(URL.createObjectURL(new Blob(["(async()=>{postMessage(await " + ${JSON.stringify(PROBE)} + ")})()"], { type: "text/javascript" })));
w.onmessage = (e) => (window.worker = e.data);
const sh = new SharedWorker(URL.createObjectURL(new Blob(["onconnect=async(e)=>{e.ports[0].postMessage(await " + ${JSON.stringify(PROBE)} + ")}"], { type: "text/javascript" })));
sh.port.onmessage = (e) => (window.shared = e.data);
window.addEventListener("message", (e) => { if (e.data && e.data.fp) window.frameFp = e.data.fp; });
</script></body>`;
const FRAME = `<!doctype html><script>(async () => { parent.postMessage({ fp: await ${PROBE} }, "*"); })();</script>`;
const server = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(q.url === "/frame" ? FRAME : PAGE.replace("PORT", server.address().port)); }).listen(0, "0.0.0.0");
const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title>home")).listen(0);
process.env.SOLANA_OS_URL = `http://127.0.0.1:${home.address().port}`;

const { app } = require("electron");
require("../src/main.js");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...require("../src/window").shells][0];
    const tab = s.newTab(`http://127.0.0.1:${server.address().port}/`);
    await new Promise((r) => (tab.isLoading() ? tab.once("did-finish-load", r) : r()));
    await wait(1500);
    const got = await tab.executeJavaScript("({ main: window.main, worker: window.worker, shared: window.shared, frame: window.frameFp })");
    const p = Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v ? JSON.parse(v) : null]));
    console.log("[fingerprint]", JSON.stringify(p));
    check("user agent looks like Chrome (no Electron/STRATA tokens)", /Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(p.main?.ua) && !/Electron|SolanaOS|STRATA/i.test(p.main?.ua), p.main?.ua);
    for (const k of ["worker", "shared", "frame"]) {
      check(`${k}: same user agent as the page`, p[k] && p[k].ua === p.main.ua, { page: p.main?.ua, [k]: p[k]?.ua });
      // Shared workers get navigator.languages from Electron's process locale (not settable); compare the rest.
      check(`${k}: same client hints${k === "shared" ? "" : " and languages"}`, p[k] && p[k].brands === p.main.brands && p[k].full === p.main.full && (k === "shared" || p[k].languages === p.main.languages), { page: p.main, [k]: p[k] });
    }
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[fingerprint] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
