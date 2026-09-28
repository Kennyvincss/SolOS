// A STRATA browser window: tabs, pinned tabs, tab groups, split view, the AI
// side panel, vertical tabs, bookmarks bar, and session restore.
// SPDX-License-Identifier: GPL-3.0-only

const path = require("node:path");
const crypto = require("node:crypto");
const { BrowserWindow, WebContentsView, net, shell } = require("electron");
const appearance = require("./appearance");
const { SOLANA_OS_URL, hostOf, riskFromReport, normalizeOrder, moveInOrder } = require("./lib");
const { getRuntime } = require("./runtime");

const TABSTRIP_H = 40;
const NAVBAR_H = 48;
const BOOKMARKS_H = 32;
const SIDEBAR_W = 256;
const SIDEBAR_COLLAPSED_W = 56;
const SPLIT_GAP = 8;
const PANEL_MIN = 320;
const PANEL_MAX = 720;

/** Chrome's tab group colors. */
const GROUP_COLORS = { grey: "#9aa0a6", blue: "#8ab4f8", red: "#f28b82", yellow: "#fdd663", green: "#81c995", pink: "#ff8bcb", purple: "#c58af9", cyan: "#78d9ec", orange: "#fcad70" };

const shells = new Set();
let quitting = false;
const newId = () => crypto.randomUUID().slice(0, 8);

/* ------------------------------------------------------------ site safety */

// Every site's domain is checked with the STRATA Security Center (registry
// match, lookalike domains, bait keywords). Cached per host.
const riskCache = new Map();
async function checkSite(url) {
  const host = hostOf(url);
  if (!host) return null;
  if (host === hostOf(SOLANA_OS_URL)) return { level: "low", label: "STRATA" };
  if (riskCache.has(host)) return riskCache.get(host);
  try {
    const res = await net.fetch(`${SOLANA_OS_URL}/api/security?q=${encodeURIComponent(url)}`);
    const risk = res.ok ? riskFromReport(await res.json()) : null;
    riskCache.set(host, risk);
    return risk;
  } catch {
    return null;
  }
}

/** Hooks set by main (menus, shortcuts, page context menu, Google sign-in). */
let hooks = {
  handleShortcut: () => {},
  pageContextMenu: () => {},
  isGoogleSignIn: () => false,
  onStateChanged: () => {},
};
function setHooks(h) {
  hooks = { ...hooks, ...h };
}

function shellOfTab(id) {
  for (const s of shells) if (s.tabs.has(id)) return s;
  return null;
}

function shellFor(webContents) {
  if (!webContents) return null;
  for (const s of shells) {
    if (s.win.isDestroyed()) continue;
    if (s.win.webContents === webContents || s.tabs.has(webContents.id) || s.panel?.view.webContents === webContents || s.overlay?.webContents === webContents) return s;
  }
  return null;
}

function shellsOf(profileId) {
  return [...shells].filter((s) => s.profile.id === profileId && !s.win.isDestroyed());
}

function focusedShell(profileId) {
  const w = BrowserWindow.getFocusedWindow();
  const all = profileId ? shellsOf(profileId) : [...shells];
  return all.find((s) => s.win === w) ?? all.sort((a, b) => b.lastFocus - a.lastFocus)[0] ?? null;
}

class BrowserShell {
  /**
   * @param {string} profileId
   * @param {{ url?: string, restore?: object, adopt?: object[], bounds?: object }} opts
   */
  constructor(profileId, { url, restore, adopt, bounds } = {}) {
    this.profile = getRuntime(profileId);
    this.tabs = new Map(); // id -> tab
    this.order = [];
    this.groups = new Map(); // id -> { id, title, color, collapsed }
    this.splits = new Map(); // id -> { id, left, right, ratio, focus }
    this.activeId = null;
    this.attached = new Set();
    this.panel = null; // { view, width, shown (0..1), open }
    this.overlay = null;
    this.lastFocus = Date.now();
    this.ready = false;
    const lib = this.profile.library;
    this.sidebarCollapsed = Boolean(lib.getSetting("sidebarCollapsed", false));
    const b = restore?.bounds ?? bounds;
    this.win = new BrowserWindow({
      width: b?.width ?? 1360,
      height: b?.height ?? 880,
      ...(b && Number.isFinite(b.x) ? { x: b.x, y: b.y } : {}),
      minWidth: 720,
      minHeight: 480,
      title: "STRATA",
      icon: path.join(__dirname, "ui", "app-icon.png"),
      backgroundColor: appearance.colors().bg,
      // Tabs live in the title bar, like Chrome. macOS keeps its traffic lights;
      // Windows/Linux draw the window buttons over the top-right corner.
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
      ...(process.platform === "darwin" ? {} : { titleBarOverlay: { color: appearance.colors().bar, symbolColor: appearance.colors().symbol, height: this.vertical ? NAVBAR_H : TABSTRIP_H } }),
      webPreferences: {
        preload: path.join(__dirname, "preload-shell.js"),
        contextIsolation: true,
        // The toolbar preload needs Node's require() to inject <browser-action-list>.
        sandbox: false,
      },
    });
    if (restore?.maximized) this.win.maximize();
    shells.add(this);
    // No menu bar on Windows/Linux: the ⋮ button opens the menu and shortcuts are handled in main.
    if (process.platform !== "darwin") this.win.removeMenu();
    this.win.webContents.on("before-input-event", (e, input) => hooks.handleShortcut(this, e, input));
    this.win.loadFile(path.join(__dirname, "ui", "shell.html"));
    this.win.on("resize", () => this.layout());
    this.win.on("focus", () => {
      this.lastFocus = Date.now();
      require("./profiles").setLastUsed(this.profile.id);
    });
    this.win.on("close", () => this.saveSession({ closing: true }));
    this.win.on("closed", () => {
      shells.delete(this);
      for (const t of this.tabs.values()) if (!t.view.webContents.isDestroyed()) t.view.webContents.close();
      if (this.panel && !this.panel.view.webContents.isDestroyed()) this.panel.view.webContents.close();
      this.tabs.clear();
    });
    this.win.webContents.once("did-finish-load", () => {
      this.ready = true;
      if (adopt?.length) {
        for (const t of adopt) this.adoptTab(t);
        this.selectTab(adopt[0].id);
      } else if (restore?.tabs?.length) this.restoreFrom(restore);
      else this.newTab(url ?? SOLANA_OS_URL);
    });
  }

  get vertical() {
    return Boolean(this.profile.library.getSetting("verticalTabs", false));
  }

  get bookmarksBarVisible() {
    return Boolean(this.profile.library.getSetting("bookmarksBar", true));
  }

  get activeTab() {
    return this.tabs.get(this.activeId);
  }

  /** The split the active tab is in, if any. */
  get activeSplit() {
    const t = this.activeTab;
    return t?.splitId ? this.splits.get(t.splitId) : null;
  }

  /** Tabs currently on screen (one, or two in split view). */
  visibleIds() {
    const sp = this.activeSplit;
    if (sp) return [sp.left, sp.right];
    return this.activeId ? [this.activeId] : [];
  }

  /* ------------------------------------------------------------ tabs */

  createView() {
    return new WebContentsView({
      webPreferences: {
        session: this.profile.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Password manager and the STRATA site bridge. Runs isolated from the page.
        preload: path.join(__dirname, "preload-tab.js"),
      },
    });
  }

  /**
   * Open a tab. opts: background, index, groupId, pinned, openerId, entries
   * (navigation history to restore), lazy (don't load until selected), title.
   */
  newTab(url, opts = {}) {
    const view = this.createView();
    const wc = view.webContents;
    const tab = { id: wc.id, view, requestedUrl: url, risk: null, favicon: opts.favicon ?? null, pinned: Boolean(opts.pinned), groupId: opts.groupId && this.groups.has(opts.groupId) ? opts.groupId : null, splitId: null, crashed: false, pending: null, placeholderTitle: opts.title ?? null };
    this.tabs.set(tab.id, tab);
    this.profile.extensions.addTab(wc, this.win);
    wireTab(tab);
    if (isSiteMuted(this.profile, url)) wc.setAudioMuted(true);

    // Position: explicit index, after the opener, or at the end.
    let index = this.order.length;
    if (typeof opts.index === "number") index = opts.index;
    else if (opts.openerId && this.order.includes(opts.openerId)) {
      index = this.order.indexOf(opts.openerId) + 1;
      const opener = this.tabs.get(opts.openerId);
      if (opener?.groupId && !tab.pinned && opts.groupId === undefined) tab.groupId = opener.groupId;
    }
    this.order = normalizeOrder(moveInOrder([...this.order, tab.id], tab.id, index), this.tabs);

    if (opts.lazy) tab.pending = { url, entries: opts.entries, index: opts.historyIndex };
    else loadInto(wc, url, opts.entries, opts.historyIndex);

    if (!opts.background || !this.activeId) this.selectTab(tab.id);
    else this.changed();
    return wc;
  }

  /** Take over a tab from another window (keeps the page and its state). */
  adoptTab(t) {
    t.groupId = t.groupId && this.groups.has(t.groupId) ? t.groupId : null;
    t.splitId = null;
    this.tabs.set(t.id, t);
    const store = this.profile.extensions.ctx?.store;
    if (store) {
      store.tabToWindow.set(t.view.webContents, this.win);
      store.addWindow?.(this.win);
    }
    this.order = normalizeOrder([...this.order, t.id], this.tabs);
  }

  /** Remove a tab from this window without closing its page (for moving it). */
  detachTab(id) {
    const t = this.tabs.get(id);
    if (!t) return null;
    this.leaveSplit(id);
    if (this.attached.has(id)) {
      this.win.contentView.removeChildView(t.view);
      this.attached.delete(id);
    }
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.pruneGroups();
    if (this.activeId === id) this.activeId = null;
    if (!this.tabs.size) setImmediate(() => !this.win.isDestroyed() && this.win.close());
    else if (!this.activeId) this.selectTab(this.order[0]);
    else this.changed();
    return t;
  }

  selectTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    // Selecting a tab inside a collapsed group expands the group, like Chrome.
    if (tab.groupId && this.groups.get(tab.groupId)?.collapsed) this.groups.get(tab.groupId).collapsed = false;
    this.activeId = id;
    tab.lastActive = Date.now();
    if (tab.pending) {
      const { url, entries, index } = tab.pending;
      tab.pending = null;
      loadInto(tab.view.webContents, url, entries, index);
    }
    const sp = tab.splitId ? this.splits.get(tab.splitId) : null;
    if (sp) {
      sp.focus = id;
      const other = this.tabs.get(sp.left === id ? sp.right : sp.left);
      if (other?.pending) {
        const { url, entries, index } = other.pending;
        other.pending = null;
        loadInto(other.view.webContents, url, entries, index);
      }
    }
    this.layout();
    tab.view.webContents.focus();
    this.profile.extensions.selectTab(tab.view.webContents);
    this.changed();
  }

  /** Close a tab. Remembered for "Reopen closed tab". */
  closeTab(id, { remember = true } = {}) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const wc = tab.view.webContents;
    if (remember && !wc.isDestroyed()) {
      const g = tab.groupId ? this.groups.get(tab.groupId) : null;
      const url = tab.pending?.url ?? (wc.getURL() || tab.requestedUrl || "");
      if (/^https?:/.test(url)) {
        let entries = null;
        let index = 0;
        try {
          entries = wc.navigationHistory.getAllEntries?.() ?? null;
          index = wc.navigationHistory.getActiveIndex?.() ?? 0;
        } catch {
          entries = null;
        }
        const closed = this.profile.closedTabs;
        closed.push({ url, title: wc.getTitle(), favicon: tab.favicon, entries, index, pinned: tab.pinned, position: this.order.indexOf(id), group: g ? { ...g } : null, at: Date.now() });
        if (closed.length > 25) closed.shift();
      }
    }
    const idx = this.order.indexOf(id);
    const wasActive = this.activeId === id;
    this.leaveSplit(id);
    if (this.attached.has(id)) {
      this.win.contentView.removeChildView(tab.view);
      this.attached.delete(id);
    }
    this.tabs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.pruneGroups();
    if (!wc.isDestroyed()) wc.close();
    if (!this.tabs.size) {
      this.activeId = null;
      return this.win.close();
    }
    if (wasActive) {
      // Next tab to the right (same group if possible), else to the left.
      const next = this.order[Math.min(idx, this.order.length - 1)];
      this.selectTab(next);
    } else this.changed();
  }

  closeOtherTabs(id) {
    for (const other of [...this.order]) if (other !== id && !this.tabs.get(other)?.pinned) this.closeTab(other);
    if (this.tabs.has(id)) this.selectTab(id);
  }

  closeTabsToRight(id) {
    const idx = this.order.indexOf(id);
    for (const other of this.order.slice(idx + 1)) if (!this.tabs.get(other)?.pinned) this.closeTab(other);
  }

  reopenClosedTab() {
    const c = this.profile.closedTabs.pop();
    if (!c) return false;
    let groupId;
    if (c.group) {
      if (!this.groups.has(c.group.id)) this.groups.set(c.group.id, { ...c.group, collapsed: false });
      groupId = c.group.id;
    }
    this.newTab(c.url, { entries: c.entries, historyIndex: c.index, pinned: c.pinned, index: c.position, groupId, favicon: c.favicon });
    return true;
  }

  duplicateTab(id) {
    const t = this.tabs.get(id);
    if (!t) return;
    const wc = t.view.webContents;
    let entries = null;
    let index = 0;
    try {
      entries = wc.navigationHistory.getAllEntries?.() ?? null;
      index = wc.navigationHistory.getActiveIndex?.() ?? 0;
    } catch {
      entries = null;
    }
    this.newTab(t.pending?.url ?? wc.getURL(), { entries, historyIndex: index, index: this.order.indexOf(id) + 1, groupId: t.groupId, pinned: t.pinned, favicon: t.favicon });
  }

  setPinned(id, pinned) {
    const t = this.tabs.get(id);
    if (!t || t.pinned === pinned) return;
    if (pinned) {
      this.leaveSplit(id);
      t.groupId = null;
      this.pruneGroups();
    }
    t.pinned = pinned;
    // Newly pinned tabs go to the end of the pinned tabs; unpinned ones to the start of the rest.
    const pinnedCount = this.order.filter((x) => this.tabs.get(x)?.pinned && x !== id).length;
    this.order = normalizeOrder(moveInOrder(this.order, id, pinnedCount), this.tabs);
    this.changed();
  }

  /** Move a tab to a position; groupId (or null) sets its group. */
  moveTab(id, index, groupId) {
    const t = this.tabs.get(id);
    if (!t) return;
    if (groupId !== undefined) {
      t.groupId = groupId && this.groups.has(groupId) ? groupId : null;
      if (t.groupId) t.pinned = false;
    }
    this.order = normalizeOrder(moveInOrder(this.order, id, index), this.tabs);
    this.pruneGroups();
    this.keepSplitsAdjacent();
    this.changed();
  }

  reload(id) {
    const t = this.tabs.get(id ?? this.activeId);
    if (!t) return;
    if (t.pending) return this.selectTab(t.id);
    t.crashed = false;
    t.view.webContents.reload();
  }

  toggleMuteSite(id) {
    const t = this.tabs.get(id ?? this.activeId);
    if (!t) return;
    const host = hostOf(t.pending?.url ?? t.view.webContents.getURL());
    if (!host) {
      t.view.webContents.setAudioMuted(!t.view.webContents.isAudioMuted());
      return this.changed();
    }
    const lib = this.profile.library;
    const muted = new Set(lib.getSetting("mutedSites", []));
    if (muted.has(host)) muted.delete(host);
    else muted.add(host);
    lib.setSetting("mutedSites", [...muted]);
    for (const s of shellsOf(this.profile.id)) {
      for (const tab of s.tabs.values()) {
        const wc = tab.view.webContents;
        if (hostOf(tab.pending?.url ?? wc.getURL()) === host) wc.setAudioMuted(muted.has(host));
      }
      s.changed();
    }
  }

  /* ------------------------------------------------------------ groups */

  pickGroupColor() {
    const used = new Set([...this.groups.values()].map((g) => g.color));
    return Object.keys(GROUP_COLORS).find((c) => !used.has(c)) ?? "grey";
  }

  addToNewGroup(ids, { title = "", color } = {}) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter((i) => this.tabs.has(i));
    if (!list.length) return null;
    const id = `g-${newId()}`;
    this.groups.set(id, { id, title, color: color && GROUP_COLORS[color] ? color : this.pickGroupColor(), collapsed: false });
    const first = Math.min(...list.map((i) => this.order.indexOf(i)));
    for (const i of list) {
      const t = this.tabs.get(i);
      if (t.pinned) t.pinned = false;
      t.groupId = id;
    }
    // Put the group where its first tab was.
    let order = this.order.filter((x) => !list.includes(x));
    const at = Math.min(first, order.length);
    order = [...order.slice(0, at), ...list, ...order.slice(at)];
    this.order = normalizeOrder(order, this.tabs);
    this.pruneGroups();
    this.changed();
    return id;
  }

  addToGroup(id, groupId) {
    const t = this.tabs.get(id);
    if (!t || !this.groups.has(groupId)) return;
    t.pinned = false;
    t.groupId = groupId;
    const last = [...this.order].reverse().find((x) => this.tabs.get(x)?.groupId === groupId && x !== id);
    this.order = normalizeOrder(moveInOrder(this.order, id, last ? this.order.filter((x) => x !== id).indexOf(last) + 1 : this.order.length), this.tabs);
    this.pruneGroups();
    this.changed();
  }

  removeFromGroup(id) {
    const t = this.tabs.get(id);
    if (!t?.groupId) return;
    const g = t.groupId;
    t.groupId = null;
    // Place it right after its former group.
    const rest = this.order.filter((x) => x !== id);
    const lastInGroup = [...rest].reverse().find((x) => this.tabs.get(x)?.groupId === g);
    this.order = normalizeOrder(moveInOrder(this.order, id, lastInGroup ? rest.indexOf(lastInGroup) + 1 : rest.length), this.tabs);
    this.pruneGroups();
    this.changed();
  }

  updateGroup(groupId, patch) {
    const g = this.groups.get(groupId);
    if (!g) return;
    if (typeof patch.title === "string") g.title = patch.title.slice(0, 60);
    if (patch.color && GROUP_COLORS[patch.color]) g.color = patch.color;
    if (typeof patch.collapsed === "boolean") {
      g.collapsed = patch.collapsed;
      // Collapsing the group of the active tab moves focus out of it (like Chrome).
      if (g.collapsed && this.activeTab?.groupId === groupId) {
        const outside = this.order.find((x) => this.tabs.get(x)?.groupId !== groupId);
        if (outside) this.selectTab(outside);
        else g.collapsed = false;
      }
    }
    if (this.profile.library.isGroupSaved(groupId)) this.saveGroup(groupId);
    this.changed();
  }

  ungroup(groupId) {
    for (const t of this.tabs.values()) if (t.groupId === groupId) t.groupId = null;
    this.pruneGroups();
    this.changed();
  }

  closeGroup(groupId) {
    for (const id of this.order.filter((x) => this.tabs.get(x)?.groupId === groupId)) this.closeTab(id);
  }

  groupTabs(groupId) {
    return this.order.filter((x) => this.tabs.get(x)?.groupId === groupId);
  }

  newTabInGroup(groupId) {
    const ids = this.groupTabs(groupId);
    const index = ids.length ? this.order.indexOf(ids[ids.length - 1]) + 1 : this.order.length;
    this.newTab(SOLANA_OS_URL, { groupId, index });
  }

  saveGroup(groupId) {
    const g = this.groups.get(groupId);
    if (!g) return;
    const tabs = this.groupTabs(groupId).map((id) => {
      const t = this.tabs.get(id);
      const wc = t.view.webContents;
      return { url: t.pending?.url ?? wc.getURL(), title: wc.getTitle() || t.placeholderTitle || "" };
    });
    this.profile.library.saveGroup(groupId, { title: g.title, color: g.color, tabs });
    this.changed();
  }

  toggleSavedGroup(groupId) {
    if (this.profile.library.isGroupSaved(groupId)) this.profile.library.forgetGroup(groupId);
    else this.saveGroup(groupId);
    this.changed();
  }

  /** Remove groups that no longer have tabs in this window. */
  pruneGroups() {
    const used = new Set([...this.tabs.values()].map((t) => t.groupId).filter(Boolean));
    for (const id of [...this.groups.keys()]) if (!used.has(id)) this.groups.delete(id);
  }

  /* ------------------------------------------------------------ split view */

  /** Show two tabs side by side. With one tab, pairs it with a new tab. */
  splitTabs(leftId, rightId) {
    const left = this.tabs.get(leftId);
    if (!left) return;
    if (!rightId || rightId === leftId) {
      const wc = this.newTab(SOLANA_OS_URL, { background: true, index: this.order.indexOf(leftId) + 1, groupId: left.groupId });
      rightId = wc.id;
    }
    const right = this.tabs.get(rightId);
    if (!right) return;
    this.leaveSplit(leftId);
    this.leaveSplit(rightId);
    for (const t of [left, right]) t.pinned = false;
    right.groupId = left.groupId;
    const id = `s-${newId()}`;
    this.splits.set(id, { id, left: leftId, right: rightId, ratio: 0.5, focus: rightId });
    left.splitId = id;
    right.splitId = id;
    this.order = normalizeOrder(moveInOrder(this.order, rightId, this.order.filter((x) => x !== rightId).indexOf(leftId) + 1), this.tabs);
    this.selectTab(rightId);
  }

  leaveSplit(id) {
    const t = this.tabs.get(id);
    if (!t?.splitId) return;
    const sp = this.splits.get(t.splitId);
    this.splits.delete(t.splitId);
    for (const x of [sp?.left, sp?.right]) {
      const tab = this.tabs.get(x);
      if (tab) tab.splitId = null;
    }
    this.layout();
  }

  closeSplit(splitId) {
    const sp = this.splits.get(splitId ?? this.activeSplit?.id);
    if (!sp) return;
    this.leaveSplit(sp.left);
    this.selectTab(this.activeId);
  }

  swapSplit(splitId) {
    const sp = this.splits.get(splitId ?? this.activeSplit?.id);
    if (!sp) return;
    [sp.left, sp.right] = [sp.right, sp.left];
    this.order = normalizeOrder(moveInOrder(this.order, sp.left, this.order.indexOf(sp.right)), this.tabs);
    this.layout();
    this.changed();
  }

  /** The other side of the split the tab is in. */
  otherSide(id) {
    const t = this.tabs.get(id);
    const sp = t?.splitId ? this.splits.get(t.splitId) : null;
    return sp ? (sp.left === id ? sp.right : sp.left) : null;
  }

  keepSplitsAdjacent() {
    for (const sp of this.splits.values()) {
      const li = this.order.indexOf(sp.left);
      const ri = this.order.indexOf(sp.right);
      if (ri !== li + 1) this.order = moveInOrder(this.order, sp.right, this.order.filter((x) => x !== sp.right).indexOf(sp.left) + 1);
    }
  }

  /* ------------------------------------------------------------ moving tabs between windows */

  moveTabToNewWindow(id) {
    const ids = this.tabs.get(id)?.splitId ? [this.splits.get(this.tabs.get(id).splitId).left, this.splits.get(this.tabs.get(id).splitId).right] : [id];
    if (ids.length === this.tabs.size) return; // it's the only thing in this window already
    const detached = ids.map((x) => this.detachTab(x)).filter(Boolean);
    const bounds = this.win.getBounds();
    return new BrowserShell(this.profile.id, { adopt: detached, bounds: { width: bounds.width, height: bounds.height, x: bounds.x + 32, y: bounds.y + 32 } });
  }

  moveTabToWindow(id, target) {
    if (!target || target === this || target.profile.id !== this.profile.id) return;
    const t = this.detachTab(id);
    if (!t) return;
    target.adoptTab(t);
    target.selectTab(t.id);
    target.win.focus();
  }

  moveGroupToNewWindow(groupId) {
    const ids = this.groupTabs(groupId);
    const g = this.groups.get(groupId);
    if (!g || ids.length === this.tabs.size) return;
    const detached = ids.map((x) => this.detachTab(x)).filter(Boolean);
    const s = new BrowserShell(this.profile.id, { adopt: detached });
    s.groups.set(groupId, { ...g });
    for (const t of detached) t.groupId = groupId;
    return s;
  }

  /* ------------------------------------------------------------ AI side panel */

  togglePanel(force) {
    const open = typeof force === "boolean" ? force : !this.panel?.open;
    if (open) this.openPanel();
    else this.closePanel();
  }

  openPanel(prompt) {
    if (!this.panel) {
      const view = new WebContentsView({
        webPreferences: { session: this.profile.session, sandbox: true, contextIsolation: true, preload: path.join(__dirname, "preload-tab.js") },
      });
      view.setBackgroundColor("#0c0c11");
      const wc = view.webContents;
      // Links from the panel open in the browser, not inside the panel.
      wc.setWindowOpenHandler(({ url }) => {
        this.openFromPanel(url);
        return { action: "deny" };
      });
      wc.on("will-navigate", (e, url) => {
        try {
          const u = new URL(url);
          if (u.origin === new URL(SOLANA_OS_URL).origin && u.pathname === "/ai") return;
        } catch {
          /* fall through */
        }
        e.preventDefault();
        this.openFromPanel(url);
      });
      wc.on("before-input-event", (e, input) => hooks.handleShortcut(this, e, input));
      wc.loadURL(`${SOLANA_OS_URL}/ai?panel=1`).catch(() => {});
      this.panel = { view, width: Number(this.profile.library.getSetting("panelWidth", 400)) || 400, shown: 0, open: false, queued: [] };
    }
    if (prompt) this.panelPrompt(prompt);
    if (this.panel.open) return this.panel.view.webContents.focus();
    this.panel.open = true;
    this.win.contentView.addChildView(this.panel.view);
    this.animatePanel(1);
    this.changed();
  }

  closePanel() {
    if (!this.panel?.open) return;
    this.panel.open = false;
    this.animatePanel(0, () => {
      if (!this.panel.open) this.win.contentView.removeChildView(this.panel.view);
    });
    this.activeTab?.view.webContents.focus();
    this.changed();
  }

  animatePanel(target, done) {
    clearInterval(this.panelTimer);
    const from = this.panel.shown;
    const start = Date.now();
    const ms = 180;
    this.panelTimer = setInterval(() => {
      const k = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      this.panel.shown = from + (target - from) * eased;
      this.layout();
      if (k >= 1) {
        clearInterval(this.panelTimer);
        this.panel.shown = target;
        this.layout();
        this.sendState();
        done?.();
      }
    }, 16);
  }

  /** Ask STRATA AI in the side panel (opens it). The panel reads the page itself. */
  panelPrompt(prompt) {
    if (!this.panel) return this.openPanel(prompt);
    const send = () => this.panel.view.webContents.send("desktop:panelPrompt", { prompt: String(prompt).slice(0, 2000) });
    if (this.panel.view.webContents.isLoading()) this.panel.view.webContents.once("did-finish-load", () => setTimeout(send, 300));
    else send();
    if (!this.panel.open) this.openPanel();
  }

  openFromPanel(url) {
    const t = this.activeTab;
    if (t && t.view.webContents.getURL().startsWith(SOLANA_OS_URL)) t.view.webContents.loadURL(url).catch(() => {});
    else this.newTab(url, { openerId: this.activeId });
  }

  /** Tell the panel the page changed (it refreshes its suggestions). */
  notifyPanel() {
    if (!this.panel || this.panel.view.webContents.isDestroyed()) return;
    const t = this.activeTab;
    const wc = t?.view.webContents;
    this.panel.view.webContents.send("desktop:pageChanged", { url: t?.pending?.url ?? wc?.getURL() ?? "", title: wc?.getTitle() || t?.placeholderTitle || "" });
  }

  /* ------------------------------------------------------------ layout */

  toolbarHeight() {
    return (this.vertical ? NAVBAR_H : TABSTRIP_H + NAVBAR_H) + (this.bookmarksBarVisible ? BOOKMARKS_H : 0);
  }

  sidebarWidth() {
    return this.vertical ? (this.sidebarCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W) : 0;
  }

  computeLayout() {
    const [W, H] = this.win.getContentSize();
    const y = this.toolbarHeight();
    const x = this.sidebarWidth();
    const h = Math.max(0, H - y);
    let w = Math.max(0, W - x);
    let panel = null;
    if (this.panel && (this.panel.open || this.panel.shown > 0)) {
      const pw = Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, this.panel.width)) * this.panel.shown);
      panel = { x: W - pw, y, width: pw, height: h };
      w = Math.max(0, w - pw - (pw ? 1 : 0));
    }
    const content = { x, y, width: w, height: h };
    const sp = this.activeSplit;
    if (!sp) return { content, panes: [{ id: this.activeId, ...content }], divider: null, panel };
    const lw = Math.round((w - SPLIT_GAP) * sp.ratio);
    const left = { id: sp.left, x, y, width: lw, height: h };
    const right = { id: sp.right, x: x + lw + SPLIT_GAP, y, width: Math.max(0, w - lw - SPLIT_GAP), height: h };
    return { content, panes: [left, right], divider: { x: x + lw, y, width: SPLIT_GAP, height: h }, panel, focus: sp.focus };
  }

  layout() {
    if (this.win.isDestroyed()) return;
    const L = this.computeLayout();
    this.lastLayout = L;
    const visible = new Set(L.panes.map((p) => p.id).filter((id) => this.tabs.has(id)));
    for (const id of [...this.attached]) {
      if (!visible.has(id) || !this.tabs.has(id)) {
        const t = this.tabs.get(id);
        if (t) this.win.contentView.removeChildView(t.view);
        this.attached.delete(id);
      }
    }
    for (const p of L.panes) {
      const t = this.tabs.get(p.id);
      if (!t) continue;
      if (!this.attached.has(p.id)) {
        this.win.contentView.addChildView(t.view, 0);
        this.attached.add(p.id);
      }
      t.view.setBounds({ x: p.x, y: p.y, width: p.width, height: p.height });
    }
    if (this.panel) {
      if (L.panel) this.panel.view.setBounds(L.panel);
      else this.panel.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    if (this.overlay) {
      const [W, H] = this.win.getContentSize();
      this.overlay.setBounds({ x: 0, y: 0, width: W, height: H });
    }
    if (this.ready) this.win.webContents.send("shell:layout", L);
  }

  /** Drag the split divider or the panel edge (a transparent overlay captures the mouse). */
  startDrag(kind) {
    if (this.overlay) return;
    const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, "preload-overlay.js") } });
    view.setBackgroundColor("#00000000");
    this.overlay = view;
    this.dragKind = kind;
    this.win.contentView.addChildView(view);
    view.webContents.loadFile(path.join(__dirname, "ui", "overlay.html"));
    this.layout();
  }

  dragMove(x) {
    const L = this.lastLayout;
    if (!L) return;
    if (this.dragKind === "split" && this.activeSplit) {
      const r = (x - L.content.x) / Math.max(1, L.content.width);
      this.activeSplit.ratio = Math.min(0.85, Math.max(0.15, r));
    } else if (this.dragKind === "panel" && this.panel) {
      const [W] = this.win.getContentSize();
      this.panel.width = Math.min(PANEL_MAX, Math.max(PANEL_MIN, W - x));
    }
    this.layout();
  }

  endDrag() {
    if (!this.overlay) return;
    this.win.contentView.removeChildView(this.overlay);
    if (!this.overlay.webContents.isDestroyed()) this.overlay.webContents.close();
    this.overlay = null;
    if (this.dragKind === "panel" && this.panel) this.profile.library.setSetting("panelWidth", Math.round(this.panel.width));
    this.dragKind = null;
    this.layout();
    this.changed();
  }

  applyChrome() {
    if (this.win.isDestroyed()) return;
    const c = appearance.colors();
    this.win.setBackgroundColor(c.bg);
    if (process.platform !== "darwin") {
      try {
        this.win.setTitleBarOverlay({ color: c.bar, symbolColor: c.symbol, height: this.vertical ? NAVBAR_H : TABSTRIP_H });
      } catch {
        /* not supported */
      }
    }
    this.layout();
    this.sendState();
  }

  setSidebarCollapsed(v) {
    this.sidebarCollapsed = Boolean(v);
    this.profile.library.setSetting("sidebarCollapsed", this.sidebarCollapsed);
    this.applyChrome();
  }

  /* ------------------------------------------------------------ navigation */

  /** The tab the address bar and toolbar act on (the focused side in split view). */
  get focusedTab() {
    return this.activeTab;
  }

  navigate(url) {
    const tab = this.activeTab;
    if (tab) {
      tab.pending = null;
      tab.view.webContents.loadURL(url).catch(() => {});
    } else this.newTab(url);
  }

  focusAddress() {
    this.win.webContents.focus();
    this.win.webContents.send("shell:focusAddress");
  }

  /* ------------------------------------------------------------ state */

  changed() {
    this.sendState();
    this.saveSession();
    this.notifyPanel();
    hooks.onStateChanged(this);
  }

  sendState() {
    if (this.win.isDestroyed() || !this.ready) return;
    const lib = this.profile.library;
    const mutedSites = new Set(lib.getSetting("mutedSites", []));
    const tabs = this.order.map((id) => {
      const t = this.tabs.get(id);
      const wc = t.view.webContents;
      const url = t.pending?.url ?? wc.getURL();
      return {
        id,
        title: wc.getTitle() || t.placeholderTitle || (url && !url.startsWith("about:") ? url : "New tab"),
        url,
        favicon: t.favicon,
        loading: !t.pending && wc.isLoading(),
        pinned: t.pinned,
        groupId: t.groupId,
        splitId: t.splitId,
        audible: wc.isCurrentlyAudible(),
        muted: wc.isAudioMuted() || mutedSites.has(hostOf(url)),
        crashed: t.crashed,
      };
    });
    const t = this.activeTab;
    const wc = t?.view.webContents;
    const url = t ? t.pending?.url ?? wc.getURL() : "";
    const meta = this.profile.meta;
    const favorites = lib.bookmarks().filter((b) => b.favorite);
    this.win.webContents.send("shell:state", {
      profile: { id: meta.id, name: meta.name, color: meta.color, initial: (meta.name || "?").trim().charAt(0).toUpperCase(), count: require("./profiles").list().length },
      tabs,
      groups: [...this.groups.values()].map((g) => ({ ...g, hex: GROUP_COLORS[g.color] ?? GROUP_COLORS.grey, saved: lib.isGroupSaved(g.id) })),
      splits: [...this.splits.values()],
      activeId: this.activeId,
      nav: {
        url,
        canGoBack: Boolean(wc && !t.pending && wc.navigationHistory.canGoBack()),
        canGoForward: Boolean(wc && !t.pending && wc.navigationHistory.canGoForward()),
        loading: Boolean(wc && !t.pending && wc.isLoading()),
        risk: t?.risk ?? null,
        bookmarked: lib.isBookmarked(url),
        reading: lib.inReadingList(url),
      },
      vertical: this.vertical,
      sidebarCollapsed: this.sidebarCollapsed,
      panelOpen: Boolean(this.panel?.open),
      bookmarksBar: this.bookmarksBarVisible
        ? {
            favorites: favorites.slice(0, 40).map((b) => ({ url: b.url, title: b.title, type: b.type })),
            folders: lib.folders().map((f) => ({ id: f.id, name: f.name, count: lib.bookmarks().filter((b) => b.folderId === f.id).length })).filter((f) => f.count),
            savedGroups: lib.savedGroups().map((g) => ({ id: g.id, title: g.title, color: g.color, hex: GROUP_COLORS[g.color] ?? GROUP_COLORS.grey, open: this.groups.has(g.id) })),
            total: lib.bookmarks().length,
          }
        : null,
      home: SOLANA_OS_URL,
      platform: process.platform,
      partition: this.profile.partition,
      hiddenExtensions: lib.getSetting("hiddenExtensions", []),
      layout: this.lastLayout ?? this.computeLayout(),
    });
    const title = wc?.getTitle() || t?.placeholderTitle;
    this.win.setTitle(title ? `${title} — STRATA` : "STRATA");
  }

  /* ------------------------------------------------------------ session restore */

  snapshot() {
    const b = this.win.getNormalBounds?.() ?? this.win.getBounds();
    return {
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      maximized: this.win.isMaximized(),
      active: this.order.indexOf(this.activeId),
      tabs: this.order
        .map((id) => {
          const t = this.tabs.get(id);
          const wc = t.view.webContents;
          const url = t.pending?.url ?? wc.getURL();
          return { url, title: wc.getTitle() || t.placeholderTitle || "", pinned: t.pinned, groupId: t.groupId, splitId: t.splitId, favicon: typeof t.favicon === "string" && t.favicon.length < 2048 ? t.favicon : null };
        })
        .filter((x) => /^https?:/.test(x.url)),
      groups: [...this.groups.values()],
      splits: [...this.splits.values()].map((s) => ({ id: s.id, ratio: s.ratio, left: this.order.indexOf(s.left), right: this.order.indexOf(s.right) })),
    };
  }

  /** Save this profile's open windows (debounced by the library). */
  saveSession({ closing = false } = {}) {
    if (!this.ready || quitting) return;
    const others = shellsOf(this.profile.id).filter((s) => s !== this && s.ready);
    // Closing one of several windows drops it from the session; closing the last keeps it (restored next time).
    const keep = closing && others.length ? others : [...others, this];
    this.profile.library.setSession({ savedAt: Date.now(), windows: keep.map((s) => s.snapshot()) });
    if (closing) this.profile.library.flushSession();
  }

  restoreFrom(w) {
    for (const g of w.groups ?? []) this.groups.set(g.id, { id: g.id, title: g.title ?? "", color: GROUP_COLORS[g.color] ? g.color : "grey", collapsed: Boolean(g.collapsed) });
    const ids = [];
    const activeIndex = Math.max(0, Math.min((w.tabs?.length ?? 1) - 1, w.active ?? 0));
    (w.tabs ?? []).forEach((t, i) => {
      const wc = this.newTab(t.url, { background: true, lazy: i !== activeIndex, pinned: t.pinned, groupId: t.groupId, title: t.title, favicon: t.favicon, index: i });
      ids.push(wc.id);
    });
    for (const s of w.splits ?? []) {
      const l = ids[s.left];
      const r = ids[s.right];
      if (l && r) {
        const id = `s-${newId()}`;
        this.splits.set(id, { id, left: l, right: r, ratio: s.ratio ?? 0.5, focus: r });
        this.tabs.get(l).splitId = id;
        this.tabs.get(r).splitId = id;
      }
    }
    this.pruneGroups();
    this.selectTab(ids[activeIndex] ?? ids[0]);
  }
}

/* ------------------------------------------------------------ helpers */

function loadInto(wc, url, entries, index) {
  if (Array.isArray(entries) && entries.length && typeof wc.navigationHistory.restore === "function") {
    wc.navigationHistory.restore({ index: Math.max(0, Math.min(entries.length - 1, index ?? entries.length - 1)), entries }).catch(() => wc.loadURL(url).catch(() => {}));
  } else if (url) wc.loadURL(url).catch(() => {});
}

function isSiteMuted(profile, url) {
  const host = hostOf(url);
  return Boolean(host && profile.library.getSetting("mutedSites", []).includes(host));
}

/** Page events. Handlers look up the tab's current window, since tabs can move. */
function wireTab(tab) {
  const wc = tab.view.webContents;
  const owner = () => shellOfTab(wc.id);
  const push = () => owner()?.sendState();
  wc.setWindowOpenHandler(({ url, disposition }) => {
    if (url.startsWith("chrome-extension://")) return { action: "allow" };
    const s = owner();
    if (!s) return { action: "deny" };
    if (disposition === "new-window") new BrowserShell(s.profile.id, { url });
    else s.newTab(url, { background: disposition === "background-tab", openerId: wc.id });
    return { action: "deny" };
  });
  for (const ev of ["did-start-loading", "did-stop-loading", "did-navigate-in-page", "audio-state-changed"]) wc.on(ev, push);
  wc.on("page-title-updated", (_e, title) => {
    const s = owner();
    if (!s) return;
    tab.placeholderTitle = null;
    s.profile.library.addHistory(wc.getURL(), title);
    s.sendState();
    if (s.activeId === wc.id) s.notifyPanel();
  });
  wc.on("page-favicon-updated", (_e, favicons) => {
    tab.favicon = favicons[0] ?? null;
    push();
  });
  wc.on("did-navigate", async (_e, navUrl) => {
    const s = owner();
    if (!s) return;
    s.profile.library.addHistory(navUrl, wc.getTitle());
    wc.setAudioMuted(isSiteMuted(s.profile, navUrl));
    tab.risk = null;
    tab.favicon = null;
    s.changed();
    const risk = await checkSite(navUrl);
    if (hostOf(wc.getURL()) === hostOf(navUrl)) {
      tab.risk = risk;
      owner()?.sendState();
    }
  });
  wc.on("focus", () => {
    const s = owner();
    if (!s || !tab.splitId) return;
    const sp = s.splits.get(tab.splitId);
    if (sp && sp.focus !== wc.id) {
      sp.focus = wc.id;
      s.activeId = wc.id;
      s.changed();
      s.layout();
    }
  });
  wc.on("render-process-gone", () => {
    tab.crashed = true;
    push();
  });
  wc.on("context-menu", (_e, params) => {
    const s = owner();
    if (s) hooks.pageContextMenu(s, wc, params);
  });
  wc.on("before-input-event", (e, input) => {
    const s = owner();
    if (s) hooks.handleShortcut(s, e, input);
  });
  // Google blocks sign-in inside embedded browsers: do it in the system browser.
  wc.on("will-navigate", (e, url) => {
    if (hooks.isGoogleSignIn(url)) {
      e.preventDefault();
      shell.openExternal(`${SOLANA_OS_URL}/api/auth/google?desktop=1`);
    }
  });
}

/** On quit, save every open window of every profile (before they close one by one). */
function saveAllSessions() {
  quitting = true;
  const byProfile = new Map();
  for (const s of shells) {
    if (!s.ready || s.win.isDestroyed()) continue;
    if (!byProfile.has(s.profile.id)) byProfile.set(s.profile.id, []);
    byProfile.get(s.profile.id).push(s);
  }
  for (const list of byProfile.values()) {
    const lib = list[0].profile.library;
    lib.setSession({ savedAt: Date.now(), windows: list.map((s) => s.snapshot()) });
    lib.flushSession();
    lib.flush();
  }
}

appearance.onChange(() => {
  for (const s of shells) if (!s.win.isDestroyed()) s.applyChrome();
});

module.exports = { saveAllSessions, BrowserShell, shells, shellFor, shellOfTab, shellsOf, focusedShell, setHooks, GROUP_COLORS, TABSTRIP_H, NAVBAR_H };
