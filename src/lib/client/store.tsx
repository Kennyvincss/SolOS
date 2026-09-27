"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

/**
 * User state for Solana OS: watchlist, followed wallets, alerts, installed
 * extensions, favorites, notifications, preferences and profile.
 *
 * Persisted per user (or "guest") through a `StorageAdapter`. The default
 * adapter is localStorage, so browsing works with no account at all. A
 * server-backed adapter can be dropped in without touching the UI.
 */

export type NotificationCategory = "wallet" | "price" | "security" | "extension" | "news" | "portfolio" | "app";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  href?: string;
  category: NotificationCategory;
  at: number;
  read: boolean;
  source?: string;
}

export interface FollowedWallet {
  address: string;
  label: string;
  addedAt: number;
  lastSeenSig?: string;
}

export type AlertKind = "buy" | "sell" | "large_transfer" | "new_token" | "protocol";
export interface WalletAlert {
  id: string;
  address: string;
  kinds: AlertKind[];
  minUsd?: number;
  protocol?: string;
}

export interface PriceAlert {
  id: string;
  mint: string;
  symbol: string;
  direction: "above" | "below";
  price: number;
  triggered?: boolean;
}

export interface InstalledExtension {
  id: string;
  enabled: boolean;
  installedAt: number;
}

export interface Review {
  id: string;
  rating: number;
  text: string;
  author: string;
  at: number;
}

export interface Post {
  id: string;
  text: string;
  author: string;
  at: number;
  likes: number;
  comments: { id: string; text: string; author: string; at: number }[];
}

export interface Submission {
  id: string;
  type: "app" | "extension";
  name: string;
  payload: Record<string, unknown>;
  status: "pending_review";
  at: number;
}

export interface UserState {
  v: 1;
  theme: "dark" | "light" | "system";
  watchlist: string[];
  followed: FollowedWallet[];
  walletAlerts: WalletAlert[];
  priceAlerts: PriceAlert[];
  installed: InstalledExtension[];
  extPrefs: Record<string, Record<string, unknown>>;
  favorites: string[];
  addedApps: string[];
  notifications: AppNotification[];
  notifPrefs: Record<NotificationCategory, boolean>;
  profile: {
    handle: string;
    bio: string;
    joinedAt: number;
    visibility: { wallet: boolean; favorites: boolean; followed: boolean; watchlist: boolean; extensions: boolean; activity: boolean };
  };
  reviews: Record<string, Review[]>;
  posts: Post[];
  liked: string[];
  bookmarks: string[];
  followsEntities: string[];
  submissions: Submission[];
  recentSearches: string[];
  watchAddress?: string;
}

export const DEFAULT_STATE: UserState = {
  v: 1,
  theme: "dark",
  watchlist: ["So11111111111111111111111111111111111111112", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL"],
  followed: [],
  walletAlerts: [],
  priceAlerts: [],
  installed: [
    { id: "solanaos.portfolio-tracker", enabled: true, installedAt: 0 },
    { id: "solanaos.network-monitor", enabled: true, installedAt: 0 },
  ],
  extPrefs: {},
  favorites: [],
  addedApps: [],
  notifications: [],
  notifPrefs: { wallet: true, price: true, security: true, extension: true, news: false, portfolio: true, app: true },
  profile: {
    handle: "",
    bio: "",
    joinedAt: 0,
    visibility: { wallet: false, favorites: true, followed: false, watchlist: false, extensions: true, activity: false },
  },
  reviews: {},
  posts: [],
  liked: [],
  bookmarks: [],
  followsEntities: [],
  submissions: [],
  recentSearches: [],
};

export interface StorageAdapter {
  load(key: string): UserState | null;
  save(key: string, state: UserState): void;
}

export const localStorageAdapter: StorageAdapter = {
  load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as UserState) : null;
    } catch {
      return null;
    }
  },
  save(key, state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* storage full or unavailable */
    }
  },
};

class Store {
  state: UserState = DEFAULT_STATE;
  key = "sos:v1:guest";
  private subs = new Set<() => void>();
  constructor(private adapter: StorageAdapter) {}
  hydrate(uid: string | null) {
    this.key = `sos:v1:${uid ?? "guest"}`;
    const saved = this.adapter.load(this.key);
    this.state = saved ? { ...DEFAULT_STATE, ...saved, profile: { ...DEFAULT_STATE.profile, ...saved.profile } } : { ...DEFAULT_STATE, profile: { ...DEFAULT_STATE.profile, joinedAt: Date.now() } };
    this.emit();
  }
  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
  get = () => this.state;
  set = (fn: (s: UserState) => UserState) => {
    this.state = fn(this.state);
    this.adapter.save(this.key, this.state);
    this.emit();
  };
  private emit() {
    this.subs.forEach((f) => f());
  }
}

const store = new Store(localStorageAdapter);
const StoreCtx = createContext(store);

export function StoreProvider({ uid, children }: { uid: string | null; children: ReactNode }) {
  useEffect(() => {
    store.hydrate(uid);
  }, [uid]);
  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === store.key) store.hydrate(uid);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [uid]);
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function useStore<T>(selector: (s: UserState) => T): T {
  const s = useContext(StoreCtx);
  // Selectors may derive new arrays (filter, ?? []). Reuse the previous result when
  // it is shallow-equal so useSyncExternalStore gets a stable snapshot.
  const last = useRef<{ value?: T; has: boolean }>({ has: false });
  const stable = (next: T) => {
    if (last.current.has && shallowEqual(last.current.value, next)) return last.current.value as T;
    last.current = { value: next, has: true };
    return next;
  };
  return useSyncExternalStore(
    s.subscribe,
    () => stable(selector(s.get())),
    () => stable(selector(DEFAULT_STATE)),
  );
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function useActions() {
  const s = useContext(StoreCtx);
  const set = s.set;
  const notify = useCallback(
    (n: Omit<AppNotification, "id" | "at" | "read">) =>
      set((st) => (st.notifPrefs[n.category] === false ? st : { ...st, notifications: [{ ...n, id: uid(), at: Date.now(), read: false }, ...st.notifications].slice(0, 200) })),
    [set],
  );
  return useMemo(
    () => ({
      set,
      notify,
      toggleWatch: (mint: string) => set((st) => ({ ...st, watchlist: st.watchlist.includes(mint) ? st.watchlist.filter((m) => m !== mint) : [...st.watchlist, mint] })),
      follow: (address: string, label?: string) =>
        set((st) => (st.followed.some((f) => f.address === address) ? st : { ...st, followed: [...st.followed, { address, label: label || `${address.slice(0, 4)}…${address.slice(-4)}`, addedAt: Date.now() }] })),
      unfollow: (address: string) => set((st) => ({ ...st, followed: st.followed.filter((f) => f.address !== address), walletAlerts: st.walletAlerts.filter((a) => a.address !== address) })),
      renameFollowed: (address: string, label: string) => set((st) => ({ ...st, followed: st.followed.map((f) => (f.address === address ? { ...f, label } : f)) })),
      setLastSeen: (address: string, sig: string) => set((st) => ({ ...st, followed: st.followed.map((f) => (f.address === address ? { ...f, lastSeenSig: sig } : f)) })),
      upsertWalletAlert: (a: Omit<WalletAlert, "id"> & { id?: string }) =>
        set((st) => {
          const others = st.walletAlerts.filter((x) => x.address !== a.address);
          return { ...st, walletAlerts: a.kinds.length ? [...others, { ...a, id: a.id ?? uid() }] : others };
        }),
      addPriceAlert: (a: Omit<PriceAlert, "id">) => set((st) => ({ ...st, priceAlerts: [...st.priceAlerts, { ...a, id: uid() }] })),
      removePriceAlert: (id: string) => set((st) => ({ ...st, priceAlerts: st.priceAlerts.filter((a) => a.id !== id) })),
      install: (id: string) => set((st) => (st.installed.some((i) => i.id === id) ? st : { ...st, installed: [...st.installed, { id, enabled: true, installedAt: Date.now() }] })),
      uninstall: (id: string) => set((st) => ({ ...st, installed: st.installed.filter((i) => i.id !== id) })),
      toggleExtension: (id: string) => set((st) => ({ ...st, installed: st.installed.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)) })),
      setExtPref: (id: string, key: string, value: unknown) => set((st) => ({ ...st, extPrefs: { ...st.extPrefs, [id]: { ...st.extPrefs[id], [key]: value } } })),
      toggleFavorite: (slug: string) => set((st) => ({ ...st, favorites: st.favorites.includes(slug) ? st.favorites.filter((x) => x !== slug) : [...st.favorites, slug] })),
      toggleAddedApp: (slug: string) => set((st) => ({ ...st, addedApps: st.addedApps.includes(slug) ? st.addedApps.filter((x) => x !== slug) : [...st.addedApps, slug] })),
      markRead: (id?: string) => set((st) => ({ ...st, notifications: st.notifications.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) })),
      clearNotifications: () => set((st) => ({ ...st, notifications: [] })),
      addReview: (slug: string, r: Omit<Review, "id" | "at">) => set((st) => ({ ...st, reviews: { ...st.reviews, [slug]: [{ ...r, id: uid(), at: Date.now() }, ...(st.reviews[slug] ?? [])] } })),
      addPost: (text: string, author: string) => set((st) => ({ ...st, posts: [{ id: uid(), text, author, at: Date.now(), likes: 0, comments: [] }, ...st.posts] })),
      addComment: (postId: string, text: string, author: string) =>
        set((st) => ({ ...st, posts: st.posts.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, { id: uid(), text, author, at: Date.now() }] } : p)) })),
      toggleLike: (id: string) => set((st) => ({ ...st, liked: st.liked.includes(id) ? st.liked.filter((x) => x !== id) : [...st.liked, id] })),
      toggleBookmark: (id: string) => set((st) => ({ ...st, bookmarks: st.bookmarks.includes(id) ? st.bookmarks.filter((x) => x !== id) : [...st.bookmarks, id] })),
      toggleFollowEntity: (id: string) => set((st) => ({ ...st, followsEntities: st.followsEntities.includes(id) ? st.followsEntities.filter((x) => x !== id) : [...st.followsEntities, id] })),
      submit: (sub: Omit<Submission, "id" | "at" | "status">) => set((st) => ({ ...st, submissions: [{ ...sub, id: uid(), at: Date.now(), status: "pending_review" }, ...st.submissions] })),
      pushRecentSearch: (q: string) => set((st) => ({ ...st, recentSearches: [q, ...st.recentSearches.filter((x) => x !== q)].slice(0, 8) })),
      clearRecentSearches: () => set((st) => ({ ...st, recentSearches: [] })),
    }),
    [set, notify],
  );
}
