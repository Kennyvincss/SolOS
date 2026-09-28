// End-to-end check of the browser features: tabs (pin, duplicate, mute,
// groups, move to new window, close others/right, reopen closed), the tab
// context menu, split view, vertical tabs, the AI side panel, bookmarks,
// reading list, profiles and session restore.
// Run: xvfb-run -a npx electron test/smoke-browser.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const page = (title) => `<!doctype html><title>${title}</title><body style="background:#111;color:#eee"><main><h1>${title}</h1><p>Some page text about ${title}.</p></main></body>`;
const home = http.createServer((q, r) => r.end(page(`Home ${q.url}`))).listen(0);
const other = http.createServer((q, r) => r.end(page(`Site ${q.url}`))).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${home.address().port}`;
const SITE = `http://127.0.0.1:${other.address().port}`;

const { app, BrowserWindow, Menu, dialog } = require("electron");
require("../src/main.js");
const W = require("../src/window");
const profiles = require("../src/profiles");
const { getRuntime } = require("../src/runtime");
const ipc = require("../src/ipc");

dialog.showMessageBox = async () => ({ response: 1 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
};
const loaded = (wc) => new Promise((r) => (wc.isLoading() ? wc.once("did-stop-loading", r) : r()));
const urlOf = (s, id) => s.tabs.get(id).view.webContents.getURL();

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const s = [...W.shells][0];
    if (!s) throw new Error("no window");

    /* tabs */
    const a = s.newTab(`${SITE}/a`).id;
    const b = s.newTab(`${SITE}/b`).id;
    const c = s.newTab(`${SITE}/c`).id;
    await Promise.all([a, b, c].map((id) => loaded(s.tabs.get(id).view.webContents)));
    s.setPinned(c, true);
    check("pinned tab moves to the start", s.order[0] === c, s.order);
    s.duplicateTab(a);
    await wait(800);
    const dup = s.order[s.order.indexOf(a) + 1];
    check("duplicate keeps the URL", dup && urlOf(s, dup) === `${SITE}/a`, dup && urlOf(s, dup));
    s.toggleMuteSite(a);
    check("mute site mutes every tab of that site", [a, b].every((id) => s.tabs.get(id).view.webContents.isAudioMuted()));
    s.toggleMuteSite(a);

    /* groups */
    const gid = s.addToNewGroup([a, b]);
    s.updateGroup(gid, { title: "TRADING", color: "blue" });
    check("group created with name and color", s.groups.get(gid)?.title === "TRADING" && s.groups.get(gid)?.color === "blue");
    check("grouped tabs are adjacent", Math.abs(s.order.indexOf(a) - s.order.indexOf(b)) === 1, s.order);
    s.updateGroup(gid, { collapsed: true });
    check("collapsing a group moves focus out of it", s.activeTab?.groupId !== gid);
    s.updateGroup(gid, { collapsed: false });
    s.toggleSavedGroup(gid);
    check("group can be saved", s.profile.library.isGroupSaved(gid));

    /* tab context menu matches the reference */
    const labels = ipcMenuLabels(s, a);
    results.tabMenu = labels;
    for (const l of ["New tab to the right", "Add tab to new split view", "Reload", "Duplicate", "Pin", "Mute site", "Add tab to reading list", "Share tab", "Send to your devices", "Show tabs vertically", "Close", "Close other tabs", "Close tabs to the right"]) check(`tab menu has “${l}”`, labels.includes(l), labels);
    check("tab menu has group and window items", labels.some((l) => /group/i.test(l)) && labels.some((l) => /window/i.test(l)), labels);

    /* close others / right, reopen */
    const extra1 = s.newTab(`${SITE}/x1`, { background: true }).id;
    const extra2 = s.newTab(`${SITE}/x2`, { background: true }).id;
    s.closeTabsToRight(extra1);
    check("close tabs to the right", !s.tabs.has(extra2) && s.tabs.has(extra1));
    s.closeTab(extra1);
    const before = s.tabs.size;
    s.reopenClosedTab();
    await wait(500);
    check("reopen closed tab", s.tabs.size === before + 1 && urlOf(s, s.activeId).endsWith("/x1"), urlOf(s, s.activeId));

    /* move tab to new window (the page keeps running) */
    const moving = s.activeId;
    const movingWc = s.tabs.get(moving).view.webContents;
    const w2 = s.moveTabToNewWindow(moving);
    await wait(1500);
    check("move tab to new window", w2 && w2.tabs.has(moving) && !s.tabs.has(moving) && !movingWc.isDestroyed(), { inNew: w2?.tabs.has(moving) });
    w2?.win.close();
    await wait(300);

    /* split view */
    s.selectTab(a);
    s.splitTabs(a, b);
    await wait(300);
    const L = s.computeLayout();
    const [left, right] = L.panes;
    check("split view shows two pages side by side", L.panes.length === 2 && left.x + left.width < right.x && s.attached.has(a) && s.attached.has(b), L);
    s.swapSplit();
    check("swap sides", s.activeSplit.left === b && s.activeSplit.right === a);
    s.dragKind = "split";
    s.lastLayout = s.computeLayout();
    s.dragMove(s.lastLayout.content.x + s.lastLayout.content.width * 0.3);
    check("adjustable divider", Math.abs(s.activeSplit.ratio - 0.3) < 0.02, s.activeSplit.ratio);
    s.dragKind = null;
    s.closeSplit();
    check("close split keeps both tabs", !s.activeSplit && s.tabs.has(a) && s.tabs.has(b));

    /* vertical tabs */
    require("../src/menus").setVertical(s.profile, true);
    await wait(300);
    check("vertical tabs move pages right of the sidebar", s.computeLayout().content.x > 0 && (await s.win.webContents.executeJavaScript("!document.getElementById('sidebar').hidden")));
    require("../src/menus").setVertical(s.profile, false);

    /* AI side panel */
    s.openPanel();
    await wait(600);
    const withPanel = s.computeLayout();
    check("AI side panel slides in on the right", withPanel.panel && withPanel.panel.width >= 300 && withPanel.content.width + withPanel.panel.width < s.win.getContentSize()[0] + 2, withPanel);
    s.closePanel();
    await wait(400);

    /* bookmarks, folders, reading list */
    const lib = s.profile.library;
    s.selectTab(a);
    ipc.openBookmarkEditor(s, null, null);
    await wait(300);
    const bm = lib.getBookmark(`${SITE}/a`);
    check("star bookmarks the tab", Boolean(bm));
    const folder = lib.createFolder("Research");
    lib.moveBookmark(`${SITE}/a`, folder.id);
    check("bookmark moves to a folder", lib.getBookmark(`${SITE}/a`)?.folderId === folder.id);
    check("default folders exist", ["Trading", "DeFi", "Research", "Wallets", "Markets", "Apps"].every((n) => lib.folders().some((f) => f.name === n)), lib.folders());
    lib.addToReadingList(`${SITE}/b`, "B");
    lib.setRead(`${SITE}/b`, true);
    check("reading list add + mark read", lib.readingList().find((r) => r.url === `${SITE}/b`)?.read === true);
    check("history is typed and searchable", lib.historyList({ query: "/b" }).length > 0);

    /* page context for the AI panel */
    const ctxAi = await s.win.webContents.executeJavaScript("1").then(() => null);
    void ctxAi;

    /* profiles */
    const p = profiles.create({ name: "Trading" });
    const s2 = ipc.openProfile(p.id);
    await wait(2500);
    const rt2 = getRuntime(p.id);
    check("new profile has its own session", rt2.session !== s.profile.session && rt2.partition !== s.profile.partition);
    check("new profile has its own bookmarks", !rt2.library.isBookmarked(`${SITE}/a`));
    await rt2.session.cookies.set({ url: SITE, name: "who", value: "trading" });
    const mainCookies = await s.profile.session.cookies.get({ url: SITE, name: "who" });
    check("cookies (wallet sessions) don't leak between profiles", mainCookies.length === 0);
    check("profile window shows the profile", s2.profile.id === p.id);

    /* session restore */
    W.saveAllSessions();
    const saved = s.profile.library.getSession();
    check("session saved with tabs and groups", saved?.windows?.[0]?.tabs?.length >= 3 && saved.windows[0].tabs.some((t) => t.pinned), saved?.windows?.[0]?.tabs?.length);

    fs.writeFileSync(process.env.SMOKE_OUT || path.join(__dirname, "..", "smoke-browser.png"), (await s.win.webContents.capturePage()).toPNG());
  } catch (e) {
    checks.push({ name: "no exception", ok: false, detail: String(e?.stack || e) });
  }
  const failed = checks.filter((c) => !c.ok);
  console.log("BROWSER " + JSON.stringify({ ok: !failed.length, passed: checks.length - failed.length, failed, results }, null, 1));
  app.exit(failed.length ? 1 : 0);
});

function ipcMenuLabels(s, id) {
  const menu = require("../src/menus").tabMenu(s, id);
  return menu.items.map((i) => i.label).filter(Boolean);
}
