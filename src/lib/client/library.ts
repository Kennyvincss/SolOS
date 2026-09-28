"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Bookmark, BookmarkFolder, HistoryEntry, PageType, ReadingItem } from "@/lib/library/types";
import { DEFAULT_FOLDERS, folderForType } from "@/lib/library/types";
import { classifyUrl } from "@/lib/library/classify";
import { useStoreApi, type UserState, type WebLibrary } from "./store";

/**
 * Bookmarks, history and the reading list.
 *
 * In the STRATA desktop app these come from the browser itself (per profile,
 * through window.solanaOSDesktop). On the website they're kept in the user
 * store (bookmarks, folders, reading list: synced to the account) and in
 * localStorage (history: this device only, like a browser).
 */

type DesktopLibrary = { library: (area: string, action: string, args?: Record<string, unknown>) => Promise<unknown>; version?: number };

function desktopBridge(): DesktopLibrary | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { solanaOSDesktop?: DesktopLibrary }).solanaOSDesktop;
  return b && typeof b.library === "function" ? b : null;
}

export function inDesktopApp(): boolean {
  return desktopBridge() !== null;
}

const EVENT = "strata:library";
const changed = () => typeof window !== "undefined" && window.dispatchEvent(new Event(EVENT));
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const home = () => (typeof window === "undefined" ? "https://strata.local" : window.location.origin);

export interface LibraryApi {
  kind: "desktop" | "web";
  bookmarks(): Promise<{ bookmarks: Bookmark[]; folders: BookmarkFolder[] }>;
  addBookmark(b: { url: string; title: string; folderId?: string | null; favorite?: boolean }): Promise<unknown>;
  updateBookmark(url: string, patch: { title?: string; folderId?: string | null; favorite?: boolean; newUrl?: string }): Promise<unknown>;
  removeBookmark(url: string): Promise<unknown>;
  moveBookmark(url: string, folderId: string | null, beforeUrl?: string): Promise<unknown>;
  createFolder(name: string): Promise<BookmarkFolder | null>;
  renameFolder(id: string, name: string): Promise<unknown>;
  moveFolder(id: string, beforeId?: string): Promise<unknown>;
  removeFolder(id: string): Promise<unknown>;
  history(q?: { query?: string; type?: string; before?: number; limit?: number }): Promise<HistoryEntry[]>;
  removeHistory(id: string): Promise<unknown>;
  clearHistory(since?: number): Promise<unknown>;
  record(type: "search" | "ai", text: string, url?: string): Promise<unknown>;
  readingList(): Promise<ReadingItem[]>;
  addToReadingList(url: string, title: string): Promise<unknown>;
  setRead(url: string, read: boolean): Promise<unknown>;
  removeFromReadingList(url: string): Promise<unknown>;
  open(url: string, where?: "current" | "tab" | "window" | "split"): void;
}

/* ------------------------------------------------------------ desktop */

function desktopApi(b: DesktopLibrary): LibraryApi {
  const call = async <T,>(area: string, action: string, args?: Record<string, unknown>) => {
    const r = (await b.library(area, action, args)) as T;
    if (!["list", "isBookmarked"].includes(action)) changed();
    return r;
  };
  return {
    kind: "desktop",
    bookmarks: () => call("bookmarks", "list"),
    addBookmark: (x) => call("bookmarks", "add", x),
    updateBookmark: (url, patch) => call("bookmarks", "update", { url, ...patch }),
    removeBookmark: (url) => call("bookmarks", "remove", { url }),
    moveBookmark: (url, folderId, beforeUrl) => call("bookmarks", "move", { url, folderId, beforeUrl }),
    createFolder: (name) => call("bookmarks", "createFolder", { name }),
    renameFolder: (id, name) => call("bookmarks", "renameFolder", { id, name }),
    moveFolder: (id, beforeId) => call("bookmarks", "moveFolder", { id, beforeId }),
    removeFolder: (id) => call("bookmarks", "removeFolder", { id }),
    history: (q) => call("history", "list", q ?? {}),
    removeHistory: (id) => call("history", "remove", { id }),
    clearHistory: (since) => call("history", "clear", { since }),
    record: (type, text, url) => call("history", "record", { type, text, url }),
    readingList: () => call("reading", "list"),
    addToReadingList: (url, title) => call("reading", "add", { url, title }),
    setRead: (url, read) => call("reading", "setRead", { url, read }),
    removeFromReadingList: (url) => call("reading", "remove", { url }),
    open: (url, where = "current") => void call("open", where, { url }),
  };
}

/* ------------------------------------------------------------ website */

const HISTORY_KEY = "strata:history:v1";
const MAX_HISTORY = 1500;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}
function saveHistory(h: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
  } catch {
    /* storage full */
  }
  changed();
}

/** Record a page visit on the website (the desktop app records its own). */
export function recordVisit(url: string, title: string) {
  if (inDesktopApp()) return;
  const h = loadHistory();
  const last = h[h.length - 1];
  const now = Date.now();
  if (last && last.url === url && !last.query && now - last.at < 30 * 60 * 1000) {
    last.title = title || last.title;
    last.at = now;
  } else h.push({ id: newId(), url, title: (title || url).slice(0, 300), type: classifyUrl(url, home()), at: now });
  saveHistory(h);
}

function emptyLibrary(): WebLibrary {
  const folders: WebLibrary["folders"] = {};
  for (const f of DEFAULT_FOLDERS) folders[f.id] = { name: f.name, order: f.order, updatedAt: 0 };
  return { bookmarks: {}, folders, readingList: {} };
}

function webApi(store: { get: () => UserState; set: (fn: (s: UserState) => UserState) => void }): LibraryApi {
  const lib = () => store.get().webLibrary ?? emptyLibrary();
  const update = (fn: (l: WebLibrary) => WebLibrary) => {
    store.set((s) => ({ ...s, webLibrary: fn(structuredClone(s.webLibrary ?? emptyLibrary())) }));
    changed();
  };
  const liveBookmarks = (l: WebLibrary): Bookmark[] =>
    Object.entries(l.bookmarks)
      .filter(([, b]) => !b.deleted)
      .map(([url, b]) => ({ id: b.id, url, title: b.title, type: (b.type as PageType) ?? "website", folderId: b.folderId, favorite: b.favorite, order: b.order, createdAt: b.createdAt, updatedAt: b.updatedAt }))
      .sort((a, b) => a.order - b.order);
  const liveFolders = (l: WebLibrary): BookmarkFolder[] =>
    Object.entries(l.folders)
      .filter(([, f]) => !f.deleted)
      .map(([id, f]) => ({ id, name: f.name, order: f.order }))
      .sort((a, b) => a.order - b.order);
  const orderBefore = (list: { order: number }[], idx: number) => (idx === -1 ? (list.at(-1)?.order ?? Date.now()) + 1 : idx === 0 ? list[0].order - 1 : (list[idx - 1].order + list[idx].order) / 2);

  return {
    kind: "web",
    bookmarks: async () => ({ bookmarks: liveBookmarks(lib()), folders: liveFolders(lib()) }),
    addBookmark: async ({ url, title, folderId, favorite }) => {
      if (!/^https?:/.test(url)) return null;
      const type = classifyUrl(url, home());
      update((l) => {
        const cur = l.bookmarks[url] && !l.bookmarks[url].deleted ? l.bookmarks[url] : null;
        const suggested = folderForType(type);
        const now = Date.now();
        l.bookmarks[url] = {
          id: cur?.id ?? newId(),
          title: (title || cur?.title || url).slice(0, 300),
          type,
          folderId: folderId !== undefined ? folderId : cur ? cur.folderId : suggested && l.folders[suggested] && !l.folders[suggested].deleted ? suggested : null,
          favorite: favorite ?? cur?.favorite ?? false,
          order: cur?.order ?? now,
          createdAt: cur?.createdAt ?? now,
          updatedAt: now,
        };
        return l;
      });
      return true;
    },
    updateBookmark: async (url, patch) =>
      update((l) => {
        const b = l.bookmarks[url];
        if (!b || b.deleted) return l;
        const now = Date.now();
        const next = { ...b, updatedAt: now, ...(patch.title !== undefined ? { title: patch.title.slice(0, 300) } : {}), ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}), ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}) };
        if (patch.newUrl && patch.newUrl !== url && /^https?:/.test(patch.newUrl)) {
          l.bookmarks[url] = { ...b, deleted: true, updatedAt: now };
          l.bookmarks[patch.newUrl] = { ...next, type: classifyUrl(patch.newUrl, home()) };
        } else l.bookmarks[url] = next;
        return l;
      }),
    removeBookmark: async (url) =>
      update((l) => {
        if (l.bookmarks[url]) l.bookmarks[url] = { ...l.bookmarks[url], deleted: true, updatedAt: Date.now() };
        return l;
      }),
    moveBookmark: async (url, folderId, beforeUrl) =>
      update((l) => {
        const b = l.bookmarks[url];
        if (!b || b.deleted) return l;
        const siblings = liveBookmarks(l).filter((x) => x.folderId === folderId && x.url !== url);
        l.bookmarks[url] = { ...b, folderId, order: orderBefore(siblings, beforeUrl ? siblings.findIndex((x) => x.url === beforeUrl) : -1), updatedAt: Date.now() };
        return l;
      }),
    createFolder: async (name) => {
      const id = `f-${newId().slice(0, 8)}`;
      let created: BookmarkFolder | null = null;
      update((l) => {
        const order = (liveFolders(l).at(-1)?.order ?? 0) + 1;
        l.folders[id] = { name: (name || "New folder").slice(0, 80), order, updatedAt: Date.now() };
        created = { id, name: l.folders[id].name, order };
        return l;
      });
      return created;
    },
    renameFolder: async (id, name) =>
      update((l) => {
        if (l.folders[id]) l.folders[id] = { ...l.folders[id], name: name.slice(0, 80), updatedAt: Date.now() };
        return l;
      }),
    moveFolder: async (id, beforeId) =>
      update((l) => {
        const list = liveFolders(l).filter((f) => f.id !== id);
        if (l.folders[id]) l.folders[id] = { ...l.folders[id], order: orderBefore(list, beforeId ? list.findIndex((f) => f.id === beforeId) : -1), updatedAt: Date.now() };
        return l;
      }),
    removeFolder: async (id) =>
      update((l) => {
        const now = Date.now();
        if (l.folders[id]) l.folders[id] = { ...l.folders[id], deleted: true, updatedAt: now };
        for (const [url, b] of Object.entries(l.bookmarks)) if (!b.deleted && b.folderId === id) l.bookmarks[url] = { ...b, folderId: null, updatedAt: now };
        return l;
      }),
    history: async ({ query = "", type = "", before = Infinity, limit = 200 } = {}) => {
      const q = query.toLowerCase().trim();
      const out: HistoryEntry[] = [];
      const h = loadHistory();
      for (let i = h.length - 1; i >= 0 && out.length < limit; i--) {
        const e = h[i];
        if (e.at >= before) continue;
        if (type && (type === "wallet-activity" ? !["wallet", "transaction"].includes(e.type) : e.type !== type)) continue;
        if (q && !`${e.title} ${e.url} ${e.query ?? ""}`.toLowerCase().includes(q)) continue;
        out.push(e);
      }
      return out;
    },
    removeHistory: async (id) => saveHistory(loadHistory().filter((e) => e.id !== id)),
    clearHistory: async (since) => saveHistory(since ? loadHistory().filter((e) => e.at < since) : []),
    record: async (type, text, url) => {
      const h = loadHistory();
      h.push({ id: newId(), url: url ?? `${home()}/${type === "ai" ? "ai" : "search"}?q=${encodeURIComponent(text)}`, title: text.slice(0, 300), type, query: text.slice(0, 300), at: Date.now() });
      saveHistory(h);
    },
    readingList: async () =>
      Object.entries(lib().readingList)
        .filter(([, r]) => !r.deleted)
        .map(([url, r]) => ({ id: r.id, url, title: r.title, type: r.type as PageType | undefined, read: r.read, addedAt: r.addedAt }))
        .sort((a, b) => b.addedAt - a.addedAt),
    addToReadingList: async (url, title) =>
      update((l) => {
        const cur = l.readingList[url];
        const now = Date.now();
        l.readingList[url] = { id: cur?.id ?? newId(), title: (title || url).slice(0, 300), type: classifyUrl(url, home()), read: false, addedAt: cur && !cur.deleted ? cur.addedAt : now, updatedAt: now };
        return l;
      }),
    setRead: async (url, read) =>
      update((l) => {
        if (l.readingList[url]) l.readingList[url] = { ...l.readingList[url], read, updatedAt: Date.now() };
        return l;
      }),
    removeFromReadingList: async (url) =>
      update((l) => {
        if (l.readingList[url]) l.readingList[url] = { ...l.readingList[url], deleted: true, updatedAt: Date.now() };
        return l;
      }),
    open: (url, where = "current") => {
      if (where === "tab" || where === "window") window.open(url, "_blank", "noopener");
      else window.location.assign(url);
    },
  };
}

/* ------------------------------------------------------------ hooks */

/** The library API for this session (desktop profile or website). */
export function useLibrary(): LibraryApi {
  const store = useStoreApi();
  const [desktop, setDesktop] = useState<DesktopLibrary | null>(null);
  useEffect(() => setDesktop(desktopBridge()), []);
  return useMemo(() => (desktop ? desktopApi(desktop) : webApi(store)), [desktop, store]);
}

/** Load something from the library and reload it when the library changes or the window regains focus. */
export function useLibraryData<T>(load: (api: LibraryApi) => Promise<T>, deps: unknown[] = []): { data: T | null; reload: () => void; api: LibraryApi } {
  const api = useLibrary();
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    load(api).then(setData, () => setData(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ...deps]);
  useEffect(() => {
    reload();
    const on = () => reload();
    window.addEventListener(EVENT, on);
    window.addEventListener("focus", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("focus", on);
      window.removeEventListener("storage", on);
    };
  }, [reload]);
  return { data, reload, api };
}
