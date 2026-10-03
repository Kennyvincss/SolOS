// Product demo screen recording (needs internet; GitHub Actions): sets up a
// throwaway Phantom wallet off camera, then records the real app against the
// live site at 1920×1080 and writes demo.mp4 + timings.json to $DEMO_DIR.
// Scene lengths leave room for the voiceover added afterwards.
// Run: xvfb-run -a -s "-screen 0 1920x1080x24" npx electron test/demo-recording.js
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, session, webContents } = require("electron");
require("../src/main.js");
const { SOLANA_OS_URL: U } = require("../src/lib");
const { installExtension } = require("electron-chrome-web-store");
const { generateMnemonic } = require("@scure/bip39");
const { wordlist } = require("@scure/bip39/wordlists/english.js");
const { PAGE_STATE, clickText, drive } = require("./lib-phantom");

const OUT = process.env.DEMO_DIR || path.join(__dirname, "..", "dist", "demo");
const PHANTOM = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const SOL = "So11111111111111111111111111111111111111112";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[demo]", ...a);

const until = async (fn, timeout = 20000, step = 250) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return null;
};

// Scroll the page's main scroller smoothly by `px` over `ms`.
const SCROLL = (px, ms) => `(() => new Promise((done) => {
  const all = [document.scrollingElement, ...document.querySelectorAll("main, div, section")];
  const el = all.find((e) => e && e.scrollHeight > e.clientHeight + 80 && (e === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(e).overflowY))) || document.scrollingElement;
  const from = el.scrollTop, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ${ms}); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; el.scrollTop = from + ${px} * e; k < 1 ? requestAnimationFrame(step) : done(true); };
  requestAnimationFrame(step);
}))()`;

let rec = null;
let t0 = 0;
const timings = [];
const mark = (key) => {
  timings.push({ key, t: (Date.now() - t0) / 1000 });
  log("scene", key, timings.at(-1).t.toFixed(2));
};

function startRecording() {
  rec = spawn("ffmpeg", ["-y", "-v", "error", "-f", "x11grab", "-draw_mouse", "0", "-framerate", "30", "-video_size", "1920x1080", "-i", `${process.env.DISPLAY}.0+0,0`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", path.join(OUT, "demo.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  t0 = Date.now();
}
async function stopRecording() {
  rec.stdin.write("q");
  await new Promise((r) => rec.on("close", r));
}

const tab = (s) => s.activeTab.view.webContents;
async function go(s, url, wait) {
  tab(s).loadURL(url).catch(() => {});
  await sleep(wait);
}
async function typeInto(wc, text, delay = 95) {
  for (const ch of text) {
    wc.sendInputEvent({ type: "char", keyCode: ch });
    await sleep(delay);
  }
}
const press = (wc, key) => {
  wc.sendInputEvent({ type: "keyDown", keyCode: key });
  wc.sendInputEvent({ type: "char", keyCode: key === "Enter" ? "\r" : key });
  wc.sendInputEvent({ type: "keyUp", keyCode: key });
};
async function newWindowReady(before, re, timeout = 20000) {
  const pop = await until(async () => BrowserWindow.getAllWindows().find((w) => !before.has(w) && !w.isDestroyed() && w.isVisible()), timeout);
  if (pop) await until(() => pop.webContents.executeJavaScript(PAGE_STATE).then((st) => st && st.buttons.some((b) => re.test(b))), timeout);
  return pop;
}

async function setup(s) {
  const ses = session.fromPartition("persist:solanaos");
  await installExtension(PHANTOM, { session: ses });
  const ob = await until(async () => webContents.getAllWebContents().find((w) => w.getURL().includes(`${PHANTOM}/onboarding`)), 30000);
  if (!ob || !(await drive(ob, generateMnemonic(wordlist).split(" "), "Strata-demo-Pa55!", () => {}))) throw new Error("Phantom onboarding failed");
  await sleep(2500);
  for (const w of BrowserWindow.getAllWindows()) if (w !== s.win && !w.isDestroyed() && w.webContents.getURL().includes(PHANTOM)) w.close();
  const profiles = require("../src/profiles");
  if (profiles.list().length < 3) {
    profiles.create({ name: "Trading", color: "#ec4899" });
    profiles.create({ name: "Degen", color: "#14b8a6" });
  }
  // A fresh tab for the recording, in the dashboard ("Pro") view.
  s.newTab(`${U}/`);
  await sleep(5000);
  await tab(s).executeJavaScript("sessionStorage.setItem('strata:mode','pro'); true");
  for (const id of [...s.tabs.keys()]) if (id !== tab(s).id) s.closeTab(id);
  await go(s, `${U}/`, 12000);
  s.win.focus();
}

const SCENES = {
  async intro(s) {
    await sleep(7500);
  },
  async search(s) {
    const sw = s.win.webContents;
    sw.focus();
    await sw.executeJavaScript("(() => { const a = document.getElementById('address'); a.focus(); a.select(); return true; })()");
    await sleep(500);
    await typeInto(sw, "jupiter", 130);
    await sleep(400);
    press(sw, "Enter");
    await sleep(4500);
    await tab(s).executeJavaScript(SCROLL(520, 3200)).catch(() => {});
    await sleep(3200);
  },
  async token(s) {
    await go(s, `${U}/tokens/${SOL}`, 4500);
    await tab(s).executeJavaScript(SCROLL(640, 4200)).catch(() => {});
    await sleep(2400);
  },
  async ai(s) {
    await tab(s).executeJavaScript(SCROLL(-640, 900)).catch(() => {});
    s.togglePanel(true);
    await sleep(2500);
    const pw = s.panel?.view.webContents;
    if (pw) {
      const q = "What's moving SOL this week? Keep it short.";
      for (let i = 1; i <= q.length; i++) {
        await pw.executeJavaScript(`(() => { const ta = document.querySelector("textarea"); if (!ta) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, ${JSON.stringify(q)}.slice(0, ${i})); ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        await sleep(45);
      }
      await sleep(300);
      await pw.executeJavaScript(`(() => { const ta = document.querySelector("textarea"); ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); return true; })()`);
    }
    await sleep(15000);
    s.togglePanel(false);
    await sleep(800);
  },
  async wallet(s) {
    const pt = await s.win.webContents.executeJavaScript("(() => { const el = document.querySelector('browser-action-list'); const b = el && el.shadowRoot.querySelector('.action, [part~=action]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
    if (!pt) throw new Error("no toolbar button");
    const before = new Set(BrowserWindow.getAllWindows());
    s.win.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    s.win.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    const pop = await newWindowReady(before, /^(send|receive|swap|buy)$/i, 15000);
    await sleep(5500);
    if (pop && !pop.isDestroyed()) pop.close();
    await sleep(700);
  },
  async connect(s) {
    const wc = tab(s);
    await wc.executeJavaScript(clickText("/^Connect wallet$/i"));
    await sleep(1600);
    let before = new Set(BrowserWindow.getAllWindows());
    await wc.executeJavaScript(clickText("/^Phantom/"));
    let pop = await newWindowReady(before, /^connect$/i);
    await sleep(1200);
    if (pop) await until(() => pop.webContents.executeJavaScript(clickText("/^connect$/i")), 8000);
    await sleep(2500);
    before = new Set(BrowserWindow.getAllWindows());
    await until(() => wc.executeJavaScript(clickText("/Sign in with this wallet/i")), 8000);
    pop = await newWindowReady(before, /^(confirm|sign|approve)$/i);
    await sleep(1800);
    if (pop) await until(() => pop.webContents.executeJavaScript(clickText("/^(confirm|sign|approve)$/i")), 8000);
    await sleep(3000);
    await wc.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true").catch(() => {});
    await sleep(600);
  },
  async profiles(s) {
    require("../src/ipc").openProfileBubble(s, null);
    await sleep(6500);
    require("../src/bubbles").close();
    await sleep(500);
  },
  async outro(s) {
    s.newTab("https://stratabrowser.xyz");
    await sleep(9500);
  },
};

process.on("unhandledRejection", (e) => log("unhandled", String(e?.stack || e)));
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await sleep(3000);
  const s = [...require("../src/window").shells][0];
  s.win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
  s.layout();
  if (process.env.SURVEY) {
    // Screenshot every page once, to choose what to record.
    const { execFileSync } = require("node:child_process");
    for (const u of process.env.SURVEY.split(",")) {
      tab(s) ? tab(s).loadURL(`${U}${u}`).catch(() => {}) : s.newTab(`${U}${u}`);
      await sleep(9000);
      const name = u.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
      execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "x11grab", "-draw_mouse", "0", "-video_size", "1920x1080", "-i", `${process.env.DISPLAY}.0+0,0`, "-frames:v", "1", path.join(OUT, `survey-${name}.png`)]);
      log("survey", u);
    }
    app.exit(0);
    return;
  }
  try {
    await setup(s);
  } catch (e) {
    log("SETUP FAILED", String(e?.stack || e).split("\n")[0]);
  }
  startRecording();
  await sleep(500);
  for (const key of Object.keys(SCENES)) {
    mark(key);
    try {
      await SCENES[key](s);
    } catch (e) {
      log("FAILED", key, String(e?.stack || e).split("\n")[0]);
    }
  }
  mark("end");
  await stopRecording();
  fs.writeFileSync(path.join(OUT, "timings.json"), JSON.stringify(timings, null, 1));
  log("done");
  app.exit(0);
});
