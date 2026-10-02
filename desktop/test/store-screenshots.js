// Microsoft Store screenshots (needs internet; GitHub Actions): drives the real
// app against the live site at 1920×1080 and saves PNGs to $SHOTS_DIR.
// Phantom is set up with a throwaway wallet, so no real funds or keys appear.
// Run: xvfb-run -a -s "-screen 0 1920x1080x24" npx electron test/store-screenshots.js
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { app, BrowserWindow, session, webContents } = require("electron");
require("../src/main.js");
const { SOLANA_OS_URL: U } = require("../src/lib");
const { installExtension } = require("electron-chrome-web-store");
const { generateMnemonic } = require("@scure/bip39");
const { wordlist } = require("@scure/bip39/wordlists/english.js");
const { PAGE_STATE, drive } = require("./lib-phantom");

const OUT = process.env.SHOTS_DIR || path.join(__dirname, "..", "dist", "store-screenshots");
const PHANTOM = "bfnaelmomeimhlpmgjnjophhpkkoljpa";
const SOL = "So11111111111111111111111111111111111111112";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[shots]", ...a);

async function shoot(name) {
  await sleep(700);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "x11grab", "-draw_mouse", "0", "-video_size", "1920x1080", "-i", `${process.env.DISPLAY}.0+0,0`, "-frames:v", "1", path.join(OUT, `${name}.png`)]);
  log("saved", name);
}

async function go(s, url, wait = 9000) {
  const wc = s.activeTab?.view.webContents;
  if (wc) wc.loadURL(url).catch(() => {});
  else s.newTab(url);
  await sleep(wait);
  return s.activeTab.view.webContents;
}

const until = async (fn, timeout = 20000, step = 250) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return null;
};

const STEPS = {
  async home(s) {
    const wc = await go(s, `${U}/`, 6000);
    await wc.executeJavaScript("sessionStorage.setItem('strata:mode','pro'); true");
    await go(s, `${U}/`, 12000);
    await shoot("1-home");
  },
  async search(s) {
    await go(s, `${U}/search?q=jupiter`, 14000);
    await shoot("2-search");
  },
  async token(s) {
    await go(s, `${U}/tokens/${SOL}`, 14000);
    await shoot("3-token");
  },
  async ai(s) {
    await go(s, `${U}/tokens/${SOL}`, 10000);
    s.togglePanel(true);
    await sleep(6000);
    const pw = s.panel?.view.webContents;
    if (pw) {
      await pw.executeJavaScript(`(() => {
        const ta = document.querySelector("textarea");
        if (!ta) return false;
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        set.call(ta, "What's moving SOL this week? Keep it short.");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        return true;
      })()`);
      await sleep(20000);
    }
    await shoot("5-ai");
    s.togglePanel(false);
    await sleep(1000);
  },
  async profiles(s) {
    const profiles = require("../src/profiles");
    if (profiles.list().length < 3) {
      profiles.create({ name: "Trading", color: "#ec4899" });
      profiles.create({ name: "Degen", color: "#14b8a6" });
    }
    await go(s, `${U}/`, 8000);
    require("../src/ipc").openProfileBubble(s, null);
    await sleep(2500);
    await shoot("6-profiles");
    require("../src/bubbles").close();
    await sleep(600);
  },
  async split(s) {
    const left = (await go(s, `${U}/tokens/${SOL}`, 8000)).id;
    const right = s.newTab(`${U}/tokens?tab=trending`).id;
    await sleep(1000);
    s.splitTabs(left, right);
    await sleep(800);
    webContents.fromId(left)?.reload();
    await sleep(12000);
    await shoot("7-split");
    s.closeTab(right);
    await sleep(800);
  },
  async phantom(s) {
    const ses = session.fromPartition("persist:solanaos");
    await installExtension(PHANTOM, { session: ses });
    const ob = await until(async () => webContents.getAllWebContents().find((w) => w.getURL().includes(`${PHANTOM}/onboarding`)), 30000);
    if (!ob || !(await drive(ob, generateMnemonic(wordlist).split(" "), "Strata-shots-Pa55!", () => {}))) throw new Error("Phantom onboarding failed");
    await sleep(2500);
    for (const w of BrowserWindow.getAllWindows()) if (w !== s.win && !w.isDestroyed() && w.webContents.getURL().includes(PHANTOM)) w.close();
    s.win.focus();
    s.newTab(`${U}/tokens/${SOL}`);
    await sleep(14000);
    const pt = await s.win.webContents.executeJavaScript("(() => { const el = document.querySelector('browser-action-list'); const b = el && el.shadowRoot.querySelector('.action, [part~=action]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
    if (!pt) throw new Error("no toolbar button");
    const before = new Set(BrowserWindow.getAllWindows());
    s.win.webContents.sendInputEvent({ type: "mouseDown", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    s.win.webContents.sendInputEvent({ type: "mouseUp", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    const pop = await until(async () => BrowserWindow.getAllWindows().find((w) => !before.has(w) && !w.isDestroyed() && w.isVisible()), 15000);
    if (pop) await until(() => pop.webContents.executeJavaScript(PAGE_STATE).then((st) => st && st.buttons.some((b) => /^(send|receive|swap|buy)$/i.test(b))), 20000);
    await sleep(2000);
    await shoot("4-phantom");
  },
};

process.on("unhandledRejection", (e) => log("unhandled", String(e?.stack || e)));
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await sleep(3000);
  const s = [...require("../src/window").shells][0];
  s.win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
  s.layout();
  await sleep(1500);
  for (const name of (process.env.SHOTS || "home,search,token,ai,profiles,phantom").split(",")) {
    try {
      await STEPS[name](s);
    } catch (e) {
      log("FAILED", name, String(e?.stack || e).split("\n")[0]);
    }
  }
  app.exit(0);
});
