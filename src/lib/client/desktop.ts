"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True inside the STRATA desktop app: it exposes window.solanaOSDesktop on
 * STRATA pages (versions before 0.9.4 also added "SolanaOSDesktop/x.y.z" to
 * the user agent; newer ones send Chrome's exact user agent).
 */
export function isDesktopApp(): boolean {
  if (typeof window !== "undefined" && (window as unknown as { solanaOSDesktop?: unknown }).solanaOSDesktop) return true;
  return typeof navigator !== "undefined" && /\bSolanaOSDesktop\//.test(navigator.userAgent);
}

/** True inside the STRATA phone app (it adds "SolanaOSMobile/x.y.z" to its user agent). */
export function isMobileApp(): boolean {
  return typeof navigator !== "undefined" && /\bSolanaOSMobile\//.test(navigator.userAgent);
}

/** Hydration-safe hook version of isDesktopApp(). */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktopApp()), []);
  return desktop;
}

/** Where the site is running: a normal browser, the desktop app or the phone app (hydration-safe). */
export function useAppShell(): "web" | "desktop" | "mobile" {
  const [shell, setShell] = useState<"web" | "desktop" | "mobile">("web");
  useEffect(() => setShell(isDesktopApp() ? "desktop" : isMobileApp() ? "mobile" : "web"), []);
  return shell;
}

/** Bridge the desktop app exposes to the STRATA site (see desktop/src/preload-tab.js). */
interface DesktopBridge {
  version?: number;
  extensions(): Promise<InstalledExtension[] | null>;
  setExtensionHidden?(id: string, hidden: boolean): Promise<boolean>;
  installExtension(id: string, name: string, opts?: { confirmed?: boolean }): Promise<{ ok: boolean; cancelled?: boolean; error?: string; name?: string }>;
  removeExtension(id: string, opts?: { confirmed?: boolean }): Promise<boolean>;
  profile?(): Promise<{ name: string }>;
  searchExtensions?(query: string): Promise<{ ok: boolean; error?: string; results: StoreExtension[] } | null>;
}

/** An extension installed in the desktop browser. */
export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  hidden?: boolean;
  description?: string;
}

/** One Chrome Web Store search result, read by the desktop app. */
export interface StoreExtension {
  id: string;
  name: string;
  icon: string;
  description: string;
  rating: number | null;
  users: string | null;
}

function bridge(): DesktopBridge | null {
  return typeof window !== "undefined" ? ((window as unknown as { solanaOSDesktop?: DesktopBridge }).solanaOSDesktop ?? null) : null;
}

/** Browser extensions installed in the desktop app, with install/remove (null outside the desktop app). */
export function useDesktopExtensions() {
  const [installed, setInstalled] = useState<Set<string> | null>(null);
  const [list, setList] = useState<InstalledExtension[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    const b = bridge();
    if (!b) return;
    const list = await b.extensions().catch(() => null);
    if (list) {
      setInstalled(new Set(list.map((x) => x.id)));
      setList(list);
    }
  };
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const run = async (id: string, fn: (b: DesktopBridge) => Promise<unknown>) => {
    const b = bridge();
    if (!b) return;
    setBusy(id);
    setError(null);
    try {
      const r = (await fn(b)) as { ok?: boolean; error?: string } | boolean;
      if (r && typeof r === "object" && r.ok === false && r.error) setError(r.error);
    } finally {
      setBusy(null);
      refresh();
    }
  };
  const [results, setResults] = useState<StoreExtension[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const search = async (query: string) => {
    const b = bridge();
    if (!b?.searchExtensions) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const r = await b.searchExtensions(query);
      if (seq !== searchSeq.current) return;
      setResults(r?.results ?? []);
      if (r && !r.ok) setSearchError(r.error ?? "Search failed");
      else if (r && !r.results.length) setSearchError(null);
    } catch {
      if (seq === searchSeq.current) setSearchError("Search failed");
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };
  return {
    available: installed !== null,
    canSearch: Boolean(installed !== null && bridge()?.searchExtensions),
    results,
    searching,
    searchError,
    search,
    installed: installed ?? new Set<string>(),
    installedList: list,
    canHide: Boolean(bridge()?.setExtensionHidden),
    setHidden: (id: string, hidden: boolean) => run(id, (b) => b.setExtensionHidden?.(id, hidden) ?? Promise.resolve(false)),
    busy,
    error,
    /** The app lets the site show the confirm dialog itself (desktop 0.5+); older apps ask natively. */
    confirmsInPage: (bridge()?.version ?? 0) >= 3,
    profileName: () => bridge()?.profile?.().then((p) => p?.name ?? "") ?? Promise.resolve(""),
    install: (id: string, name: string, confirmed = false) => run(id, (b) => b.installExtension(id, name, { confirmed })),
    remove: (id: string, confirmed = false) => run(id, (b) => b.removeExtension(id, { confirmed })),
  };
}
