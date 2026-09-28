// Screenshots of the browser UI (whole screen, including pages and popovers).
// Run: xvfb-run -a -s "-screen 0 1440x900x24" npx electron test/visual-browser.js
const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const page = (title, bg) => `<!doctype html><title>${title}</title><body style="margin:0;font:15px sans-serif;background:${bg};color:#eee"><main style="padding:40px"><h1 style="font-weight:600">${title}</h1><p style="color:#aaa">Example page content for ${title}.</p></main></body>`;
const colors = ["#101018", "#0f1512", "#15100f", "#10131a"];
let n = 0;
const home = http.createServer((q, r) => r.end(page(q.url.startsWith("/ai") ? "STRATA AI" : `STRATA ${q.url}`, "#0b0b10"))).listen(0);
const other = http.createServer((q, r) => r.end(page(decodeURIComponent(q.url.slice(1)) || "Site", colors[n++ % colors.length]))).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;
const SITE = `http://127.0.0.1:${other.address().port}`;

const { app, dialog } = require("electron");
require("../src/main.js");
const W = require("../src/window");
const ipc = require("../src/ipc");
dialog.showMessageBox = async () => ({ response: 1 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.SHOTS_DIR || path.join(__dirname, "..", "shots");
const shot = (name) => {
  require("node:fs").mkdirSync(OUT, { recursive: true });
  execFileSync("python3", ["-c", `from PIL import ImageGrab; ImageGrab.grab(xdisplay=${JSON.stringify(process.env.DISPLAY)}).save(${JSON.stringify(path.join(OUT, name + ".png"))})`]);
};

app.whenReady().then(async () => {
  await wait(2500);
  const s = [...W.shells][0];
  s.win.setBounds({ x: 0, y: 0, width: 1440, height: 900 });
  const t = (p, o = {}) => s.newTab(`${SITE}/${encodeURIComponent(p)}`, { background: true, ...o }).id;
  const jup = t("Jupiter");
  const tok = t("BONK token");
  const wal = t("Whale wallet");
  const docs = t("Project docs");
  const wp = t("Whitepaper");
  const pm = t("Prediction market");
  const news = t("News");
  const pinned = t("Portfolio");
  s.setPinned(pinned, true);
  const g1 = s.addToNewGroup([jup, tok, wal], { title: "TRADING", color: "blue" });
  const g2 = s.addToNewGroup([docs, wp], { title: "RESEARCH", color: "purple" });
  s.addToNewGroup([pm, news], { title: "MARKETS", color: "orange" });
  s.updateGroup(g2, { collapsed: true });
  void g1;
  const lib = s.profile.library;
  lib.addBookmark({ url: `${SITE}/Jupiter`, title: "Jupiter", favorite: true });
  lib.addBookmark({ url: `${process.env.SOLANA_OS_URL}/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCaJ3NQHTg5WqbHmcKn`, title: "BONK", favorite: true });
  lib.addBookmark({ url: `${SITE}/Kamino`, title: "Kamino", folderId: "f-defi" });
  s.toggleSavedGroup(g1);
  s.selectTab(tok);
  await wait(1500);
  shot("1-tabs-groups");

  s.splitTabs(tok, wal);
  await wait(800);
  shot("2-split");

  s.openPanel();
  await wait(1500);
  shot("3-split-and-ai-panel");
  s.closePanel();
  s.closeSplit();
  await wait(400);

  require("../src/menus").setVertical(s.profile, true);
  await wait(800);
  shot("4-vertical");
  require("../src/menus").setVertical(s.profile, false);
  await wait(500);

  // Group editor bubble and profile switcher.
  ipc.openGroupEditor(s, g1, null);
  await wait(900);
  shot("5-group-editor");
  require("../src/bubbles").close();
  ipc.openProfileBubble(s, null);
  await wait(900);
  shot("6-profiles");
  require("../src/bubbles").close();
  await wait(300);

  // Tab context menu (native).
  require("../src/menus").tabMenu(s, tok).popup({ window: s.win, x: 380, y: 30 });
  await wait(900);
  shot("7-tab-menu");
  app.exit(0);
});
