// "Continue with Google"-style sign-in: the site opens a popup with
// window.open(url, name, "width=…,height=…"); the popup (after its redirects)
// posts the result to window.opener and closes itself. The popup must be a
// small window linked to the site, not a new browser window or tab.
// Run: xvfb-run -a npx electron test/smoke-popups.js
const http = require("node:http");

let port = 0;
const pages = {
  "/site": `<!doctype html><title>Site</title><body><button id="b" style="width:300px;height:200px">Continue with Google</button><script>
    window.result = null;
    window.addEventListener("message", (e) => { if (e.data && e.data.token) window.result = { token: e.data.token, from: e.origin }; });
    document.getElementById("b").onclick = () => { window.pop = window.open("/auth/start", "auth", "width=480,height=620"); };
  </script></body>`,
  // Like an identity provider: a sign-in form, then a redirect to the site's callback.
  "/auth/start": `<!doctype html><title>Sign in</title><body><form action="/auth/callback" method="get"><input name="user" value="me"><button id="go">Next</button></form></body>`,
  "/auth/callback": `<!doctype html><title>Done</title><body>Signing you in…<script>
    if (window.opener) { window.opener.postMessage({ token: "abc123" }, "*"); window.close(); }
    else document.body.textContent = "BLANK: no opener";
  </script></body>`,
};
const server = http.createServer((q, r) => {
  const p = q.url.split("?")[0];
  r.setHeader("content-type", "text/html");
  r.end(pages[p] ?? "<!doctype html><title>Home</title>home");
}).listen(0);
port = server.address().port;
process.env.SOLANA_OS_URL = `http://127.0.0.1:${port}`;

const { app, BrowserWindow } = require("electron");
require("../src/main.js");
const W = require("../src/window");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
const click = async (wc, sel) => {
  const r = await wc.executeJavaScript(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.x + 20), y: Math.round(b.y + 10) }; })()`);
  wc.sendInputEvent({ type: "mouseDown", x: r.x, y: r.y, button: "left", clickCount: 1 });
  wc.sendInputEvent({ type: "mouseUp", x: r.x, y: r.y, button: "left", clickCount: 1 });
};

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...W.shells][0];
    const tab = s.newTab(`http://127.0.0.1:${port}/site`);
    await new Promise((r) => (tab.isLoading() ? tab.once("did-finish-load", r) : r()));
    await wait(300);
    const shellsBefore = W.shells.size;
    const tabsBefore = s.tabs.size;
    const winsBefore = new Set(BrowserWindow.getAllWindows());

    await click(tab, "#b");
    let popup = null;
    for (let i = 0; i < 40 && !popup; i++) {
      await wait(100);
      popup = BrowserWindow.getAllWindows().find((w) => !winsBefore.has(w));
    }
    check("a popup window opens", popup);
    check("no new browser window", W.shells.size === shellsBefore, W.shells.size);
    check("no new tab", s.tabs.size === tabsBefore, s.tabs.size);
    if (popup) {
      const b = popup.getContentBounds();
      check("popup has the requested size", Math.abs(b.width - 480) <= 2 && Math.abs(b.height - 620) <= 2, b);
      await new Promise((r) => (popup.webContents.isLoading() ? popup.webContents.once("did-finish-load", r) : r()));
      check("popup title shows the site", /127\.0\.0\.1/.test(popup.getTitle()), popup.getTitle());
      // "Enter details" and continue.
      await click(popup.webContents, "#go");
      for (let i = 0; i < 40 && !popup.isDestroyed(); i++) await wait(100);
      check("popup closes itself after sign-in", popup.isDestroyed());
      const result = await tab.executeJavaScript("window.result");
      check("site receives the sign-in result", result?.token === "abc123", result);
    }
    // Plain links that ask for a new window (no size) still open a browser window.
    const before = W.shells.size;
    await tab.executeJavaScript(`window.open("/other", "_blank", "noopener"); true`, true);
    await wait(800);
    check("window.open without a size still opens a tab or window", W.shells.size > before || s.tabs.size > tabsBefore, { shells: W.shells.size, tabs: s.tabs.size });
  } catch (e) {
    check("no exception", false, String(e?.stack || e));
  }
  for (const c of checks) console.log(`[popups] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
