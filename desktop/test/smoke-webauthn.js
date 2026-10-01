// Passkeys: Google sign-in pages see no passkey support (no Windows
// security-key popup); every other site keeps the browser's built-ins
// untouched (bot checks like Cloudflare Turnstile fail on modified ones).
// Run: xvfb-run -a npx electron test/smoke-webauthn.js
const http = require("node:http");

const PAGE = `<!doctype html><title>passkeys</title><body><button id="b" style="width:300px;height:200px">Use passkey</button><script>
const ask = () => { const t = performance.now(); return navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), timeout: 3000, userVerification: "discouraged" } })
  .then(() => ({ ok: true }), (e) => ({ name: e.name, ms: Math.round(performance.now() - t) })); };
window.onLoad = ask();
window.info = { pkc: typeof PublicKeyCredential, nativeGet: String(CredentialsContainer.prototype.get).includes("[native code]"), nativeCreate: String(CredentialsContainer.prototype.create).includes("[native code]") };
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
    const info = await tab.executeJavaScript("window.info");
    check("other sites keep native passkey functions", info.pkc === "function" && info.nativeGet && info.nativeCreate, info);
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
