// Native menus: tab context menu, page context menu, the ⋮ menu, split view,
// wallet, bookmarks bar menus and the macOS menu bar.
// SPDX-License-Identifier: GPL-3.0-only

const { app, BrowserWindow, Menu, clipboard, dialog, shell: electronShell } = require("electron");
const { SOLANA_OS_URL, WALLETS } = require("./lib");
const { BrowserShell, shellsOf, focusedShell, GROUP_COLORS } = require("./window");
const profiles = require("./profiles");
const devices = require("./devices");
const appearance = require("./appearance");

const acc = (a) => ({ accelerator: a, registerAccelerator: false });
const colorName = (c) => c.charAt(0).toUpperCase() + c.slice(1);

function popup(menu, s, x, y) {
  menu.popup({ window: s.win, ...(Number.isFinite(x) ? { x: Math.round(x), y: Math.round(y) } : {}) });
}

function tabUrl(s, id) {
  const t = s.tabs.get(id);
  return t ? t.pending?.url ?? t.view.webContents.getURL() : "";
}

function tabTitle(s, id) {
  const t = s.tabs.get(id);
  return t ? t.view.webContents.getTitle() || t.placeholderTitle || tabUrl(s, id) : "";
}

/* ------------------------------------------------------------ send to devices / share */

function devicesSubmenu(s, url, title) {
  const list = devices.cached(s.profile);
  if (list === null) {
    devices.refresh(s.profile).catch(() => {});
    return [{ label: "Looking for your devices…", enabled: false }];
  }
  if (list.signedOut) return [{ label: "Sign in to STRATA to send tabs to your devices", click: () => s.newTab(`${SOLANA_OS_URL}/login`) }];
  if (list.unavailable) return [{ label: "Sending tabs isn't available right now", enabled: false }];
  const others = list.devices.filter((d) => !d.current);
  if (!others.length) return [{ label: "No other devices yet. Sign in to STRATA on your phone or laptop.", enabled: false }, { type: "separator" }, { label: "Manage devices", click: () => s.newTab(`${SOLANA_OS_URL}/settings#devices`) }];
  return [
    ...others.map((d) => ({
      label: `${d.name}${d.type ? ` · ${d.type.charAt(0).toUpperCase()}${d.type.slice(1)}` : ""}`,
      click: () =>
        devices.send(s.profile, d.id, { url, title }).then(
          (ok) => ok || dialog.showErrorBox("Couldn't send the tab", "Try again in a moment."),
          () => dialog.showErrorBox("Couldn't send the tab", "Try again in a moment."),
        ),
    })),
    { type: "separator" },
    { label: "Manage devices", click: () => s.newTab(`${SOLANA_OS_URL}/settings#devices`) },
  ];
}

function shareSubmenu(url, title) {
  const enc = encodeURIComponent;
  return [
    { label: "Copy link", click: () => clipboard.writeText(url) },
    { label: "Copy link with title", click: () => clipboard.writeText(`${title}\n${url}`) },
    { type: "separator" },
    { label: "Share on X", click: () => electronShell.openExternal(`https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`) },
    { label: "Share on Telegram", click: () => electronShell.openExternal(`https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`) },
    { label: "Email link", click: () => electronShell.openExternal(`mailto:?subject=${enc(title)}&body=${enc(url)}`) },
  ];
}

/* ------------------------------------------------------------ tab context menu */

/** Right-click on a tab (matches Chrome's menu). */
function tabMenu(s, id) {
  const t = s.tabs.get(id);
  if (!t) return null;
  const url = tabUrl(s, id);
  const title = tabTitle(s, id);
  const web = /^https?:/.test(url);
  const lib = s.profile.library;
  const idx = s.order.indexOf(id);
  const unpinnedAfter = s.order.slice(idx + 1).filter((x) => !s.tabs.get(x)?.pinned).length;
  const others = s.order.filter((x) => x !== id && !s.tabs.get(x)?.pinned).length;
  const otherWindows = shellsOf(s.profile.id).filter((w) => w !== s);
  const groupItems = [...s.groups.values()].filter((g) => g.id !== t.groupId);
  const muted = Boolean(s.profile.library.getSetting("mutedSites", []).includes(new URL(url || "about:blank").hostname.replace(/^www\./, ""))) || t.view.webContents.isAudioMuted();
  return Menu.buildFromTemplate([
    { label: "New tab to the right", click: () => s.newTab(SOLANA_OS_URL, { index: idx + 1, groupId: t.groupId }) },
    t.splitId
      ? { label: "Exit split view", click: () => s.closeSplit(t.splitId) }
      : { label: "Add tab to new split view", click: () => (id === s.activeId || s.activeTab?.splitId ? s.splitTabs(id) : s.splitTabs(s.activeId, id)) },
    groupItems.length
      ? {
          label: "Add tab to group",
          submenu: [
            { label: "New group", click: () => openNewGroupEditor(s, id) },
            { type: "separator" },
            ...groupItems.map((g) => ({ label: g.title || `${colorName(g.color)} group`, click: () => s.addToGroup(id, g.id) })),
          ],
        }
      : { label: "Add tab to new group", click: () => openNewGroupEditor(s, id) },
    ...(t.groupId ? [{ label: "Remove from group", click: () => s.removeFromGroup(id) }] : []),
    otherWindows.length
      ? {
          label: "Move tab to another window",
          submenu: [{ label: "New window", click: () => s.moveTabToNewWindow(id) }, { type: "separator" }, ...otherWindows.map((w) => ({ label: `${tabTitle(w, w.activeId).slice(0, 50)} and ${Math.max(0, w.tabs.size - 1)} more`, click: () => s.moveTabToWindow(id, w) }))],
        }
      : { label: "Move tab to new window", enabled: s.tabs.size > 1, click: () => s.moveTabToNewWindow(id) },
    { type: "separator" },
    { label: "Reload", ...acc("CmdOrCtrl+R"), click: () => s.reload(id) },
    { label: "Duplicate", click: () => s.duplicateTab(id) },
    { label: t.pinned ? "Unpin" : "Pin", click: () => s.setPinned(id, !t.pinned) },
    { label: muted ? "Unmute site" : "Mute site", click: () => s.toggleMuteSite(id) },
    { type: "separator" },
    { label: lib.inReadingList(url) ? "Remove from reading list" : "Add tab to reading list", enabled: web, click: () => (lib.inReadingList(url) ? lib.removeFromReadingList(url) : lib.addToReadingList(url, title), s.sendState()) },
    { label: "Share tab", enabled: web, submenu: shareSubmenu(url, title) },
    { label: "Send to your devices", enabled: web, submenu: devicesSubmenu(s, url, title) },
    { type: "separator" },
    { label: s.vertical ? "Show tabs horizontally" : "Show tabs vertically", click: () => setVertical(s.profile, !s.vertical) },
    { type: "separator" },
    { label: "Close", ...acc("CmdOrCtrl+W"), click: () => s.closeTab(id) },
    { label: "Close other tabs", enabled: others > 0, click: () => s.closeOtherTabs(id) },
    { label: s.vertical ? "Close tabs below" : "Close tabs to the right", enabled: unpinnedAfter > 0, click: () => s.closeTabsToRight(id) },
  ]);
}

/** Right-click on empty tab strip space. */
function stripMenu(s) {
  return Menu.buildFromTemplate([
    { label: "New tab", ...acc("CmdOrCtrl+T"), click: () => s.newTab(SOLANA_OS_URL) },
    { label: "Reopen closed tab", ...acc("CmdOrCtrl+Shift+T"), enabled: s.profile.closedTabs.length > 0, click: () => s.reopenClosedTab() },
    { type: "separator" },
    { label: s.vertical ? "Show tabs horizontally" : "Show tabs vertically", click: () => setVertical(s.profile, !s.vertical) },
  ]);
}

function setVertical(rt, on) {
  rt.library.setSetting("verticalTabs", Boolean(on));
  for (const w of shellsOf(rt.id)) w.applyChrome();
}

/** Create a group for a tab and open its editor (like Chrome). */
function openNewGroupEditor(s, id) {
  const gid = s.addToNewGroup(id);
  if (!gid) return;
  // The editor anchors to the new group's chip; the toolbar renders it first.
  setTimeout(() => require("./ipc").openGroupEditor(s, gid, null), 80);
}

/* ------------------------------------------------------------ page context menu */

function pageContextMenu(s, wc, params) {
  const items = [];
  const other = s.otherSide(wc.id);
  const link = params.linkURL;
  if (link) {
    items.push(
      { label: "Open link in new tab", click: () => s.newTab(link, { background: true, openerId: wc.id }) },
      { label: "Open link in new window", click: () => new BrowserShell(s.profile.id, { url: link }) },
      other ? { label: "Open link in other side of split view", click: () => s.tabs.get(other)?.view.webContents.loadURL(link).catch(() => {}) } : { label: "Open link in split view", click: () => openLinkInSplit(s, wc.id, link) },
      {
        label: "Open link in another profile",
        submenu: profiles
          .list()
          .filter((p) => p.id !== s.profile.id)
          .map((p) => ({ label: p.name, click: () => require("./ipc").openInProfile(p.id, link) }))
          .concat(profiles.list().length > 1 ? [] : [{ label: "No other profiles", enabled: false }]),
      },
      { type: "separator" },
      { label: "Bookmark link", click: () => s.profile.library.addBookmark({ url: link, title: params.linkText || link }) },
      { label: "Add link to reading list", click: () => (s.profile.library.addToReadingList(link, params.linkText || link), s.sendState()) },
      { label: "Copy link address", click: () => clipboard.writeText(link) },
      { type: "separator" },
    );
  }
  const sel = (params.selectionText || "").trim();
  if (sel) {
    const short = sel.length > 32 ? `${sel.slice(0, 32)}…` : sel;
    items.push(
      { label: `Ask STRATA AI about “${short}”`, click: () => s.openPanel(`Explain this: "${sel.slice(0, 1500)}"`) },
      { label: `Search STRATA for “${short}”`, click: () => s.newTab(`${SOLANA_OS_URL}/search?q=${encodeURIComponent(sel.slice(0, 200))}`, { openerId: wc.id }) },
      { role: "copy" },
      { type: "separator" },
    );
  }
  if (params.isEditable) items.push({ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }, { type: "separator" });
  if (params.mediaType === "image" && params.srcURL) items.push({ label: "Open image in new tab", click: () => s.newTab(params.srcURL, { background: true }) }, { label: "Copy image address", click: () => clipboard.writeText(params.srcURL) }, { type: "separator" });
  if (!link && !sel && !params.isEditable) {
    const url = wc.getURL();
    const lib = s.profile.library;
    items.push(
      { label: "Back", enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: "Forward", enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: "Reload", click: () => wc.reload() },
      { type: "separator" },
      { label: "Summarize this page with STRATA AI", click: () => s.openPanel("Summarize this page") },
      { label: lib.inReadingList(url) ? "Remove from reading list" : "Add page to reading list", enabled: /^https?:/.test(url), click: () => (lib.inReadingList(url) ? lib.removeFromReadingList(url) : lib.addToReadingList(url, wc.getTitle()), s.sendState()) },
      { label: "Send to your devices", enabled: /^https?:/.test(url), submenu: devicesSubmenu(s, url, wc.getTitle()) },
      { type: "separator" },
    );
  }
  const ext = s.profile.extensions.getContextMenuItems(wc, params);
  if (ext.length) items.push(...ext, { type: "separator" });
  items.push({ label: "Inspect", click: () => wc.inspectElement(params.x, params.y) });
  Menu.buildFromTemplate(items).popup({ window: s.win });
}

function openLinkInSplit(s, fromId, link) {
  const wc = s.newTab(link, { background: true, index: s.order.indexOf(fromId) + 1 });
  s.splitTabs(fromId, wc.id);
}

/* ------------------------------------------------------------ split view button */

function splitMenu(s) {
  const sp = s.activeSplit;
  if (!sp) {
    const others = s.order.filter((x) => x !== s.activeId && !s.tabs.get(x)?.pinned).slice(-12);
    return Menu.buildFromTemplate([
      { label: "Split with a new tab", click: () => s.splitTabs(s.activeId) },
      { label: "Split with STRATA AI", click: () => s.splitTabs(s.activeId, s.newTab(`${SOLANA_OS_URL}/ai`, { background: true }).id) },
      ...(others.length ? [{ type: "separator" }, { label: "Split with an open tab", enabled: false }, ...others.map((x) => ({ label: `  ${tabTitle(s, x).slice(0, 60)}`, click: () => s.splitTabs(s.activeId, x) }))] : []),
    ]);
  }
  return Menu.buildFromTemplate([
    { label: "Swap sides", click: () => s.swapSplit(sp.id) },
    { label: "Reset sizes", click: () => ((sp.ratio = 0.5), s.layout()) },
    { type: "separator" },
    { label: "Close left side", click: () => s.closeTab(sp.left) },
    { label: "Close right side", click: () => s.closeTab(sp.right) },
    { label: "Exit split view", click: () => s.closeSplit(sp.id) },
  ]);
}

/* ------------------------------------------------------------ wallet button */

function walletMenu(s, openExtensionPopup) {
  const exts = s.profile.session.extensions.getAllExtensions();
  const installed = WALLETS.filter((w) => exts.some((x) => x.id === w.id));
  const missing = WALLETS.filter((w) => !exts.some((x) => x.id === w.id));
  return Menu.buildFromTemplate([
    { label: `${s.profile.meta.name} wallet`, enabled: false },
    { type: "separator" },
    ...(installed.length ? installed.map((w) => ({ label: `Open ${w.name}`, click: () => openExtensionPopup(w.id) })) : [{ label: "No wallet installed in this profile", enabled: false }]),
    { type: "separator" },
    { label: "My portfolio", click: () => s.newTab(`${SOLANA_OS_URL}/portfolio`) },
    { label: "Wallet activity", click: () => s.newTab(`${SOLANA_OS_URL}/history?type=wallet-activity`) },
    ...(missing.length ? [{ type: "separator" }, ...missing.map((w) => ({ label: `Get ${w.name}`, click: () => s.newTab(`${SOLANA_OS_URL}/extensions?id=${w.id}`) }))] : []),
    { label: "More wallets…", click: () => s.newTab(`${SOLANA_OS_URL}/extensions`) },
  ]);
}

/* ------------------------------------------------------------ bookmarks bar menus */

function bookmarkFolderMenu(s, folderId) {
  const lib = s.profile.library;
  const items = lib.bookmarks().filter((b) => b.folderId === folderId);
  return Menu.buildFromTemplate([
    ...(items.length ? items.map((b) => ({ label: b.title.slice(0, 60) || b.url, click: () => s.navigate(b.url) })) : [{ label: "(empty)", enabled: false }]),
    { type: "separator" },
    { label: `Open all (${items.length})`, enabled: items.length > 0, click: () => items.forEach((b) => s.newTab(b.url, { background: true })) },
    { label: "Open all in new tab group", enabled: items.length > 0, click: () => openAllInGroup(s, items, lib.folders().find((f) => f.id === folderId)?.name ?? "") },
    { label: "Bookmark manager", click: () => s.newTab(`${SOLANA_OS_URL}/bookmarks?folder=${encodeURIComponent(folderId)}`) },
  ]);
}

function openAllInGroup(s, items, title) {
  const ids = items.map((b) => s.newTab(b.url, { background: true }).id);
  s.addToNewGroup(ids, { title });
}

function bookmarkItemMenu(s, url) {
  const lib = s.profile.library;
  const b = lib.getBookmark(url);
  if (!b) return null;
  return Menu.buildFromTemplate([
    { label: "Open in new tab", click: () => s.newTab(url, { background: true }) },
    { label: "Open in new window", click: () => new BrowserShell(s.profile.id, { url }) },
    { label: "Open in split view", click: () => openLinkInSplit(s, s.activeId, url) },
    { type: "separator" },
    { label: "Edit…", click: () => require("./ipc").openBookmarkEditor(s, url, null) },
    { label: b.favorite ? "Remove from favorites" : "Add to favorites", click: () => lib.updateBookmark(url, { favorite: !b.favorite }) },
    { label: "Delete", click: () => lib.removeBookmark(url) },
    { type: "separator" },
    { label: "Bookmark manager", click: () => s.newTab(`${SOLANA_OS_URL}/bookmarks`) },
  ]);
}

function savedGroupMenu(s, groupId) {
  const lib = s.profile.library;
  const g = lib.savedGroups().find((x) => x.id === groupId);
  if (!g) return null;
  return Menu.buildFromTemplate([
    { label: g.title || "Saved group", enabled: false },
    { type: "separator" },
    ...g.tabs.slice(0, 20).map((t) => ({ label: (t.title || t.url).slice(0, 60), click: () => s.newTab(t.url) })),
    { type: "separator" },
    { label: "Open group", click: () => require("./ipc").openSavedGroup(s, groupId) },
    { label: "Delete saved group", click: () => (lib.forgetGroup(groupId), s.sendState()) },
  ]);
}

/* ------------------------------------------------------------ the ⋮ menu */

function syncLabel(sync) {
  return sync.status === "ok" ? `Synced ${new Date(sync.at).toLocaleTimeString()}` : sync.status === "signed-out" ? "Sign in to sync" : sync.status === "unavailable" ? "Sync isn't available" : sync.status === "error" ? "Sync failed — retry" : "Sync now";
}

function appMenu(s, actions) {
  const wc = s.activeTab?.view.webContents;
  const lib = s.profile.library;
  const url = wc?.getURL() ?? "";
  const zoomPct = wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100;
  const history = lib.recentHistory(12);
  const closed = [...s.profile.closedTabs].reverse().slice(0, 10);
  const reading = lib.readingList().filter((r) => !r.read).slice(0, 12);
  const saved = lib.savedGroups();
  const exts = s.profile.session.extensions.getAllExtensions();
  const sync = lib.getSyncState();
  const dev = Boolean(lib.getSetting("developerMode", false));
  return Menu.buildFromTemplate([
    { label: "New tab", ...acc("CmdOrCtrl+T"), click: () => s.newTab(SOLANA_OS_URL) },
    { label: "New window", ...acc("CmdOrCtrl+N"), click: () => new BrowserShell(s.profile.id) },
    { label: "New split view", click: () => s.splitTabs(s.activeId) },
    { type: "separator" },
    {
      label: `Profile: ${s.profile.meta.name}`,
      submenu: [
        ...profiles.list().map((p) => ({ label: p.name, type: "radio", checked: p.id === s.profile.id, click: () => require("./ipc").openProfile(p.id) })),
        { type: "separator" },
        { label: "Add or edit profiles…", click: () => actions.profileBubble() },
      ],
    },
    { type: "separator" },
    {
      label: "History",
      submenu: [
        { label: "History", ...acc("CmdOrCtrl+H"), click: () => s.newTab(`${SOLANA_OS_URL}/history`) },
        { label: "Reopen closed tab", ...acc("CmdOrCtrl+Shift+T"), enabled: closed.length > 0, click: () => s.reopenClosedTab() },
        ...(closed.length ? [{ type: "separator" }, { label: "Recently closed", enabled: false }, ...closed.map((c) => ({ label: `  ${(c.title || c.url).slice(0, 60)}`, click: () => s.newTab(c.url, { entries: c.entries, historyIndex: c.index }) }))] : []),
        { type: "separator" },
        ...(history.length ? history.map((h) => ({ label: (h.title || h.url).slice(0, 60), click: () => s.newTab(h.url) })) : [{ label: "No history yet", enabled: false }]),
        { type: "separator" },
        { label: "Clear browsing data…", ...acc("CmdOrCtrl+Shift+Delete"), click: () => actions.clearHistory() },
      ],
    },
    {
      label: "Bookmarks and lists",
      submenu: [
        { label: lib.isBookmarked(url) ? "Edit bookmark…" : "Bookmark this tab…", ...acc("CmdOrCtrl+D"), enabled: /^https?:/.test(url), click: () => actions.bookmarkEditor() },
        { label: "Bookmark all tabs…", click: () => actions.bookmarkAll() },
        { label: s.bookmarksBarVisible ? "Hide bookmarks bar" : "Show bookmarks bar", ...acc("CmdOrCtrl+Shift+B"), click: () => actions.toggleBookmarksBar() },
        { label: "Bookmark manager", ...acc("CmdOrCtrl+Shift+O"), click: () => s.newTab(`${SOLANA_OS_URL}/bookmarks`) },
        { type: "separator" },
        {
          label: "Reading list",
          submenu: [
            { label: lib.inReadingList(url) ? "Remove this tab" : "Add this tab", enabled: /^https?:/.test(url), click: () => (lib.inReadingList(url) ? lib.removeFromReadingList(url) : lib.addToReadingList(url, wc?.getTitle()), s.sendState()) },
            { label: "Open reading list", click: () => s.newTab(`${SOLANA_OS_URL}/reading-list`) },
            ...(reading.length ? [{ type: "separator" }, ...reading.map((r) => ({ label: r.title.slice(0, 60), click: () => (s.newTab(r.url), lib.setRead(r.url, true)) }))] : []),
          ],
        },
        {
          label: "Saved tab groups",
          submenu: saved.length ? saved.map((g) => ({ label: g.title || `${g.tabs.length} tabs`, click: () => require("./ipc").openSavedGroup(s, g.id) })) : [{ label: "Right-click a group and choose Save group", enabled: false }],
        },
      ],
    },
    { label: "Passwords", click: () => actions.openPasswords() },
    {
      label: "Extensions",
      submenu: [
        { label: "Manage extensions", click: () => s.newTab(`${SOLANA_OS_URL}/extensions#installed`) },
        { label: "Find extensions", click: () => s.newTab(`${SOLANA_OS_URL}/extensions`) },
        { label: "Chrome Web Store", click: () => s.newTab("https://chromewebstore.google.com/category/extensions") },
        ...(exts.length ? [{ type: "separator" }, ...exts.map((x) => ({ label: x.name, click: () => actions.openExtension(x.id) }))] : []),
      ],
    },
    { type: "separator" },
    { label: `Zoom in (${zoomPct}%)`, ...acc("CmdOrCtrl+="), click: () => wc && wc.setZoomLevel(wc.getZoomLevel() + 0.5) },
    { label: "Zoom out", ...acc("CmdOrCtrl+-"), click: () => wc && wc.setZoomLevel(wc.getZoomLevel() - 0.5) },
    { label: "Reset zoom", ...acc("CmdOrCtrl+0"), click: () => wc?.setZoomLevel(0) },
    { label: "Full screen", ...acc("F11"), click: () => s.win.setFullScreen(!s.win.isFullScreen()) },
    { type: "separator" },
    {
      label: "Tabs",
      submenu: [
        { label: s.vertical ? "Show tabs horizontally" : "Show tabs vertically", click: () => setVertical(s.profile, !s.vertical) },
        { label: "Reopen closed tab", ...acc("CmdOrCtrl+Shift+T"), enabled: s.profile.closedTabs.length > 0, click: () => s.reopenClosedTab() },
        { label: "Duplicate tab", click: () => s.duplicateTab(s.activeId) },
        { label: s.activeTab?.pinned ? "Unpin tab" : "Pin tab", click: () => s.setPinned(s.activeId, !s.activeTab?.pinned) },
        { label: "Move tab to new window", enabled: s.tabs.size > 1, click: () => s.moveTabToNewWindow(s.activeId) },
      ],
    },
    { label: "STRATA AI side panel", ...acc("CmdOrCtrl+Shift+A"), type: "checkbox", checked: Boolean(s.panel?.open), click: () => s.togglePanel() },
    { label: "Send to your devices", enabled: /^https?:/.test(url), submenu: devicesSubmenu(s, url, wc?.getTitle() ?? url) },
    { type: "separator" },
    {
      label: "Developer",
      submenu: [
        { label: "Developer mode", type: "checkbox", checked: dev, click: () => actions.setDeveloperMode(!dev) },
        { label: "Load unpacked extension…", enabled: dev, click: () => actions.loadUnpacked() },
        { label: "Developer dashboard", click: () => s.newTab(`${SOLANA_OS_URL}/developers`) },
        { label: "STRATA API docs", click: () => s.newTab(`${SOLANA_OS_URL}/developers/docs`) },
        { type: "separator" },
        { label: "Developer tools", ...acc("F12"), click: () => wc?.toggleDevTools() },
      ],
    },
    { label: syncLabel(sync), click: () => (sync.status === "signed-out" ? s.newTab(`${SOLANA_OS_URL}/login`) : lib.syncNow()) },
    {
      label: "Appearance",
      submenu: [
        ["light", "Light"],
        ["dark", "Dark"],
        ["system", "Match system"],
      ].map(([id, label]) => ({ label, type: "radio", checked: appearance.get() === id, click: () => appearance.set(id) })),
    },
    { label: "Settings", click: () => s.newTab(`${SOLANA_OS_URL}/settings`) },
    { label: "Check for updates…", click: () => actions.checkForUpdates() },
    { label: "About STRATA", click: () => s.newTab(SOLANA_OS_URL) },
    { type: "separator" },
    { label: "Exit", click: () => app.quit() },
  ]);
}

/* ------------------------------------------------------------ macOS menu bar */

function buildMenuBar(actions) {
  const act = (fn) => () => {
    const s = focusedShell();
    if (s) fn(s);
  };
  const updatesItem = { label: "Check for Updates…", click: () => actions.checkForUpdates() };
  const template = [
    ...(process.platform === "darwin"
      ? [{ label: app.name, submenu: [{ role: "about" }, updatesItem, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Tab", accelerator: "CmdOrCtrl+T", click: act((s) => s.newTab(SOLANA_OS_URL)) },
        { label: "New Window", accelerator: "CmdOrCtrl+N", click: act((s) => new BrowserShell(s.profile.id)) },
        { label: "Reopen Closed Tab", accelerator: "CmdOrCtrl+Shift+T", click: act((s) => s.reopenClosedTab()) },
        { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: act((s) => s.closeTab(s.activeId)) },
        { type: "separator" },
        { label: "Open Location…", accelerator: "CmdOrCtrl+L", click: act((s) => s.focusAddress()) },
        { type: "separator" },
        { label: "Passwords…", click: () => actions.openPasswords() },
        ...(process.platform === "darwin" ? [] : [{ type: "separator" }, updatesItem, { type: "separator" }, { role: "quit" }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: act((s) => s.reload()) },
        { label: "Back", accelerator: "CmdOrCtrl+[", click: act((s) => s.activeTab?.view.webContents.navigationHistory.goBack()) },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: act((s) => s.activeTab?.view.webContents.navigationHistory.goForward()) },
        { type: "separator" },
        { label: "STRATA AI", accelerator: "CmdOrCtrl+Shift+A", click: act((s) => s.togglePanel()) },
        { label: "Split View", click: act((s) => s.splitTabs(s.activeId)) },
        { label: "Vertical Tabs", click: act((s) => setVertical(s.profile, !s.vertical)) },
        { label: "Bookmarks Bar", accelerator: "CmdOrCtrl+Shift+B", click: act(() => actions.toggleBookmarksBar()) },
        { type: "separator" },
        { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: act((s) => { const wc = s.activeTab?.view.webContents; if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5); }) },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: act((s) => { const wc = s.activeTab?.view.webContents; if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5); }) },
        { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: act((s) => s.activeTab?.view.webContents.setZoomLevel(0)) },
        { type: "separator" },
        { label: "Developer Tools", accelerator: process.platform === "darwin" ? "Alt+Cmd+I" : "Ctrl+Shift+I", click: act((s) => s.activeTab?.view.webContents.toggleDevTools()) },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "History",
      submenu: [
        { label: "Show All History", accelerator: "CmdOrCtrl+Y", click: act((s) => s.newTab(`${SOLANA_OS_URL}/history`)) },
        { label: "Clear History…", click: () => actions.clearHistory() },
      ],
    },
    {
      label: "Bookmarks",
      submenu: [
        { label: "Bookmark This Tab…", accelerator: "CmdOrCtrl+D", click: act(() => actions.bookmarkEditor()) },
        { label: "Bookmark Manager", accelerator: "CmdOrCtrl+Alt+B", click: act((s) => s.newTab(`${SOLANA_OS_URL}/bookmarks`)) },
        { label: "Reading List", click: act((s) => s.newTab(`${SOLANA_OS_URL}/reading-list`)) },
      ],
    },
    {
      label: "Profiles",
      submenu: [...profiles.list().map((p) => ({ label: p.name, click: () => require("./ipc").openProfile(p.id) })), { type: "separator" }, { label: "Add Profile…", click: act(() => actions.profileBubble()) }],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "About STRATA", click: () => electronShell.openExternal(SOLANA_OS_URL) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { tabMenu, stripMenu, pageContextMenu, splitMenu, walletMenu, bookmarkFolderMenu, bookmarkItemMenu, savedGroupMenu, appMenu, buildMenuBar, setVertical, popup, GROUP_COLORS, BrowserWindow };
