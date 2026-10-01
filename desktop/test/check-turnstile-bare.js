// Experiment: Turnstile in a bare Electron window (none of STRATA's code), to
// see what Cloudflare objects to. Env: UA=chrome|default, SHIM=1 (fill
// window.chrome in every frame). Pages as in check-turnstile.js.
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");
const chromeUA = (ua) => ua.replace(/\s(Electron|[\w-]+)\/\d[\w.]*(?=\s|$)/g, (m) => (/Chrome|Safari|AppleWebKit|Mozilla/.test(m) ? m : "")).replace(/Chrome\/(\d+)\.[\d.]+/, "Chrome/$1.0.0.0").trim();
// CI machines have no GPU: Chrome falls back to software WebGL there, Electron
// needs to be told to (otherwise WebGL is missing, which fails any bot check).
if (process.env.SWGL) for (const [k, v] of [["ignore-gpu-blocklist"], ["enable-unsafe-swiftshader"], ["use-angle", "swiftshader"]]) app.commandLine.appendSwitch(k, v);
if (process.env.UA === "chrome") app.userAgentFallback = chromeUA(app.userAgentFallback);
const PAGES = (process.env.TURNSTILE_PAGES || "https://2captcha.com/demo/cloudflare-turnstile,https://seleniumbase.io/apps/turnstile").split(",");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = `[bare UA=${process.env.UA || "default"} SHIM=${process.env.SHIM || 0} BRAND=${process.env.BRAND || 0} SWGL=${process.env.SWGL || 0}]`;

const frames = new Map(); // DevTools session -> target id
const urls = new Map(); // target id -> current URL
const events = new Map(); // session -> [lines] (DIAG=1)
const note = (sid, line) => { if (!events.has(sid)) events.set(sid, []); const a = events.get(sid); if (a.length < 400) a.push(line); };

/** Visible text of Cloudflare's widget (inside its closed shadow DOM), read through the DevTools protocol. */
async function widgetText(wc) {
  const out = [];
  for (const [sid, targetId] of frames) {
    const url = urls.get(targetId) || "";
    if (!/challenges\.cloudflare\.com/.test(url)) continue;
    const doc = await wc.debugger.sendCommand("DOM.getDocument", { depth: -1, pierce: true }, sid).catch(() => null);
    const walk = (n) => { if (!n) return; if (n.nodeType === 3 && n.nodeValue.trim()) out.push(n.nodeValue.trim()); for (const c of [...(n.children || []), ...(n.shadowRoots || []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c); };
    walk(doc && doc.root);
  }
  return out.join(" | ").slice(0, 200);
}

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
  if (!dbg.isAttached()) dbg.attach("1.3");
  const setup = async (sessionId) => {
    await dbg.sendCommand("Emulation.setUserAgentOverride", params, sessionId).catch((e) => console.log(tag, "override failed", String(e)));
    await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId).catch(() => {});
    if (sessionId) await dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
  };
  dbg.on("message", (_e, method, p, sid) => {
    if (method === "Target.targetInfoChanged") urls.set(p.targetInfo.targetId, p.targetInfo.url);
    if (process.env.DIAG && sid) {
      if (method === "Network.responseReceived") note(sid, `${p.response.status} ${p.type} ${p.response.url.slice(0, 110)}`);
      else if (method === "Network.loadingFailed") note(sid, `FAILED ${p.type} ${p.errorText} ${p.blockedReason || ""} ${p.corsErrorStatus ? JSON.stringify(p.corsErrorStatus) : ""}`);
      else if (method === "Runtime.consoleAPICalled") note(sid, `console.${p.type} ${(p.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160)}`);
      else if (method === "Runtime.exceptionThrown") note(sid, `EXCEPTION ${(p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text || "").slice(0, 200)}`);
      else if (method === "Log.entryAdded") note(sid, `log.${p.entry.level} ${p.entry.source} ${p.entry.text.slice(0, 160)}`);
      else if (method === "Target.attachedToTarget") note(sid, `child ${p.targetInfo.type} ${p.targetInfo.url.slice(0, 80)}`);
    }
    if (method !== "Target.attachedToTarget") return;
    urls.set(p.targetInfo.targetId, p.targetInfo.url);
    frames.set(p.sessionId, p.targetInfo.targetId);
    const go = async () => {
      if (process.env.DIAG) for (const m of ["Network.enable", "Runtime.enable", "Log.enable"]) await dbg.sendCommand(m, {}, p.sessionId).catch(() => {});
      if (process.env.DIAG) await dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, p.sessionId).catch(() => {});
      if (process.env.BRAND) setup(p.sessionId);
      else dbg.sendCommand("Runtime.runIfWaitingForDebugger", {}, p.sessionId).catch(() => {});
    };
    go();
  });
  dbg.sendCommand("Target.setDiscoverTargets", { discover: true }).catch(() => {});
  if (!process.env.BRAND) return dbg.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => {});
  return setup();
}

app.whenReady().then(async () => {
  const ses = session.fromPartition("persist:bare");
  if (process.env.SHIM) ses.registerPreloadScript({ id: "shim", type: "frame", filePath: path.join(__dirname, "chrome-shim.js") });
  const win = new BrowserWindow({ width: 1280, height: 900, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegrationInSubFrames: Boolean(process.env.SHIM) } });
  const wc = win.webContents;
  await wc.loadURL("about:blank"); // the debugger answers only once a page is loaded
  await brandAsChrome(wc); // BRAND=1: override; otherwise only watch frames
  for (const url of PAGES) {
    await wc.loadURL(url).catch(() => {});
    if (url === PAGES[0]) console.log(tag, "ua", await wc.executeJavaScript("navigator.userAgent + ' | brands: ' + (navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand).join('/') : '') + ' | chrome keys: ' + Object.keys(window.chrome || {}).join(',') + ' | webgl: ' + (() => { try { const g = document.createElement('canvas').getContext('webgl'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? (d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'yes') : 'NONE'; } catch (e) { return 'err'; } })()"));
    let token = -1, clicked = false;
    const seen = [];
    for (let i = 0; i < 26 && !(token > 0); i++) {
      await wait(1000);
      if ([2, 6, 12, 20, 25].includes(i)) seen.push(`${i}s: ${await widgetText(wc)}`);
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
    console.log(tag, url, token > 0 ? "PASSED" : "NOT PASSED", JSON.stringify({ token, widget: seen.map((x) => x.slice(0, 40)) }));
    if (process.env.DIAG) {
      for (const [sid, lines] of events) {
        const u = urls.get(frames.get(sid)) || sid;
        if (!/cloudflare/.test(u) && !lines.some((l) => /cloudflare/.test(l))) continue;
        console.log(tag, "frame", u.slice(0, 90));
        for (const l of lines.filter((l) => !/^200 (Image|Font|Stylesheet)/.test(l)).slice(-40)) console.log(tag, "   ", l);
      }
      events.clear();
    }
  }
  app.exit(0);
});
