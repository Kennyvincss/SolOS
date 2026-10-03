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
  fs.writeFileSync(path.join(OUT, "timings.json"), JSON.stringify(timings, null, 1));
};

function startRecording() {
  rec = spawn("ffmpeg", ["-y", "-v", "error", "-f", "x11grab", "-draw_mouse", "0", "-framerate", "30", "-video_size", "1920x1080", "-i", `${process.env.DISPLAY}.0+0,0`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+frag_keyframe+empty_moov", path.join(OUT, "demo.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
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
  await findTransaction();
  for (const id of [...s.tabs.keys()]) if (id !== tab(s).id) s.closeTab(id);
  await go(s, `${U}/`, 12000);
  s.win.focus();
}

// Voiceover length per scene (seconds); each scene lasts at least LEAD + line + TAIL.
const VO = {"lite": 7.62, "dashboard": 6.53, "search": 5.18, "tokens": 4.99, "token": 6.57, "why": 4.2, "ai": 7.04, "discover": 2.71, "explore": 5.7, "wallets": 4.35, "tx": 3.35, "security": 6.61, "apps": 5.85, "wallet": 5.1, "connect": 3.29, "profiles": 4.95, "tabs": 3.75, "library": 4.44, "permissions": 6.31, "developers": 5.8, "settings": 4.82, "outro": 8.28};
const LEAD = 0.5, TAIL = 0.8;
let sceneStart = 0, sceneKey = "";
const holdTo = async () => {
  const left = sceneStart + (LEAD + (VO[sceneKey] || 0) + TAIL) * 1000 - Date.now();
  if (left > 0) await sleep(left);
};
// Click the smallest visible element whose own text matches.
const CLICK = (re) => `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const els = [...document.querySelectorAll("button, a, [role=button], [role=radio], [role=tab], label, span, div")].filter((e) => vis(e) && ${re}.test((e.innerText || "").trim()));
  els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
  const el = els[0];
  if (!el) return false;
  (el.closest("button, a, [role=button], [role=radio], [role=tab], label") || el).click();
  return true;
})()`;
const typeInPage = async (wc, selector, text, delay = 70) => {
  await wc.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return true; })()`);
  await typeInto(wc, text, delay);
};
let TX_SIG = "";
async function findTransaction() {
  try {
    const r = await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", { limit: 25 }] }) });
    const j = await r.json();
    TX_SIG = (j.result || []).find((x) => !x.err)?.signature || "";
  } catch {}
  log("tx", TX_SIG ? "found" : "none");
}

const SCENES = {
  async lite(s) {
    await sleep(3800);
    await tab(s).executeJavaScript(CLICK("/^Pro$/"));
    await sleep(3600);
  },
  async dashboard(s) {
    await tab(s).executeJavaScript(SCROLL(420, 2600)).catch(() => {});
    await sleep(2800);
    await tab(s).executeJavaScript(SCROLL(-420, 1500)).catch(() => {});
  },
  async search(s) {
    const sw = s.win.webContents;
    sw.focus();
    await sw.executeJavaScript("(() => { const a = document.getElementById('address'); a.focus(); a.select(); return true; })()");
    await sleep(300);
    await typeInto(sw, "jupiter", 110);
    await sleep(250);
    press(sw, "Enter");
    await sleep(3200);
    await tab(s).executeJavaScript(SCROLL(480, 2200)).catch(() => {});
  },
  async tokens(s) {
    await go(s, `${U}/tokens?tab=trending`, 2400);
    for (const t of ["Gainers", "Losers", "New"]) {
      await tab(s).executeJavaScript(CLICK(`/^${t}$/`));
      await sleep(1300);
    }
  },
  async token(s) {
    await go(s, `${U}/tokens/${SOL}`, 3200);
    await tab(s).executeJavaScript(CLICK("/^(Watch|Add to watchlist)$/")).catch(() => {});
    await sleep(1000);
    await tab(s).executeJavaScript(SCROLL(560, 2600)).catch(() => {});
  },
  async why(s) {
    await tab(s).executeJavaScript(SCROLL(-260, 900)).catch(() => {});
    await sleep(700);
    await tab(s).executeJavaScript(CLICK("/^Generate$/"));
    await sleep(7500);
  },
  async ai(s) {
    await tab(s).executeJavaScript(SCROLL(-600, 600)).catch(() => {});
    s.togglePanel(true);
    await sleep(2000);
    const pw = s.panel?.view.webContents;
    if (pw) {
      const q = "Is SOL a good buy right now? Keep it short.";
      for (let i = 1; i <= q.length; i++) {
        await pw.executeJavaScript(`(() => { const ta = document.querySelector("textarea"); if (!ta) return false; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, ${JSON.stringify(q)}.slice(0, ${i})); ta.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
        await sleep(35);
      }
      await sleep(250);
      await pw.executeJavaScript(`(() => { const ta = document.querySelector("textarea"); ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); return true; })()`);
    }
    await sleep(11000);
    s.togglePanel(false);
    await sleep(600);
  },
  async discover(s) {
    await go(s, `${U}/discover`, 3200);
  },
  async explore(s) {
    for (const p of ["/apps?category=NFTs", "/defi", "/rwa", "/news"]) await go(s, `${U}${p}`, 2300);
  },
  async wallets(s) {
    await go(s, `${U}/wallets`, 2200);
    await tab(s).executeJavaScript(CLICK("/^demo wallet$/i"));
    await sleep(4200);
  },
  async tx(s) {
    await go(s, `${U}/tx`, 2000);
    if (TX_SIG) {
      await typeInPage(tab(s), "input", TX_SIG, 12);
      await sleep(300);
      await tab(s).executeJavaScript(CLICK("/^Explain/"));
    }
    await sleep(5000);
  },
  async security(s) {
    await go(s, `${U}/security`, 2000);
    await typeInPage(tab(s), "input", "jup-ag-claim.com", 60);
    await sleep(300);
    await tab(s).executeJavaScript(CLICK("/^Check$/"));
    await sleep(5000);
  },
  async apps(s) {
    await go(s, `${U}/apps`, 2600);
    await tab(s).executeJavaScript(CLICK("/^Jupiter$/"));
    await sleep(3200);
  },
  async wallet(s) {
    await go(s, `${U}/extensions`, 2200);
    const pt = await s.win.webContents.executeJavaScript("(() => { const el = document.querySelector('browser-action-list'); const b = el && el.shadowRoot.querySelector('.action, [part~=action]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
    if (!pt) throw new Error("no toolbar button");
    const before = new Set(BrowserWindow.getAllWindows());
    s.win.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    s.win.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    const pop = await newWindowReady(before, /^(send|receive|swap|buy)$/i, 12000);
    await holdTo();
    if (pop && !pop.isDestroyed()) pop.close();
    await sleep(500);
  },
  async connect(s) {
    await go(s, `${U}/tokens/${SOL}`, 2200);
    const wc = tab(s);
    await wc.executeJavaScript(clickText("/^Connect wallet$/i"));
    await sleep(1300);
    const before = new Set(BrowserWindow.getAllWindows());
    await wc.executeJavaScript(clickText("/^Phantom/"));
    const pop = await newWindowReady(before, /^connect$/i);
    await sleep(900);
    if (pop) await until(() => pop.webContents.executeJavaScript(clickText("/^connect$/i")), 8000);
    await sleep(2200);
    await wc.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true").catch(() => {});
  },
  async profiles(s) {
    require("../src/ipc").openProfileBubble(s, null);
    await holdTo();
    require("../src/bubbles").close();
    await sleep(400);
  },
  async tabs(s) {
    const a = s.newTab(`${U}/defi`, { background: true }).id;
    const b = s.newTab(`${U}/news`, { background: true }).id;
    await sleep(700);
    s.addToNewGroup([a, b], { title: "Research", color: "blue" });
    await sleep(1800);
    require("../src/menus").setVertical(s.profile, true);
    await sleep(2000);
    require("../src/menus").setVertical(s.profile, false);
    await sleep(600);
    s.splitTabs(tab(s).id, a);
    await sleep(3200);
    for (const id of [a, b]) s.closeTab(id);
    await sleep(600);
  },
  async library(s) {
    require("../src/ipc").openBookmarkEditor(s, null, null);
    await sleep(2400);
    require("../src/bubbles").close();
    require("../src/ipc").actionsFor(s).toggleBookmarksBar?.();
    await sleep(900);
    await go(s, `${U}/history`, 2400);
    require("../src/ipc").actionsFor(s).toggleBookmarksBar?.();
  },
  async permissions(s) {
    await go(s, "https://stratabrowser.xyz", 2500);
    await tab(s).executeJavaScript("Notification.requestPermission(); true", true).catch(() => {});
    await sleep(3200);
    const p = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith("/permission.html"));
    if (p) await p.webContents.executeJavaScript("document.getElementById('allow').click(); true").catch(() => {});
    await sleep(800);
  },
  async developers(s) {
    await go(s, `${U}/developers`, 3200);
    await go(s, `${U}/payments`, 2600);
  },
  async settings(s) {
    await go(s, `${U}/settings`, 2400);
    await tab(s).executeJavaScript(SCROLL(380, 2000)).catch(() => {});
  },
  async outro(s) {
    await go(s, "https://stratabrowser.xyz", 1500);
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
    sceneKey = key;
    sceneStart = Date.now();
    try {
      await SCENES[key](s);
    } catch (e) {
      log("FAILED", key, String(e?.stack || e).split("\n")[0]);
    }
    await holdTo();
  }
  mark("end");
  await stopRecording();
  fs.writeFileSync(path.join(OUT, "timings.json"), JSON.stringify(timings, null, 1));
  log("done");
  app.exit(0);
});
