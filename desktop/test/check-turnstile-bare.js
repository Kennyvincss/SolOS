// Experiment: Turnstile in a bare Electron window (none of STRATA's code), to
// see what Cloudflare objects to. Env: UA=chrome|default, SHIM=1 (fill
// window.chrome in every frame). Pages as in check-turnstile.js.
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");
const chromeUA = (ua) => ua.replace(/\s(Electron|[\w-]+)\/\d[\w.]*(?=\s|$)/g, (m) => (/Chrome|Safari|AppleWebKit|Mozilla/.test(m) ? m : "")).replace(/Chrome\/(\d+)\.[\d.]+/, "Chrome/$1.0.0.0").trim();
if (process.env.UA === "chrome") app.userAgentFallback = chromeUA(app.userAgentFallback);
const PAGES = (process.env.TURNSTILE_PAGES || "https://2captcha.com/demo/cloudflare-turnstile,https://seleniumbase.io/apps/turnstile").split(",");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = `[bare UA=${process.env.UA || "default"} SHIM=${process.env.SHIM || 0} BRAND=${process.env.BRAND || 0}]`;

/** Chrome's client hints (brands incl. "Google Chrome") via the DevTools protocol, for the page and every frame/worker. */
function brandAsChrome(wc) {
  const major = process.versions.chrome.split(".")[0];
  const full = process.versions.chrome;
  const plat = { linux: "Linux", win32: "Windows", darwin: "macOS" }[process.platform];
  const meta = {
    brands: [{ brand: "Chromium", version: major }, { brand: "Google Chrome", version: major }, { brand: "Not A(Brand", version: "99" }],
    fullVersionList: [{ brand: "Chromium", version: full }, { brand: "Google Chrome", version: full }, { brand: "Not A(Brand", version: "99.0.0.0" }],
    fullVersion: full, platform: plat, platformVersion: "", architecture: "x86", model: "", mobile: false, bitness: "64", wow64: false,
  };
  const params = { userAgent: app.userAgentFallback, userAgentMetadata: meta };
  const dbg = wc.debugger;
  dbg.attach("1.3");
  const setup = async (sessionId) => {
    await dbg.sendCommand("Emulation.setUserAgentOverride", params, sessionId).catch((e) => console.log(tag, "override failed", String(e)));
    await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId).catch(() => {});
    if (sessionId) await dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
  };
  dbg.on("message", (_e, method, p) => { if (method === "Target.attachedToTarget") setup(p.sessionId); });
  return setup();
}

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:bare");
  if (process.env.SHIM) ses.registerPreloadScript({ id: "shim", type: "frame", filePath: path.join(__dirname, "chrome-shim.js") });
  const win = new BrowserWindow({ width: 1280, height: 900, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: Boolean(process.env.SHIM) } });
  const wc = win.webContents;
  if (process.env.BRAND) {
    await wc.loadURL("about:blank"); // the debugger answers only once a page is loaded
    await brandAsChrome(wc);
  }
  for (const url of PAGES) {
    await wc.loadURL(url).catch(() => {});
    if (url === PAGES[0]) console.log(tag, "ua", await wc.executeJavaScript("navigator.userAgent + ' | brands: ' + (navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand).join('/') : '') + ' | chrome keys: ' + Object.keys(window.chrome || {}).join(',')"));
    let token = -1, clicked = false;
    for (let i = 0; i < 26 && !(token > 0); i++) {
      await wait(1000);
      token = await wc.executeJavaScript(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); return i ? i.value.length : -1; })()`).catch(() => -2);
      if (!(token > 0) && !clicked && i >= 3) {
        const r = await wc.executeJavaScript(`(() => { const i = document.querySelector('[name="cf-turnstile-response"]'); const box = i && (i.closest('.cf-turnstile, [class*="turnstile"]') || i.parentElement); if (!box) return null; const b = box.getBoundingClientRect(); return { x: Math.round(b.x + 30), y: Math.round(b.y + Math.min(b.height, 65) / 2) }; })()`).catch(() => null);
        if (r) {
          wc.sendInputEvent({ type: "mouseMove", x: r.x - 40, y: r.y + 10 });
          await wait(120);
          wc.sendInputEvent({ type: "mouseMove", x: r.x, y: r.y });
          wc.sendInputEvent({ type: "mouseDown", x: r.x, y: r.y, button: "left", clickCount: 1 });
          await wait(90);
          wc.sendInputEvent({ type: "mouseUp", x: r.x, y: r.y, button: "left", clickCount: 1 });
          clicked = true;
        }
      }
    }
    console.log(tag, url, token > 0 ? "PASSED" : "NOT PASSED", JSON.stringify({ token }));
  }
  app.exit(0);
});
