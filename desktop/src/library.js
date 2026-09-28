// Bookmarks, history, reading list, saved tab groups, settings and account sync.
// SPDX-License-Identifier: GPL-3.0-only
//
// One library per profile, stored in that profile's data folder. When the
// profile is signed in to STRATA (in any tab), bookmarks, folders, the reading
// list, saved groups and settings sync to the account through
// ${SOLANA_OS_URL}/api/sync/desktop, so they follow you to other computers.
// History and passwords stay on this device.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { mergeRecords, classifyUrl, DEFAULT_FOLDERS, folderForType, SOLANA_OS_URL } = require("./lib");

const MAX_HISTORY = 10000;
const newId = () => crypto.randomUUID();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

/**
 * @param {string} dir  folder for library.json and session.json
 * @param {{ appHosts?: () => Set<string> }} opts
 */
function createLibrary(dir, opts = {}) {
  const file = path.join(dir, "library.json");
  const sessionFile = path.join(dir, "session.json");
  const appHosts = opts.appHosts ?? (() => new Set());
  const typeOf = (url) => classifyUrl(url, SOLANA_OS_URL, appHosts());

  let data = null;
  function load() {
    if (data) return data;
    const d = readJson(file, {});
    data = {
      bookmarks: d.bookmarks ?? {},
      folders: d.folders ?? {},
      history: Array.isArray(d.history) ? d.history : [],
      readingList: d.readingList ?? {},
      savedGroups: d.savedGroups ?? {},
      settings: d.settings ?? {},
      settingsUpdatedAt: d.settingsUpdatedAt ?? 0,
      lastSync: d.lastSync ?? null,
    };
    // Upgrade older bookmarks (url -> { title, createdAt }) and add the default folders once.
    for (const [url, b] of Object.entries(data.bookmarks)) {
      if (!b.id) b.id = newId();
      if (!b.type) b.type = typeOf(url);
      if (b.folderId === undefined) b.folderId = null;
    }
    if (!Object.keys(data.folders).length) {
      const now = Date.now();
      DEFAULT_FOLDERS.forEach((f, i) => (data.folders[f.id] = { name: f.name, order: i, createdAt: now, updatedAt: 0 }));
    }
    for (const h of data.history) {
      if (!h.id) h.id = newId();
      if (!h.type) h.type = typeOf(h.url);
    }
    return data;
  }

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeJsonAtomic(file, data), 300);
  }
  function flush() {
    if (!data) return;
    clearTimeout(saveTimer);
    writeJsonAtomic(file, data);
  }

  const listeners = new Set();
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function changed(what, { sync = true } = {}) {
    persist();
    for (const l of listeners) l(what);
    if (sync) scheduleSync();
  }

  /* ------------------------------------------------------------ bookmarks */

  const liveBookmark = (url) => {
    const b = load().bookmarks[url];
    return b && !b.deleted ? b : null;
  };

  function bookmarks() {
    return Object.entries(load().bookmarks)
      .filter(([, b]) => !b.deleted)
      .map(([url, b]) => ({ id: b.id, url, title: b.title, type: b.type ?? "website", folderId: b.folderId ?? null, favorite: Boolean(b.favorite), order: b.order ?? b.createdAt, createdAt: b.createdAt, updatedAt: b.updatedAt }))
      .sort((a, b) => a.order - b.order);
  }

  function isBookmarked(url) {
    return Boolean(liveBookmark(url));
  }

  function getBookmark(url) {
    const b = liveBookmark(url);
    return b ? { url, ...b } : null;
  }

  function addBookmark({ url, title, type, folderId, favorite }) {
    if (!/^https?:/.test(url)) return null;
    const d = load();
    const now = Date.now();
    const t = type ?? typeOf(url);
    const existing = liveBookmark(url);
    const suggested = folderForType(t);
    const folder = folderId !== undefined ? folderId : existing ? existing.folderId : suggested && d.folders[suggested] && !d.folders[suggested].deleted ? suggested : null;
    d.bookmarks[url] = {
      ...(existing ?? {}),
      id: existing?.id ?? newId(),
      title: (title || existing?.title || url).slice(0, 300),
      type: t,
      folderId: folder,
      favorite: favorite ?? existing?.favorite ?? false,
      order: existing?.order ?? now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deleted: false,
    };
    changed("bookmarks");
    return getBookmark(url);
  }

  function updateBookmark(url, patch) {
    const b = liveBookmark(url);
    if (!b) return null;
    const next = { ...b, updatedAt: Date.now() };
    if (typeof patch.title === "string") next.title = patch.title.slice(0, 300);
    if (patch.folderId !== undefined) next.folderId = patch.folderId && load().folders[patch.folderId] ? patch.folderId : null;
    if (typeof patch.favorite === "boolean") next.favorite = patch.favorite;
    if (typeof patch.order === "number") next.order = patch.order;
    if (typeof patch.type === "string") next.type = patch.type;
    // Changing the URL moves the record.
    if (typeof patch.url === "string" && patch.url !== url && /^https?:/.test(patch.url)) {
      load().bookmarks[url] = { ...b, deleted: true, updatedAt: next.updatedAt };
      load().bookmarks[patch.url] = next;
      changed("bookmarks");
      return getBookmark(patch.url);
    }
    load().bookmarks[url] = next;
    changed("bookmarks");
    return getBookmark(url);
  }

  function removeBookmark(url) {
    const b = liveBookmark(url);
    if (!b) return false;
    load().bookmarks[url] = { ...b, deleted: true, updatedAt: Date.now() };
    changed("bookmarks");
    return true;
  }

  function toggleBookmark(url, title) {
    if (isBookmarked(url)) removeBookmark(url);
    else addBookmark({ url, title });
    return isBookmarked(url);
  }

  /** Put a bookmark in a folder, before another bookmark (or at the end). */
  function moveBookmark(url, folderId, beforeUrl) {
    const b = liveBookmark(url);
    if (!b) return false;
    const siblings = bookmarks().filter((x) => x.folderId === (folderId ?? null) && x.url !== url);
    const idx = beforeUrl ? siblings.findIndex((x) => x.url === beforeUrl) : -1;
    let order;
    if (idx === -1) order = (siblings.at(-1)?.order ?? Date.now()) + 1;
    else order = idx === 0 ? siblings[0].order - 1 : (siblings[idx - 1].order + siblings[idx].order) / 2;
    return Boolean(updateBookmark(url, { folderId: folderId ?? null, order }));
  }

  function folders() {
    return Object.entries(load().folders)
      .filter(([, f]) => !f.deleted)
      .map(([id, f]) => ({ id, name: f.name, order: f.order ?? 0 }))
      .sort((a, b) => a.order - b.order);
  }

  function createFolder(name) {
    const id = `f-${newId().slice(0, 8)}`;
    const order = (folders().at(-1)?.order ?? 0) + 1;
    load().folders[id] = { name: String(name || "New folder").slice(0, 80), order, createdAt: Date.now(), updatedAt: Date.now() };
    changed("bookmarks");
    return { id, name: load().folders[id].name, order };
  }

  function renameFolder(id, name) {
    const f = load().folders[id];
    if (!f || f.deleted) return false;
    load().folders[id] = { ...f, name: String(name || f.name).slice(0, 80), updatedAt: Date.now() };
    changed("bookmarks");
    return true;
  }

  function moveFolder(id, beforeId) {
    const list = folders().filter((f) => f.id !== id);
    const idx = beforeId ? list.findIndex((f) => f.id === beforeId) : -1;
    const f = load().folders[id];
    if (!f) return false;
    const order = idx === -1 ? (list.at(-1)?.order ?? 0) + 1 : idx === 0 ? list[0].order - 1 : (list[idx - 1].order + list[idx].order) / 2;
    load().folders[id] = { ...f, order, updatedAt: Date.now() };
    changed("bookmarks");
    return true;
  }

  /** Deleting a folder keeps its bookmarks (they move to "Other bookmarks"). */
  function removeFolder(id) {
    const f = load().folders[id];
    if (!f || f.deleted) return false;
    const now = Date.now();
    load().folders[id] = { ...f, deleted: true, updatedAt: now };
    for (const [url, b] of Object.entries(load().bookmarks)) if (!b.deleted && b.folderId === id) load().bookmarks[url] = { ...b, folderId: null, updatedAt: now };
    changed("bookmarks");
    return true;
  }

  /* ------------------------------------------------------------ history */

  function addHistory(url, title, extra = {}) {
    if (!/^https?:/.test(url)) return;
    const d = load();
    const last = d.history[d.history.length - 1];
    const now = Date.now();
    if (last && last.url === url && !last.query && now - last.at < 30 * 60 * 1000) {
      last.title = (title || last.title).slice(0, 300);
      last.at = now;
    } else {
      d.history.push({ id: newId(), url, title: (title || url).slice(0, 300), type: extra.type ?? typeOf(url), at: now });
      if (d.history.length > MAX_HISTORY) d.history.splice(0, d.history.length - MAX_HISTORY);
    }
    changed("history", { sync: false });
  }

  /** A search or AI question typed by the user (shown in history with its own icon). */
  function addActivity(type, text, url) {
    if (!text) return;
    const d = load();
    d.history.push({ id: newId(), url: url || SOLANA_OS_URL, title: String(text).slice(0, 300), type, query: String(text).slice(0, 300), at: Date.now() });
    if (d.history.length > MAX_HISTORY) d.history.splice(0, d.history.length - MAX_HISTORY);
    changed("history", { sync: false });
  }

  function historyList({ query = "", type = "", before = Infinity, limit = 200 } = {}) {
    const q = String(query).toLowerCase().trim();
    const out = [];
    const h = load().history;
    for (let i = h.length - 1; i >= 0 && out.length < limit; i--) {
      const e = h[i];
      if (e.at >= before) continue;
      if (type && (type === "wallet-activity" ? !["wallet", "transaction"].includes(e.type) : e.type !== type)) continue;
      if (q && !`${e.title} ${e.url} ${e.query ?? ""}`.toLowerCase().includes(q)) continue;
      out.push(e);
    }
    return out;
  }

  function recentHistory(n = 20) {
    const seen = new Set();
    const out = [];
    const h = load().history;
    for (let i = h.length - 1; i >= 0 && out.length < n; i--) {
      const e = h[i];
      if (e.type === "search" || e.type === "ai" || seen.has(e.url)) continue;
      seen.add(e.url);
      out.push(e);
    }
    return out;
  }

  function removeHistory(id) {
    const d = load();
    const before = d.history.length;
    d.history = d.history.filter((e) => e.id !== id);
    if (d.history.length !== before) changed("history", { sync: false });
    return d.history.length !== before;
  }

  function clearHistory(sinceMs) {
    const d = load();
    d.history = sinceMs ? d.history.filter((e) => e.at < sinceMs) : [];
    changed("history", { sync: false });
  }

  /* ------------------------------------------------------------ reading list */

  function readingList() {
    return Object.entries(load().readingList)
      .filter(([, r]) => !r.deleted)
      .map(([url, r]) => ({ id: r.id, url, title: r.title, type: r.type, read: Boolean(r.read), addedAt: r.addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
  }

  function inReadingList(url) {
    const r = load().readingList[url];
    return Boolean(r && !r.deleted);
  }

  function addToReadingList(url, title) {
    if (!/^https?:/.test(url)) return false;
    const cur = load().readingList[url];
    const now = Date.now();
    load().readingList[url] = { id: cur?.id ?? newId(), title: (title || url).slice(0, 300), type: typeOf(url), read: false, addedAt: cur && !cur.deleted ? cur.addedAt : now, updatedAt: now, deleted: false };
    changed("readingList");
    return true;
  }

  function setRead(url, read) {
    const cur = load().readingList[url];
    if (!cur || cur.deleted) return false;
    load().readingList[url] = { ...cur, read: Boolean(read), updatedAt: Date.now() };
    changed("readingList");
    return true;
  }

  function removeFromReadingList(url) {
    const cur = load().readingList[url];
    if (!cur || cur.deleted) return false;
    load().readingList[url] = { ...cur, deleted: true, updatedAt: Date.now() };
    changed("readingList");
    return true;
  }

  /* ------------------------------------------------------------ saved tab groups */

  function savedGroups() {
    return Object.entries(load().savedGroups)
      .filter(([, g]) => !g.deleted)
      .map(([id, g]) => ({ id, title: g.title, color: g.color, tabs: g.tabs ?? [], savedAt: g.savedAt }))
      .sort((a, b) => a.savedAt - b.savedAt);
  }

  function saveGroup(id, { title, color, tabs }) {
    const now = Date.now();
    const cur = load().savedGroups[id];
    load().savedGroups[id] = {
      title: String(title ?? "").slice(0, 60),
      color,
      tabs: tabs.slice(0, 50).map((t) => ({ url: t.url, title: String(t.title ?? "").slice(0, 200) })),
      savedAt: cur && !cur.deleted ? cur.savedAt : now,
      updatedAt: now,
      deleted: false,
    };
    changed("savedGroups");
  }

  function forgetGroup(id) {
    const cur = load().savedGroups[id];
    if (!cur || cur.deleted) return;
    load().savedGroups[id] = { ...cur, deleted: true, updatedAt: Date.now() };
    changed("savedGroups");
  }

  function isGroupSaved(id) {
    const g = load().savedGroups[id];
    return Boolean(g && !g.deleted);
  }

  /* ------------------------------------------------------------ settings */

  function getSetting(key, fallback) {
    return key in load().settings ? load().settings[key] : fallback;
  }

  function setSetting(key, value) {
    load().settings[key] = value;
    load().settingsUpdatedAt = Date.now();
    changed("settings");
  }

  /* ------------------------------------------------------------ session (open windows and tabs) */

  function getSession() {
    return readJson(sessionFile, null);
  }
  let sessionTimer = null;
  let pendingSession = null;
  function setSession(value) {
    pendingSession = value;
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(flushSession, 800);
  }
  function flushSession() {
    clearTimeout(sessionTimer);
    if (pendingSession) writeJsonAtomic(sessionFile, pendingSession);
    pendingSession = null;
  }

  /* ------------------------------------------------------------ sync */

  let syncFn = null; // (method, body?) => Promise<Response>, uses the profile session's cookies
  let syncTimer = null;
  let syncState = { status: "off", at: null, error: null };

  function configureSync(fetcher) {
    syncFn = fetcher;
  }

  function scheduleSync() {
    if (!syncFn) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow().catch(() => {}), 1500);
  }

  async function syncNow() {
    if (!syncFn) return syncState;
    const d = load();
    try {
      const res = await syncFn("GET");
      if (res.status === 401) return (syncState = { status: "signed-out", at: null, error: null });
      if (res.status === 501) return (syncState = { status: "unavailable", at: null, error: null });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      const remote = (await res.json()).data ?? {};
      d.bookmarks = mergeRecords(d.bookmarks, remote.bookmarks ?? {});
      d.folders = mergeRecords(d.folders, remote.folders ?? {});
      d.readingList = mergeRecords(d.readingList, remote.readingList ?? {});
      d.savedGroups = mergeRecords(d.savedGroups, remote.savedGroups ?? {});
      if ((remote.settingsUpdatedAt ?? 0) > d.settingsUpdatedAt) {
        d.settings = { ...d.settings, ...(remote.settings ?? {}) };
        d.settingsUpdatedAt = remote.settingsUpdatedAt;
      }
      const put = await syncFn("PUT", { bookmarks: d.bookmarks, folders: d.folders, readingList: d.readingList, savedGroups: d.savedGroups, settings: d.settings, settingsUpdatedAt: d.settingsUpdatedAt });
      if (!put.ok) throw new Error(`Sync failed (${put.status})`);
      d.lastSync = Date.now();
      changed("sync", { sync: false });
      syncState = { status: "ok", at: d.lastSync, error: null };
    } catch (err) {
      syncState = { status: "error", at: d.lastSync, error: String(err?.message ?? err) };
    }
    return syncState;
  }

  return {
    // bookmarks
    bookmarks,
    isBookmarked,
    getBookmark,
    addBookmark,
    updateBookmark,
    removeBookmark,
    toggleBookmark,
    moveBookmark,
    folders,
    createFolder,
    renameFolder,
    moveFolder,
    removeFolder,
    // history
    addHistory,
    addActivity,
    historyList,
    recentHistory,
    removeHistory,
    clearHistory,
    // reading list
    readingList,
    inReadingList,
    addToReadingList,
    setRead,
    removeFromReadingList,
    // saved groups
    savedGroups,
    saveGroup,
    forgetGroup,
    isGroupSaved,
    // settings & session
    getSetting,
    setSetting,
    getSession,
    setSession,
    flushSession,
    flush,
    // sync
    onChange,
    configureSync,
    syncNow,
    scheduleSync,
    getSyncState: () => syncState,
  };
}

module.exports = { createLibrary };
