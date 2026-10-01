// IPC: toolbar -> browser, bubbles, the extensions panel, passwords, and the
// bridge the STRATA site uses (bookmarks, history, reading list, AI page context).
// SPDX-License-Identifier: GPL-3.0-only

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage } = require("electron");
const { installExtension, uninstallExtension } = require("electron-chrome-web-store");
const { SOLANA_OS_URL, WALLETS, routeInput, classifyUrl } = require("./lib");
const { BrowserShell, shellFor, shellsOf, focusedShell, GROUP_COLORS } = require("./window");
const { getRuntime, dropRuntime, runtimes } = require("./runtime");
const profiles = require("./profiles");
const bubbles = require("./bubbles");
const menus = require("./menus");
const popmenu = require("./popmenu");

/** Show a menu (Chrome-style) at x, y in the window. alignRight: the menu's right edge sits at x (the ⋮ button). */
function pop(menu, s, x, y, name, alignRight = false) {
  if (!menu) return;
  const ctx = { window: s.win, webContents: s.activeTab?.view.webContents };
  if (!alignRight) return popmenu.show(menu, { window: s.win, x: Math.round(x), y: Math.round(y), name, context: ctx });
  const cb = s.win.getContentBounds();
  popmenu.show(menu, { window: s.win, screen: { x: cb.x + x, y: cb.y + y }, alignRight: true, name, context: ctx });
}
const devices = require("./devices");
const { eligibleOrigin } = require("./passwords");
const { checkForUpdatesInteractive } = require("./updater");
const { searchWebStore } = require("./webstore-search");
const omnibox = require("./omnibox");

const HOME_ORIGIN = new URL(SOLANA_OS_URL).origin;

/* ------------------------------------------------------------ profiles */

/** Open (or focus) a profile's window, restoring its last session the first time. */
function openProfile(profileId, { restore = true } = {}) {
  if (!profiles.get(profileId)) return null;
  const existing = shellsOf(profileId);
  if (existing.length) {
    const s = existing.sort((a, b) => b.lastFocus - a.lastFocus)[0];
    if (s.win.isMinimized()) s.win.restore();
    s.win.focus();
    return s;
  }
  profiles.setLastUsed(profileId);
  const rt = getRuntime(profileId);
  const session = restore && rt.library.getSetting("restoreSession", true) ? rt.library.getSession() : null;
  const wins = session?.windows?.filter((w) => w.tabs?.length) ?? [];
  if (wins.length) return wins.map((w) => new BrowserShell(profileId, { restore: w }))[0];
  return new BrowserShell(profileId);
}

function openInProfile(profileId, url) {
  const s = openProfile(profileId, { restore: false });
  if (s?.ready) s.newTab(url);
  else s?.win.webContents.once("did-finish-load", () => setTimeout(() => s.newTab(url), 50));
}

async function deleteProfile(requester, profileId) {
  const meta = profiles.get(profileId);
  if (!meta || profileId === "default") return false;
  const { response } = await dialog.showMessageBox(requester?.win, {
    type: "warning",
    buttons: ["Cancel", "Delete profile"],
    defaultId: 0,
    cancelId: 0,
    message: `Delete the “${meta.name}” profile?`,
    detail: "This removes its wallets and extensions, bookmarks, history, passwords and open tabs from this computer. Make sure any wallet in it has its recovery phrase saved.",
  });
  if (response !== 1) return false;
  for (const s of shellsOf(profileId)) s.win.destroy();
  const rt = dropRuntime(profileId);
  if (rt) {
    devices.stop(rt);
    await rt.session.clearStorageData().catch(() => {});
    await rt.session.clearCache().catch(() => {});
  }
  profiles.remove(profileId);
  fs.rm(profiles.dataDir(profileId), { recursive: true, force: true }, () => {});
  if (!BrowserWindow.getAllWindows().length) openProfile(profiles.lastUsed());
  return true;
}

/* ------------------------------------------------------------ bubbles */

function anchorFor(s, rect) {
  if (rect) return rect;
  const [W] = s.win.getContentSize();
  return { left: W - 360, top: 0, right: W - 40, bottom: 40 };
}

function openGroupEditor(s, groupId, rect) {
  const g = s.groups.get(groupId);
  if (!g) return;
  bubbles.open(s, {
    name: "group",
    anchor: rect ?? anchorFor(s, null),
    align: rect ? "left" : "right",
    width: 320,
    data: { groupId, title: g.title, color: g.color, colors: GROUP_COLORS, saved: s.profile.library.isGroupSaved(groupId) },
    handler: (action, payload, b) => {
      if (action === "title") s.updateGroup(groupId, { title: String(payload ?? "") });
      else if (action === "color") s.updateGroup(groupId, { color: String(payload) });
      else if (action === "newTab") s.newTabInGroup(groupId);
      else if (action === "ungroup") s.ungroup(groupId);
      else if (action === "close") s.closeGroup(groupId);
      else if (action === "moveToNewWindow") s.moveGroupToNewWindow(groupId);
      else if (action === "toggleSaved") s.toggleSavedGroup(groupId);
      const cur = s.groups.get(groupId);
      if (cur) b.data = { ...b.data, title: cur.title, color: cur.color, saved: s.profile.library.isGroupSaved(groupId) };
      return true;
    },
  });
}

const TYPE_LABELS = { token: "Token", wallet: "Wallet", transaction: "Transaction", app: "App", market: "Market", nft: "NFT collection", research: "Research", search: "Search", ai: "AI", strata: "STRATA page", website: "Website" };

function openBookmarkEditor(s, url, rect) {
  const lib = s.profile.library;
  const wc = s.activeTab?.view.webContents;
  const target = url ?? wc?.getURL();
  if (!target || !/^https?:/.test(target)) return;
  const existing = lib.getBookmark(target);
  const b = existing ?? lib.addBookmark({ url: target, title: url ? target : wc.getTitle() });
  if (!b) return;
  s.sendState();
  bubbles.open(s, {
    name: "bookmark",
    anchor: rect ?? anchorFor(s, null),
    width: 340,
    data: { url: target, title: b.title, folderId: b.folderId, favorite: Boolean(b.favorite), folders: lib.folders(), existing: Boolean(existing), typeLabel: TYPE_LABELS[b.type] ?? "Website" },
    handler: (action, payload) => {
      if (action === "update") lib.updateBookmark(target, { title: String(payload?.title ?? b.title), folderId: payload?.folderId ?? null, favorite: Boolean(payload?.favorite) });
      else if (action === "remove") lib.removeBookmark(target);
      else if (action === "newFolder") return lib.createFolder(String(payload || "New folder"));
      else if (action === "manager") s.newTab(`${SOLANA_OS_URL}/bookmarks`);
      s.sendState();
      return true;
    },
  });
}

const profileRows = () => profiles.list().map((p) => ({ ...p, open: shellsOf(p.id).length > 0, picture: profiles.pictureUrl(p.id) }));

/** Taskbar icons follow profile changes (name, colour, picture, how many profiles there are). */
function refreshTaskbarIcons() {
  for (const w of require("./window").shells) if (w.ready) require("./profile-icon").apply(w.win, w.profile.id);
}

function openProfileBubble(s, rect) {
  const exts = s.profile.session.extensions.getAllExtensions();
  const wallet = WALLETS.find((w) => exts.some((x) => x.id === w.id));
  bubbles.open(s, {
    name: "profiles",
    anchor: rect ?? anchorFor(s, null),
    width: 320,
    data: {
      current: s.profile.id,
      profiles: profileRows(),
      presets: profiles.PRESETS,
      colors: profiles.COLORS,
      walletLabel: wallet ? `${wallet.name} installed` : "No wallet installed yet",
    },
    handler: async (action, payload, b) => {
      if (action === "switch") openProfile(String(payload));
      else if (action === "create") {
        const p = profiles.create({ name: payload?.name, color: payload?.color });
        bubbles.close();
        openProfile(p.id);
        refreshTaskbarIcons();
        return p;
      } else if (action === "update") {
        profiles.update(String(payload?.id), { name: payload?.name, color: payload?.color });
        for (const w of shellsOf(String(payload?.id))) w.sendState();
        menus.buildMenuBar(actionsFor);
        refreshTaskbarIcons();
      } else if (action === "remove") {
        const ok = await deleteProfile(s, String(payload));
        if (ok) menus.buildMenuBar(actionsFor);
        if (ok) refreshTaskbarIcons();
        b.data = { ...b.data, profiles: profileRows() };
        return ok;
      } else if (action === "choosePicture") {
        const id = String(payload);
        if (!profiles.get(id)) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(s.win, {
          title: "Choose a profile picture",
          properties: ["openFile"],
          filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
        });
        if (canceled || !filePaths?.[0]) return null;
        const img = nativeImage.createFromPath(filePaths[0]);
        if (img.isEmpty()) return { error: "That file isn't a picture STRATA can read. Try a PNG or JPG." };
        // Center square, 128×128.
        const { width, height } = img.getSize();
        const side = Math.min(width, height);
        const square = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side }).resize({ width: 128, height: 128, quality: "best" });
        profiles.setPicture(id, square.toPNG());
        for (const w of shellsOf(id)) w.sendState();
        refreshTaskbarIcons();
      } else if (action === "removePicture") {
        profiles.clearPicture(String(payload));
        for (const w of shellsOf(String(payload))) w.sendState();
        refreshTaskbarIcons();
      }
      b.data = { ...b.data, profiles: profileRows() };
      return true;
    },
  });
}

/** Open a saved tab group: focus it if it's open, otherwise open its tabs as a group. */
function openSavedGroup(s, groupId) {
  for (const w of shellsOf(s.profile.id)) {
    if (w.groups.has(groupId)) {
      const first = w.groupTabs(groupId)[0];
      w.updateGroup(groupId, { collapsed: false });
      if (first) w.selectTab(first);
      return w.win.focus();
    }
  }
  const g = s.profile.library.savedGroups().find((x) => x.id === groupId);
  if (!g || !g.tabs.length) return;
  s.groups.set(groupId, { id: groupId, title: g.title, color: GROUP_COLORS[g.color] ? g.color : "grey", collapsed: false });
  let firstId = null;
  for (const t of g.tabs) {
    const wc = s.newTab(t.url, { background: true, groupId, title: t.title, lazy: Boolean(firstId) });
    firstId = firstId ?? wc.id;
  }
  s.selectTab(firstId);
}

/* ------------------------------------------------------------ actions shared by menus and shortcuts */

function openExtensionPopup(s, id, anchorRect) {
  const ext = s.profile.session.extensions.getExtension(id);
  if (!ext) return;
  const [W] = s.win.getContentSize();
  const a = anchorRect ?? { x: W - 200, y: 48, width: 32, height: 32 };
  try {
    s.profile.extensions.api.browserAction.activateClick({ extensionId: id, tabId: s.activeId ?? -1, anchorRect: a, alignment: "bottom left" });
  } catch (err) {
    console.error("[extensions] open failed:", err);
  }
}

async function confirmClearHistory(s) {
  const { response } = await dialog.showMessageBox(s?.win, {
    type: "warning",
    buttons: ["Last hour", "Last 24 hours", "All time", "Cancel"],
    defaultId: 3,
    cancelId: 3,
    message: "Clear browsing history?",
    detail: "Removes the pages, searches and AI questions in this profile's history. Bookmarks, passwords and site logins are kept.",
  });
  const lib = (s ?? focusedShell())?.profile.library;
  if (!lib || response === 3) return;
  const since = [Date.now() - 3600e3, Date.now() - 86400e3, 0][response];
  if (since) lib.clearHistory(since);
  else lib.clearHistory();
}

function setDeveloperMode(s, on) {
  s.profile.library.setSetting("developerMode", Boolean(on));
}

async function loadUnpacked(s) {
  const { canceled, filePaths } = await dialog.showOpenDialog(s.win, { title: "Load unpacked extension", properties: ["openDirectory"], buttonLabel: "Load extension" });
  if (canceled || !filePaths[0]) return null;
  try {
    const ext = await s.profile.session.extensions.loadExtension(filePaths[0], { allowFileAccess: true });
    const lib = s.profile.library;
    const list = new Set(lib.getSetting("unpackedExtensions", []));
    list.add(filePaths[0]);
    lib.setSetting("unpackedExtensions", [...list]);
    if (!lib.getSetting("developerMode", false)) lib.setSetting("developerMode", true);
    for (const w of shellsOf(s.profile.id)) w.sendState();
    return { id: ext.id, name: ext.name, version: ext.version, path: filePaths[0] };
  } catch (err) {
    dialog.showErrorBox("Couldn't load the extension", String(err?.message ?? err));
    return null;
  }
}

/** Reload the developer's unpacked extensions when a profile starts. */
async function loadUnpackedAtStart(rt) {
  const list = rt.library.getSetting("unpackedExtensions", []);
  for (const p of Array.isArray(list) ? list : []) {
    if (!fs.existsSync(path.join(p, "manifest.json"))) continue;
    await rt.session.extensions.loadExtension(p, { allowFileAccess: true }).catch((err) => console.warn("[dev] unpacked extension failed:", p, err?.message));
  }
}

let passwordsWindow = null;
let passwordsProfile = null;
function openPasswords(s) {
  const rt = (s ?? focusedShell())?.profile ?? getRuntime(profiles.lastUsed());
  if (passwordsWindow && !passwordsWindow.isDestroyed()) {
    passwordsProfile = rt;
    passwordsWindow.webContents.reload();
    return passwordsWindow.focus();
  }
  passwordsProfile = rt;
  passwordsWindow = new BrowserWindow({
    width: 720,
    height: 640,
    title: `Passwords — ${rt.meta.name} — STRATA`,
    backgroundColor: require("./appearance").colors().page,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload-passwords.js"), contextIsolation: true, sandbox: true },
  });
  passwordsWindow.loadFile(path.join(__dirname, "ui", "passwords.html"));
  passwordsWindow.on("closed", () => (passwordsWindow = null));
}

/** Actions the menus call. Built per window (s) so they act on the right profile. */
function actionsFor(sArg) {
  const cur = () => sArg ?? focusedShell();
  return {
    profileBubble: () => cur() && openProfileBubble(cur(), null),
    clearHistory: () => confirmClearHistory(cur()),
    bookmarkEditor: () => cur() && openBookmarkEditor(cur(), null, null),
    bookmarkAll: () => {
      const s = cur();
      if (!s) return;
      const lib = s.profile.library;
      const folder = lib.createFolder(`Tabs ${new Date().toLocaleDateString()}`);
      for (const id of s.order) {
        const wc = s.tabs.get(id).view.webContents;
        if (/^https?:/.test(wc.getURL())) lib.addBookmark({ url: wc.getURL(), title: wc.getTitle(), folderId: folder.id });
      }
      s.sendState();
    },
    toggleBookmarksBar: () => {
      const s = cur();
      if (!s) return;
      s.profile.library.setSetting("bookmarksBar", !s.bookmarksBarVisible);
      for (const w of shellsOf(s.profile.id)) w.applyChrome();
    },
    openPasswords: () => openPasswords(cur()),
    openExtension: (id) => cur() && openExtensionPopup(cur(), id),
    setDeveloperMode: (on) => cur() && setDeveloperMode(cur(), on),
    loadUnpacked: () => cur() && loadUnpacked(cur()),
    checkForUpdates: () => checkForUpdatesInteractive(),
  };
}

/* ------------------------------------------------------------ keyboard shortcuts */

// Windows/Linux have no menu bar (so no menu accelerators); handle Chrome's
// shortcuts directly. macOS uses the menu bar at the top of the screen.
function handleShortcut(s, event, input) {
  if (input.type !== "keyDown") return;
  const mac = process.platform === "darwin";
  const mod = mac ? input.meta : input.control;
  const key = input.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const wc = s.activeTab?.view.webContents;
  const ids = s.order;
  const idx = ids.indexOf(s.activeId);
  const zoom = (d) => wc && wc.setZoomLevel(d === 0 ? 0 : wc.getZoomLevel() + d);
  const a = actionsFor(s);
  let act = null;
  // A few shortcuts work on every platform (the menu bar doesn't cover them).
  if (mod && input.shift && !input.alt) {
    act = { a: () => s.togglePanel(), t: () => s.reopenClosedTab(), b: () => a.toggleBookmarksBar(), o: () => s.newTab(`${SOLANA_OS_URL}/bookmarks`), Delete: () => a.clearHistory() }[lower];
    if (!act && !mac) act = { Tab: () => ids.length && s.selectTab(ids[(idx - 1 + ids.length) % ids.length]), r: () => wc?.reloadIgnoringCache(), i: () => wc?.toggleDevTools(), w: () => s.win.close(), "+": () => zoom(0.5), n: () => openProfileBubble(s, null) }[lower];
  } else if (mod && !input.shift && !input.alt && !mac) {
    act = {
      t: () => s.newTab(SOLANA_OS_URL),
      n: () => new BrowserShell(s.profile.id),
      w: () => s.closeTab(s.activeId),
      F4: () => s.closeTab(s.activeId),
      l: () => s.focusAddress(),
      e: () => s.focusAddress(),
      k: () => s.focusAddress(),
      r: () => s.reload(),
      d: () => a.bookmarkEditor(),
      h: () => s.newTab(`${SOLANA_OS_URL}/history`),
      j: () => s.newTab(`${SOLANA_OS_URL}/history`),
      Tab: () => ids.length && s.selectTab(ids[(idx + 1) % ids.length]),
      PageDown: () => ids.length && s.selectTab(ids[(idx + 1) % ids.length]),
      PageUp: () => ids.length && s.selectTab(ids[(idx - 1 + ids.length) % ids.length]),
      "=": () => zoom(0.5),
      "+": () => zoom(0.5),
      "-": () => zoom(-0.5),
      0: () => zoom(0),
      F5: () => wc?.reloadIgnoringCache(),
    }[lower];
    if (!act && /^[1-9]$/.test(key)) act = () => s.selectTab(key === "9" ? ids[ids.length - 1] : ids[Number(key) - 1]);
  } else if (!mac && input.alt && !input.control && !input.shift) {
    act = { ArrowLeft: () => wc?.navigationHistory.goBack(), ArrowRight: () => wc?.navigationHistory.goForward(), d: () => s.focusAddress(), Home: () => s.navigate(SOLANA_OS_URL) }[lower];
  } else if (!mac && !input.control && !input.alt && !input.meta && !input.shift) {
    act = { F5: () => s.reload(), F6: () => s.focusAddress(), F11: () => s.win.setFullScreen(!s.win.isFullScreen()), F12: () => wc?.toggleDevTools() }[key];
  }
  if (act) {
    event.preventDefault();
    act();
  }
}

/* ------------------------------------------------------------ address bar */

/** Go where the address bar says: a page, or STRATA AI with this page as context. */
function go(s, input, where = "current") {
  const text = String(input ?? "").trim();
  const r = routeInput(text);
  const lib = s.profile.library;
  if (r.kind === "ai") {
    lib.addActivity("ai", r.prompt, `${SOLANA_OS_URL}/ai?q=${encodeURIComponent(r.prompt)}`);
    return s.openPanel(r.prompt);
  }
  if (text && !/^https?:\/\//i.test(text) && r.url.startsWith(`${SOLANA_OS_URL}/search?q=`)) lib.addActivity("search", text, r.url);
  if (where === "tab") s.newTab(r.url, { openerId: s.activeId });
  else s.navigate(r.url);
}

/* ------------------------------------------------------------ register */

function register() {
  const on = (ch, fn) =>
    ipcMain.on(ch, (e, ...args) => {
      const s = shellFor(e.sender);
      if (s && e.sender === s.win.webContents) fn(s, ...args);
    });
  const num = (v) => Number(v);

  /* tabs */
  on("shell:newTab", (s, url) => s.newTab(typeof url === "string" && url ? url : SOLANA_OS_URL));
  on("shell:closeTab", (s, id) => s.closeTab(num(id)));
  on("shell:selectTab", (s, id) => s.selectTab(num(id)));
  on("shell:moveTab", (s, id, index, groupId, pinned) => {
    const t = s.tabs.get(num(id));
    if (!t) return;
    if (typeof pinned === "boolean" && pinned !== t.pinned) s.setPinned(t.id, pinned);
    s.moveTab(t.id, num(index), pinned ? null : groupId === undefined ? undefined : groupId || null);
  });
  on("shell:moveGroup", (s, groupId, index) => {
    const ids = s.groupTabs(String(groupId));
    let order = s.order.filter((x) => !ids.includes(x));
    const i = Math.max(0, Math.min(order.length, num(index)));
    order = [...order.slice(0, i), ...ids, ...order.slice(i)];
    s.order = order;
    s.changed();
  });
  on("shell:toggleCollapse", (s, groupId) => {
    const g = s.groups.get(String(groupId));
    if (g) s.updateGroup(g.id, { collapsed: !g.collapsed });
  });
  on("shell:toggleMute", (s, id) => s.toggleMuteSite(num(id)));
  on("shell:detachTab", (s, id) => s.moveTabToNewWindow(num(id)));
  on("shell:tabMenu", (s, id, x, y) => pop(menus.tabMenu(s, num(id)), s, x, y, "tab"));
  on("shell:stripMenu", (s, x, y) => pop(menus.stripMenu(s), s, x, y, "strip"));
  on("shell:groupEditor", (s, groupId, rect) => openGroupEditor(s, String(groupId), rect));

  /* navigation */
  on("shell:navigate", (s, input) => go(s, input));
  on("shell:back", (s) => s.activeTab?.view.webContents.navigationHistory.goBack());
  on("shell:forward", (s) => s.activeTab?.view.webContents.navigationHistory.goForward());
  on("shell:reload", (s) => s.reload());
  on("shell:stop", (s) => s.activeTab?.view.webContents.stop());
  on("shell:home", (s) => s.navigate(SOLANA_OS_URL));
  on("shell:openHome", (s, p) => typeof p === "string" && p.startsWith("/") && s.newTab(`${SOLANA_OS_URL}${p}`, { openerId: s.activeId }));
  on("shell:openUrl", (s, url, where) => {
    if (typeof url !== "string" || !/^https?:/.test(url)) return;
    if (where === "tab") s.newTab(url, { background: true, openerId: s.activeId });
    else if (where === "window") new BrowserShell(s.profile.id, { url });
    else s.navigate(url);
  });
  on("shell:suggest", (s, text, rect) => omnibox.suggest(s, String(text ?? ""), rect, go));
  on("shell:suggestMove", (s, d) => omnibox.move(s, num(d)));
  on("shell:suggestClose", () => omnibox.close());
  ipcMain.handle("shell:suggestAccept", (e) => {
    const s = shellFor(e.sender);
    return s ? omnibox.accept(s, go) : false;
  });

  /* toolbar */
  on("shell:star", (s, rect) => openBookmarkEditor(s, null, rect));
  on("shell:toggleBookmark", (s) => {
    const wc = s.activeTab?.view.webContents;
    if (wc && /^https?:/.test(wc.getURL())) s.profile.library.toggleBookmark(wc.getURL(), wc.getTitle());
    s.sendState();
  });
  on("shell:toggleReading", (s) => {
    const wc = s.activeTab?.view.webContents;
    const lib = s.profile.library;
    const url = wc?.getURL() ?? "";
    if (!/^https?:/.test(url)) return;
    if (lib.inReadingList(url)) lib.removeFromReadingList(url);
    else lib.addToReadingList(url, wc.getTitle());
    s.sendState();
  });
  on("shell:splitMenu", (s, rect) => pop(menus.splitMenu(s), s, rect?.left ?? 0, (rect?.bottom ?? 0) + 4, "split"));
  on("shell:walletMenu", (s, rect) => pop(menus.walletMenu(s, (id) => openExtensionPopup(s, id, rect ? { x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top } : null)), s, rect?.left ?? 0, (rect?.bottom ?? 0) + 4, "wallet"));
  on("shell:profileMenu", (s, rect) => openProfileBubble(s, rect));
  on("shell:togglePanel", (s) => s.togglePanel());
  on("shell:appMenu", (s, pos) => pop(menus.appMenu(s, actionsFor(s)), s, pos?.x ?? 0, pos?.y ?? 0, "app", true));
  on("shell:bookmarkFolderMenu", (s, folderId, rect) => pop(menus.bookmarkFolderMenu(s, String(folderId)), s, rect?.left ?? 0, (rect?.bottom ?? 0) + 2, "bmfolder"));
  on("shell:bookmarkItemMenu", (s, url, x, y) => pop(menus.bookmarkItemMenu(s, String(url)), s, x, y, "bmitem"));
  on("shell:savedGroup", (s, groupId) => openSavedGroup(s, String(groupId)));
  on("shell:savedGroupMenu", (s, groupId, x, y) => pop(menus.savedGroupMenu(s, String(groupId)), s, x, y, "savedgroup"));
  on("shell:extensionsPanel", (s, rect) => rect && openExtensionsPanel(s, { left: num(rect.left) || 0, top: num(rect.top) || 0, right: num(rect.right) || 0, bottom: num(rect.bottom) || 0 }));

  /* layout */
  on("shell:dragStart", (s, kind) => (kind === "split" || kind === "panel") && s.startDrag(kind));
  ipcMain.on("shell:dragMove", (e, x) => {
    const s = shellFor(e.sender);
    if (s && s.overlay?.webContents === e.sender) s.dragMove(num(x));
  });
  ipcMain.on("shell:dragEnd", (e) => {
    const s = shellFor(e.sender);
    if (s && s.overlay?.webContents === e.sender) s.endDrag();
  });
  on("shell:setSidebarCollapsed", (s, v) => {
    for (const w of shellsOf(s.profile.id)) w.setSidebarCollapsed(Boolean(v));
  });
  on("shell:ready", (s) => {
    s.sendState();
    s.layout();
  });

  registerBridge();
  registerPasswords();
  registerExtensionsPanel();
}

/* ------------------------------------------------------------ bridge for the STRATA site */

/* Only the STRATA home site, in a top-level frame of our tabs or the AI side
   panel, may call these. Installs and deletions are confirmed natively. */
function registerBridge() {
  const fromHome = (e) => {
    const f = e.senderFrame;
    if (!f || f.parent !== null || !shellFor(e.sender)) return false;
    try {
      return new URL(f.url).origin === HOME_ORIGIN;
    } catch {
      return false;
    }
  };
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...args) => (fromHome(e) ? fn(shellFor(e.sender), e, ...args) : null));
  ipcMain.on("desktop:homeOrigin", (e) => (e.returnValue = HOME_ORIGIN));

  /* extensions (per profile) */
  handle("desktop:extensions", (s) => {
    const hidden = new Set(s.profile.library.getSetting("hiddenExtensions", []));
    return s.profile.session.extensions.getAllExtensions().map((x) => ({ id: x.id, name: x.name, version: x.version, hidden: hidden.has(x.id), description: String(x.manifest?.description ?? "").slice(0, 200), unpacked: !path.resolve(String(x.path)).startsWith(path.resolve(s.profile.extensionsPath)) }));
  });
  handle("desktop:setExtensionHidden", (s, _e, id, hidden) => {
    if (typeof id !== "string" || !s.profile.session.extensions.getExtension(id)) return false;
    setExtensionHidden(s.profile, id, Boolean(hidden));
    return true;
  });
  handle("desktop:installExtension", async (s, _e, id, claimedName, confirmedInPage) => {
    if (typeof id !== "string" || !/^[a-p]{32}$/.test(id)) return { ok: false, error: "Not allowed" };
    const ses = s.profile.session;
    if (ses.extensions.getExtension(id)) return { ok: true };
    const label = typeof claimedName === "string" && claimedName.trim() ? claimedName.trim().slice(0, 60) : "this extension";
    if (confirmedInPage !== true) {
      const { response } = await dialog.showMessageBox(s.win, {
        type: "question",
        buttons: ["Install", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        message: `Install ${label} in “${s.profile.meta.name}”?`,
        detail: "Extensions can read and change the sites you visit, so only install ones you trust.",
      });
      if (response !== 0) return { ok: false, cancelled: true };
    }
    try {
      const ext = await installExtension(id, { session: ses, extensionsPath: s.profile.extensionsPath });
      // Guard against a wrong ID in the catalog: the store's name must match what the page said.
      const word = label.split(/\s+/)[0].toLowerCase();
      if (label !== "this extension" && !ext.name.toLowerCase().includes(word)) {
        await uninstallExtension(id, { session: ses, extensionsPath: s.profile.extensionsPath }).catch(() => {});
        return { ok: false, error: `The store returned "${ext.name}" instead of ${label}, so it was not kept.` };
      }
      return { ok: true, name: ext.name };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  });
  handle("desktop:searchExtensions", async (s, _e, query) => {
    try {
      return { ok: true, results: await searchWebStore(s.profile.session, typeof query === "string" ? query : "solana") };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err), results: [] };
    }
  });
  handle("desktop:removeExtension", async (s, _e, id, confirmedInPage) => {
    if (typeof id !== "string") return false;
    const x = s.profile.session.extensions.getExtension(id);
    if (!x) return true;
    return removeExtension(s, id, x.name, { confirmed: confirmedInPage === true });
  });

  /* developer mode */
  handle("desktop:dev", async (s, _e, action, arg) => {
    const lib = s.profile.library;
    if (action === "status") return { developerMode: Boolean(lib.getSetting("developerMode", false)), unpacked: lib.getSetting("unpackedExtensions", []) };
    if (action === "setMode") return setDeveloperMode(s, Boolean(arg)), true;
    if (action === "loadUnpacked") return loadUnpacked(s);
    if (action === "reload") {
      const ext = s.profile.session.extensions.getAllExtensions().find((x) => x.id === arg);
      if (!ext) return false;
      s.profile.session.extensions.removeExtension(ext.id);
      await s.profile.session.extensions.loadExtension(ext.path, { allowFileAccess: true });
      return true;
    }
    if (action === "unload") {
      const ext = s.profile.session.extensions.getAllExtensions().find((x) => x.id === arg);
      if (!ext) return false;
      s.profile.session.extensions.removeExtension(ext.id);
      lib.setSetting("unpackedExtensions", lib.getSetting("unpackedExtensions", []).filter((p) => p !== ext.path));
      return true;
    }
    return null;
  });

  /* profile */
  handle("desktop:profile", (s) => ({ id: s.profile.id, name: s.profile.meta.name, color: s.profile.meta.color, count: profiles.list().length }));

  /* library: bookmarks, folders, history, reading list */
  handle("desktop:library", (s, _e, area, action, a = {}) => {
    const lib = s.profile.library;
    const str = (v, n = 2000) => String(v ?? "").slice(0, n);
    const out = (() => {
      if (area === "bookmarks") {
        if (action === "list") return { bookmarks: lib.bookmarks(), folders: lib.folders() };
        if (action === "add") return lib.addBookmark({ url: str(a.url), title: str(a.title, 300), folderId: a.folderId ?? undefined, favorite: a.favorite === undefined ? undefined : Boolean(a.favorite) });
        if (action === "update") return lib.updateBookmark(str(a.url), { title: a.title === undefined ? undefined : str(a.title, 300), folderId: a.folderId === undefined ? undefined : a.folderId, favorite: typeof a.favorite === "boolean" ? a.favorite : undefined, url: a.newUrl === undefined ? undefined : str(a.newUrl) });
        if (action === "remove") return lib.removeBookmark(str(a.url));
        if (action === "move") return lib.moveBookmark(str(a.url), a.folderId ?? null, a.beforeUrl ? str(a.beforeUrl) : undefined);
        if (action === "createFolder") return lib.createFolder(str(a.name, 80));
        if (action === "renameFolder") return lib.renameFolder(str(a.id, 60), str(a.name, 80));
        if (action === "moveFolder") return lib.moveFolder(str(a.id, 60), a.beforeId ? str(a.beforeId, 60) : undefined);
        if (action === "removeFolder") return lib.removeFolder(str(a.id, 60));
        if (action === "isBookmarked") return lib.isBookmarked(str(a.url));
      }
      if (area === "history") {
        if (action === "list") return lib.historyList({ query: str(a.query, 200), type: str(a.type, 40), before: Number(a.before) || Infinity, limit: Math.min(500, Number(a.limit) || 200) });
        if (action === "remove") return lib.removeHistory(str(a.id, 60));
        if (action === "clear") return lib.clearHistory(Number(a.since) || undefined), true;
        if (action === "record" && ["ai", "search"].includes(a.type)) return lib.addActivity(a.type, str(a.text, 300), a.url ? str(a.url) : undefined), true;
      }
      if (area === "reading") {
        if (action === "list") return lib.readingList();
        if (action === "add") return lib.addToReadingList(str(a.url), str(a.title, 300));
        if (action === "setRead") return lib.setRead(str(a.url), Boolean(a.read));
        if (action === "remove") return lib.removeFromReadingList(str(a.url));
      }
      if (area === "open") {
        const url = str(a.url);
        if (!/^https?:/.test(url)) return false;
        if (action === "tab") s.newTab(url, { background: Boolean(a.background), openerId: s.activeId });
        else if (action === "window") new BrowserShell(s.profile.id, { url });
        else if (action === "split") {
          const wc = s.newTab(url, { background: true });
          s.splitTabs(s.activeId, wc.id);
        } else s.navigate(url);
        return true;
      }
      return null;
    })();
    if (["add", "update", "remove", "move", "setRead", "clear"].includes(action)) for (const w of shellsOf(s.profile.id)) w.sendState();
    return out;
  });

  /* AI side panel: page context */
  handle("desktop:pageContext", async (s, e, opts = {}) => {
    const inPanel = s.panel?.view.webContents === e.sender;
    // From the panel: the page the user is looking at. From a tab: that tab.
    const tab = inPanel ? s.activeTab : s.tabs.get(e.sender.id);
    const wc = tab?.view.webContents;
    const url = tab ? tab.pending?.url ?? wc.getURL() : "";
    const ctx = { inPanel, url, title: wc?.getTitle() || tab?.placeholderTitle || "", type: classifyUrl(url), selection: "", text: "", openTabs: [] };
    if (wc && !tab.pending && /^https?:/.test(url) && opts.text !== false) {
      const js = `(() => { const sel = String(window.getSelection() || "").slice(0, 2000); const main = document.querySelector("main, article, [role=main]") || document.body; const text = (main ? main.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 6000); const desc = (document.querySelector('meta[name="description"],meta[property="og:description"]') || {}).content || ""; return { sel, text, desc: String(desc).slice(0, 300) }; })()`;
      const r = await Promise.race([wc.executeJavaScript(js, true).catch(() => null), new Promise((res) => setTimeout(() => res(null), 1500))]);
      if (r) {
        ctx.selection = String(r.sel ?? "");
        ctx.text = String(r.text ?? "");
        ctx.description = String(r.desc ?? "");
      }
    }
    ctx.openTabs = s.order
      .map((id) => s.tabs.get(id))
      .filter(Boolean)
      .map((t) => ({ title: t.view.webContents.getTitle() || t.placeholderTitle || "", url: t.pending?.url ?? t.view.webContents.getURL(), active: t.id === s.activeId }))
      .filter((t) => /^https?:/.test(t.url))
      .slice(0, 20);
    return ctx;
  });
  handle("desktop:panel", (s, _e, action, arg) => {
    if (action === "close") s.closePanel();
    else if (action === "open") s.openPanel(typeof arg === "string" ? arg : undefined);
    else if (action === "openUrl" && typeof arg === "string" && /^https?:/.test(arg)) s.openFromPanel(arg);
    return true;
  });
}

/* ------------------------------------------------------------ passwords (per profile) */

function registerPasswords() {
  const prompting = new Set();
  const mainFrameOrigin = (e) => {
    const frame = e.senderFrame;
    // Only top-level pages in our tabs; the origin comes from the frame, not the page.
    if (!frame || frame.parent !== null || !shellFor(e.sender)) return null;
    return eligibleOrigin(frame.url);
  };
  ipcMain.on("pw:captured", async (e, payload) => {
    const origin = mainFrameOrigin(e);
    const s = shellFor(e.sender);
    const username = typeof payload?.username === "string" ? payload.username.slice(0, 256) : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    const pw = s?.profile.passwords;
    if (!origin || !pw || !password || password.length > 512 || !pw.available() || !s.profile.library.getSetting("savePasswords", true)) return;
    const kind = pw.classify(origin, username, password);
    const key = `${s.profile.id}:${origin}`;
    if (kind === "never" || kind === "same" || prompting.has(key)) return;
    prompting.add(key);
    try {
      const host = new URL(origin).host;
      const update = kind === "update";
      const { response } = await dialog.showMessageBox(s.win, {
        type: "question",
        buttons: update ? ["Update password", "Not now"] : ["Save password", "Never for this site", "Not now"],
        defaultId: 0,
        cancelId: update ? 1 : 2,
        message: update ? `Update your saved password for ${host}?` : `Save password for ${host}?`,
        detail: `${username ? `Username: ${username}\n` : ""}Saved in your “${s.profile.meta.name}” profile, encrypted on this computer with your system keychain. It is never synced or uploaded.`,
      });
      if (response === 0) pw.save(origin, username, password);
      else if (!update && response === 1) pw.neverFor(origin);
    } finally {
      prompting.delete(key);
    }
  });
  ipcMain.handle("pw:get", (e) => {
    const origin = mainFrameOrigin(e);
    const s = shellFor(e.sender);
    if (!origin || !s || !s.profile.library.getSetting("autofillPasswords", true)) return [];
    return s.profile.passwords.forOrigin(origin).map(({ username, password }) => ({ username, password }));
  });

  const fromPasswordsPage = (e) => passwordsWindow && e.sender === passwordsWindow.webContents && passwordsProfile;
  ipcMain.handle("pwm:list", (e) => {
    if (!fromPasswordsPage(e)) return null;
    const rt = passwordsProfile;
    return { profile: rt.meta.name, entries: rt.passwords.list(), never: rt.passwords.neverList(), available: rt.passwords.available(), save: rt.library.getSetting("savePasswords", true), autofill: rt.library.getSetting("autofillPasswords", true) };
  });
  ipcMain.handle("pwm:reveal", async (e, id) => {
    if (!fromPasswordsPage(e)) return null;
    if (!(await confirmIdentity("show a saved password"))) return null;
    return passwordsProfile.passwords.reveal(id);
  });
  ipcMain.handle("pwm:remove", (e, id) => fromPasswordsPage(e) && (passwordsProfile.passwords.remove(id), true));
  ipcMain.handle("pwm:allowAgain", (e, origin) => fromPasswordsPage(e) && (passwordsProfile.passwords.allowAgain(origin), true));
  ipcMain.handle("pwm:setting", (e, key, value) => {
    if (!fromPasswordsPage(e) || !["savePasswords", "autofillPasswords"].includes(key)) return false;
    passwordsProfile.library.setSetting(key, Boolean(value));
    return true;
  });
}

/** Ask for Touch ID on Macs that have it; otherwise a confirmation dialog. */
async function confirmIdentity(reason) {
  const { systemPreferences } = require("electron");
  if (process.platform === "darwin" && systemPreferences.canPromptTouchID?.()) {
    return systemPreferences.promptTouchID(reason).then(() => true, () => false);
  }
  const { response } = await dialog.showMessageBox(passwordsWindow ?? undefined, {
    type: "warning",
    buttons: ["Show password", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    message: "Show this password?",
    detail: "Make sure no one else can see your screen.",
  });
  return response === 0;
}

/* ------------------------------------------------------------ extensions: pin state, remove, panel */

function setExtensionHidden(rt, id, hidden) {
  const set = new Set(rt.library.getSetting("hiddenExtensions", []));
  if (hidden) set.add(id);
  else set.delete(id);
  rt.library.setSetting("hiddenExtensions", [...set]);
  for (const w of shellsOf(rt.id)) w.sendState();
}

async function removeExtension(s, id, name, { confirmed = false } = {}) {
  if (!confirmed) {
    const { response } = await dialog.showMessageBox(s?.win, {
      type: "warning",
      buttons: ["Cancel", "Remove"],
      defaultId: 0,
      cancelId: 0,
      message: `Remove ${name}?`,
      detail: `If this is a wallet, make sure you have its recovery phrase saved. Removing the extension deletes its data from the “${s.profile.meta.name}” profile.`,
    });
    if (response !== 1) return false;
  }
  const ses = s.profile.session;
  const ext = ses.extensions.getExtension(id);
  if (ext && !path.resolve(ext.path).startsWith(path.resolve(s.profile.extensionsPath))) {
    // Unpacked (developer) extension: just unload it.
    ses.extensions.removeExtension(id);
    const lib = s.profile.library;
    lib.setSetting("unpackedExtensions", lib.getSetting("unpackedExtensions", []).filter((p) => p !== ext.path));
  } else await uninstallExtension(id, { session: ses, extensionsPath: s.profile.extensionsPath });
  return true;
}

// Like Chrome's puzzle-piece panel: every installed extension with a pin toggle
// (pinned ones show next to the address bar) and a ⋮ menu; clicking one opens its popup.
const PANEL_WIDTH = 320;
let extPanel = null; // { win, shell, anchor }
let panelClosed = { shell: null, at: 0 };

function extensionIcon(ext) {
  const m = ext.manifest || {};
  const sets = [m.icons, (m.action || m.browser_action || {}).default_icon];
  for (const set of sets) {
    if (!set) continue;
    const rel = typeof set === "string" ? set : set[Object.keys(set).map(Number).filter((n) => n >= 32).sort((a, b) => a - b)[0]] || set[Object.keys(set).sort((a, b) => b - a)[0]];
    if (!rel) continue;
    const file = path.join(ext.path, String(rel).replace(/^\//, ""));
    if (!file.startsWith(ext.path)) continue;
    const img = nativeImage.createFromPath(file);
    if (!img.isEmpty()) return img.resize({ width: 40, height: 40, quality: "best" }).toDataURL();
  }
  return null;
}

function panelItems(rt) {
  const hidden = new Set(rt.library.getSetting("hiddenExtensions", []));
  return rt.session.extensions
    .getAllExtensions()
    .filter((x) => !(x.manifest && x.manifest.theme))
    .map((x) => ({ id: x.id, name: x.name, pinned: !hidden.has(x.id), icon: extensionIcon(x) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function closeExtensionsPanel() {
  const p = extPanel;
  extPanel = null;
  if (p) panelClosed = { shell: p.shell, at: Date.now() };
  if (p && !p.win.isDestroyed()) p.win.destroy();
}

/** anchor: the puzzle button's rect in the browser window's content coordinates. */
function openExtensionsPanel(s, anchor) {
  if (extPanel) {
    const same = extPanel.shell === s;
    closeExtensionsPanel();
    if (same) return; // second click on the button closes it, like Chrome
  }
  if (panelClosed.shell === s && Date.now() - panelClosed.at < 300) return;
  const content = s.win.getContentBounds();
  const x = Math.round(content.x + Math.min(anchor.right, content.width) - PANEL_WIDTH);
  const y = Math.round(content.y + anchor.bottom + 4);
  const win = new BrowserWindow({
    parent: s.win,
    x: Math.max(content.x, x),
    y,
    width: PANEL_WIDTH,
    height: 200,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: require("./appearance").colors().panel,
    webPreferences: { preload: path.join(__dirname, "preload-panel.js"), contextIsolation: true, sandbox: true },
  });
  extPanel = { win, shell: s, anchor, holdOpen: false };
  win.loadFile(path.join(__dirname, "ui", "extensions-panel.html"));
  win.on("blur", () => {
    if (extPanel?.win === win && !extPanel.holdOpen) setTimeout(() => extPanel?.win === win && !extPanel.holdOpen && closeExtensionsPanel(), 0);
  });
  win.on("closed", () => extPanel?.win === win && (extPanel = null));
}

function registerExtensionsPanel() {
  const fromPanel = (e) => extPanel && !extPanel.win.isDestroyed() && e.sender === extPanel.win.webContents;
  ipcMain.handle("panel:list", (e) => (fromPanel(e) ? panelItems(extPanel.shell.profile) : []));
  ipcMain.handle("panel:setPinned", (e, id, pinned) => {
    if (!fromPanel(e) || typeof id !== "string" || !extPanel.shell.profile.session.extensions.getExtension(id)) return false;
    setExtensionHidden(extPanel.shell.profile, id, !pinned);
    return true;
  });
  ipcMain.on("panel:resize", (e, height) => {
    if (!fromPanel(e)) return;
    const h = Math.max(80, Math.min(560, Math.ceil(Number(height) || 0)));
    const b = extPanel.win.getBounds();
    extPanel.win.setBounds({ ...b, height: h });
    if (!extPanel.win.isVisible()) extPanel.win.show();
  });
  ipcMain.on("panel:close", (e) => fromPanel(e) && closeExtensionsPanel());
  ipcMain.on("panel:manage", (e) => {
    if (!fromPanel(e)) return;
    const s = extPanel.shell;
    closeExtensionsPanel();
    s.newTab(`${SOLANA_OS_URL}/extensions#installed`);
  });
  ipcMain.on("panel:findMore", (e) => {
    if (!fromPanel(e)) return;
    const s = extPanel.shell;
    closeExtensionsPanel();
    s.newTab(`${SOLANA_OS_URL}/extensions`);
  });
  // Clicking an extension opens its popup (or runs its click action), anchored to the puzzle button.
  ipcMain.on("panel:open", (e, id) => {
    if (!fromPanel(e) || typeof id !== "string") return;
    const { shell: s, anchor } = extPanel;
    if (!s.profile.session.extensions.getExtension(id)) return;
    closeExtensionsPanel();
    s.win.focus();
    openExtensionPopup(s, id, { x: anchor.left, y: anchor.top, width: anchor.right - anchor.left, height: anchor.bottom - anchor.top });
  });
  ipcMain.on("panel:itemMenu", (e, pos) => {
    if (!fromPanel(e)) return;
    const p = extPanel;
    const s = p.shell;
    const ext = s.profile.session.extensions.getExtension(pos?.id);
    if (!ext) return;
    const manifest = ext.manifest || {};
    const optionsPage = manifest.options_page || manifest.options_ui?.page;
    const pinned = !s.profile.library.getSetting("hiddenExtensions", []).includes(ext.id);
    const refresh = () => extPanel?.win === p.win && p.win.webContents.send("panel:refresh");
    const menu = Menu.buildFromTemplate([
      { label: ext.name, enabled: false },
      { type: "separator" },
      { label: pinned ? "Unpin" : "Pin", click: () => (setExtensionHidden(s.profile, ext.id, pinned), refresh()) },
      { label: "Options", enabled: Boolean(optionsPage), click: () => (closeExtensionsPanel(), s.newTab(`chrome-extension://${ext.id}/${String(optionsPage).replace(/^\//, "")}`)) },
      {
        label: "Remove from STRATA…",
        click: async () => {
          p.holdOpen = true;
          await removeExtension(s, ext.id, ext.name).catch(() => false);
          p.holdOpen = false;
          if (extPanel?.win === p.win) {
            refresh();
            p.win.focus();
          }
        },
      },
      { type: "separator" },
      { label: "Manage extensions", click: () => (closeExtensionsPanel(), s.newTab(`${SOLANA_OS_URL}/extensions#installed`)) },
    ]);
    p.holdOpen = true;
    popmenu.show(menu, { window: p.win, x: Math.round(pos.x ?? 0), y: Math.round(pos.y ?? 0), onClose: () => setTimeout(() => (p.holdOpen = false), 0), context: { window: s.win } });
  });
}

module.exports = {
  register,
  openProfile,
  openInProfile,
  openGroupEditor,
  openBookmarkEditor,
  openProfileBubble,
  openSavedGroup,
  openExtensionPopup,
  handleShortcut,
  actionsFor,
  setExtensionHidden,
  removeExtension,
  loadUnpackedAtStart,
  confirmClearHistory,
  runtimes,
  app,
};
