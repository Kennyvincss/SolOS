// Bookmarks, history and account sync.
// SPDX-License-Identifier: GPL-3.0-only
//
// Stored locally in the user-data folder. When you're signed in to Solana OS
// (in any tab), bookmarks and settings sync to your account through
// ${SOLANA_OS_URL}/api/sync/desktop, so they follow you to other computers.
// History and passwords stay on this device.

const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");
const { mergeBookmarks } = require("./lib");

const MAX_HISTORY = 5000;

function file() {
  return path.join(app.getPath("userData"), "library.json");
}

let data = null;
function load() {
  if (data) return data;
  try {
    const d = JSON.parse(fs.readFileSync(file(), "utf8"));
    data = { bookmarks: d.bookmarks ?? {}, history: d.history ?? [], settings: d.settings ?? {}, settingsUpdatedAt: d.settingsUpdatedAt ?? 0, lastSync: d.lastSync ?? null };
  } catch {
    data = { bookmarks: {}, history: [], settings: {}, settingsUpdatedAt: 0, lastSync: null };
  }
  return data;
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = file() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file());
  }, 300);
}

const listeners = new Set();
function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function changed({ sync = true } = {}) {
  persist();
  for (const l of listeners) l();
  if (sync) scheduleSync();
}

/* ------------------------------------------------------------ bookmarks */

function bookmarks() {
  return Object.entries(load().bookmarks)
    .filter(([, b]) => !b.deleted)
    .map(([url, b]) => ({ url, title: b.title, createdAt: b.createdAt }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function isBookmarked(url) {
  const b = load().bookmarks[url];
  return Boolean(b && !b.deleted);
}

function toggleBookmark(url, title) {
  const d = load();
  const now = Date.now();
  const cur = d.bookmarks[url];
  if (cur && !cur.deleted) d.bookmarks[url] = { ...cur, deleted: true, updatedAt: now };
  else d.bookmarks[url] = { title: title || url, createdAt: now, updatedAt: now };
  changed();
  return isBookmarked(url);
}

/* ------------------------------------------------------------ history */

function addHistory(url, title) {
  if (!/^https?:/.test(url)) return;
  const d = load();
  const last = d.history[d.history.length - 1];
  if (last && last.url === url) {
    last.title = title || last.title;
    last.at = Date.now();
  } else {
    d.history.push({ url, title: title || url, at: Date.now() });
    if (d.history.length > MAX_HISTORY) d.history.splice(0, d.history.length - MAX_HISTORY);
  }
  changed({ sync: false });
}

function recentHistory(n = 20) {
  const seen = new Set();
  const out = [];
  for (let i = load().history.length - 1; i >= 0 && out.length < n; i--) {
    const h = load().history[i];
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out;
}

function clearHistory() {
  load().history = [];
  changed({ sync: false });
}

/* ------------------------------------------------------------ settings */

function getSetting(key, fallback) {
  return key in load().settings ? load().settings[key] : fallback;
}

function setSetting(key, value) {
  load().settings[key] = value;
  load().settingsUpdatedAt = Date.now();
  changed();
}

/* ------------------------------------------------------------ sync */

let syncFn = null; // (method, body?) => Promise<Response>, provided by main (uses the browser session's cookies)
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
    if (res.status === 501) return (syncState = { status: "unavailable", at: null, error: "Sync isn't set up on the Solana OS server yet." });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    const remote = (await res.json()).data ?? {};
    d.bookmarks = mergeBookmarks(d.bookmarks, remote.bookmarks ?? {});
    if ((remote.settingsUpdatedAt ?? 0) > d.settingsUpdatedAt) {
      d.settings = remote.settings ?? {};
      d.settingsUpdatedAt = remote.settingsUpdatedAt;
    }
    const put = await syncFn("PUT", { bookmarks: d.bookmarks, settings: d.settings, settingsUpdatedAt: d.settingsUpdatedAt });
    if (!put.ok) throw new Error(`Sync failed (${put.status})`);
    d.lastSync = Date.now();
    changed({ sync: false });
    syncState = { status: "ok", at: d.lastSync, error: null };
  } catch (err) {
    syncState = { status: "error", at: d.lastSync, error: String(err?.message ?? err) };
  }
  return syncState;
}

function getSyncState() {
  return syncState;
}

module.exports = {
  bookmarks,
  isBookmarked,
  toggleBookmark,
  addHistory,
  recentHistory,
  clearHistory,
  getSetting,
  setSetting,
  onChange,
  configureSync,
  syncNow,
  scheduleSync,
  getSyncState,
};
