// Bookmarks, history and settings: pure data functions (persistence lives in storage.ts).
//
// Bookmarks and settings use the same format as the desktop app and sync
// through the same account scope, so a bookmark starred on the computer shows
// up on the phone and vice versa. History stays on the device.

export interface BookmarkRecord {
  title: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}
export type BookmarkMap = Record<string, BookmarkRecord>;

export interface HistoryItem {
  url: string;
  title: string;
  at: number;
}

export interface Library {
  bookmarks: BookmarkMap;
  history: HistoryItem[];
  settings: Record<string, unknown>;
  settingsUpdatedAt: number;
  lastSync: number | null;
}

export const EMPTY_LIBRARY: Library = { bookmarks: {}, history: [], settings: {}, settingsUpdatedAt: 0, lastSync: null };
export const MAX_HISTORY = 2000;

/** For each URL the most recently changed record wins, so deletions (tombstones) sync too. */
export function mergeBookmarks(local: BookmarkMap = {}, remote: BookmarkMap = {}): BookmarkMap {
  const out: BookmarkMap = { ...local };
  for (const [url, r] of Object.entries(remote)) {
    if (!r || typeof r !== "object") continue;
    const l = out[url];
    if (!l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0)) out[url] = r;
  }
  return out;
}

export function bookmarkList(lib: Library): { url: string; title: string; createdAt: number }[] {
  return Object.entries(lib.bookmarks)
    .filter(([, b]) => !b.deleted)
    .map(([url, b]) => ({ url, title: b.title, createdAt: b.createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function isBookmarked(lib: Library, url: string): boolean {
  const b = lib.bookmarks[url];
  return Boolean(b && !b.deleted);
}

export function toggleBookmark(lib: Library, url: string, title: string, now = Date.now()): Library {
  const cur = lib.bookmarks[url];
  const next = cur && !cur.deleted ? { ...cur, deleted: true, updatedAt: now } : { title: title || url, createdAt: now, updatedAt: now };
  return { ...lib, bookmarks: { ...lib.bookmarks, [url]: next } };
}

export function addHistory(lib: Library, url: string, title: string, now = Date.now()): Library {
  if (!/^https?:/.test(url)) return lib;
  const history = lib.history.slice();
  const last = history[history.length - 1];
  if (last && last.url === url) history[history.length - 1] = { url, title: title || last.title, at: now };
  else history.push({ url, title: title || url, at: now });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  return { ...lib, history };
}

export function recentHistory(lib: Library, n = 50): HistoryItem[] {
  const seen = new Set<string>();
  const out: HistoryItem[] = [];
  for (let i = lib.history.length - 1; i >= 0 && out.length < n; i--) {
    const h = lib.history[i];
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    out.push(h);
  }
  return out;
}

/** Apply the account's copy: merge bookmarks, take the newer settings. Returns the new library and the body to upload. */
export function applyRemote(lib: Library, remote: unknown): { lib: Library; upload: { bookmarks: BookmarkMap; settings: Record<string, unknown>; settingsUpdatedAt: number } } {
  const r = (remote && typeof remote === "object" ? remote : {}) as Partial<Library>;
  let next: Library = { ...lib, bookmarks: mergeBookmarks(lib.bookmarks, r.bookmarks ?? {}) };
  if ((r.settingsUpdatedAt ?? 0) > lib.settingsUpdatedAt) next = { ...next, settings: r.settings ?? {}, settingsUpdatedAt: r.settingsUpdatedAt ?? 0 };
  return { lib: next, upload: { bookmarks: next.bookmarks, settings: next.settings, settingsUpdatedAt: next.settingsUpdatedAt } };
}
