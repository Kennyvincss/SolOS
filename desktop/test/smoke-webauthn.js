// Passkey prompts: a page can't open one on its own (Google sign-in, which
// does that on load, sees no passkey support), but a click still can.
// Run: xvfb-run -a npx electron test/smoke-webauthn.js
const http = require("node:http");

const PAGE = `<!doctype html><title>passkeys</title><body><button id="b" style="width:300px;height:200px">Use passkey</button><script>
const ask = () => { const t = performance.now(); return navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), timeout: 3000, userVerification: "discouraged" } })
  .then(() => ({ ok: true }), (e) => ({ name: e.name, ms: Math.round(performance.now() - t) })); };
window.onLoad = ask();
window.info = { pkc: typeof PublicKeyCredential };
(window.PublicKeyCredential ? PublicKeyCredential.isConditionalMediationAvailable() : Promise.resolve("no PKC")).then((v) => (window.info.conditional = v));
document.getElementById("b").onclick = () => { window.onClick = ask(); };
</script></body>`;
const site = http.createServer((_q, r) => r.end(PAGE)).listen(0);
const home = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title>home")).listen(0);
process.env.SOLANA_OS_URL = `http://127.0.0.1:${home.address().port}`;
process.env.STRATA_NO_PASSKEY_HOSTS = "nopasskeys.localhost";

const { app } = require("electron");
app.commandLine.appendSwitch("host-resolver-rules", "MAP nopasskeys.localhost 127.0.0.1");
require("../src/main.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...require("../src/window").shells][0];
    const port = site.address().port;
    const tab = s.newTab(`http://localhost:${port}/`);
    await new Promise((r) => (tab.isLoading() ? tab.once("did-finish-load", r) : r()));
    await wait(300);
    const onLoad = await tab.executeJavaScript("window.onLoad");
    check("prompt started on page load is declined at once", onLoad?.name === "NotAllowedError" && onLoad.ms < 200, onLoad);
    const info = await tab.executeJavaScript("window.info");
    check("passkey autofill reported unavailable", info.conditional === false, info);
    // A real click: the request goes through to the system (no instant decline).
    const r = await tab.executeJavaScript("(() => { const b = document.getElementById('b').getBoundingClientRect(); return { x: Math.round(b.x + 50), y: Math.round(b.y + 50) }; })()");
    tab.sendInputEvent({ type: "mouseDown", x: r.x, y: r.y, button: "left", clickCount: 1 });
    tab.sendInputEvent({ type: "mouseUp", x: r.x, y: r.y, button: "left", clickCount: 1 });
    await wait(400);
    const clicked = await tab.executeJavaScript("window.onClick ? Promise.race([window.onClick, new Promise((r) => setTimeout(() => r('pending'), 100))]) : 'not clicked'");
    check("prompt started by a click is passed through", clicked === "pending" || (clicked && clicked.ms >= 200) || clicked?.name !== "NotAllowedError", clicked);

    const g = s.newTab(`http://nopasskeys.localhost:${port}/`);
    await new Promise((r) => (g.isLoading() ? g.once("did-finish-load", r) : r()));
    await wait(300);
    const gi = await g.executeJavaScript("window.info");
    check("Google sign-in pages see no passkey support", gi.pkc === "undefined", gi);
    const gl = await g.executeJavaScript("window.onLoad");
    check("…and a passkey request there is declined", gl?.name === "NotAllowedError", gl);
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[webauthn] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
