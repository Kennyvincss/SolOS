"use client";

import { useEffect, useState } from "react";

/** True inside the Solana OS desktop app (it adds "SolanaOSDesktop/x.y.z" to its user agent). */
export function isDesktopApp(): boolean {
  return typeof navigator !== "undefined" && /\bSolanaOSDesktop\//.test(navigator.userAgent);
}

/** True inside the Solana OS phone app (it adds "SolanaOSMobile/x.y.z" to its user agent). */
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

/** Bridge the desktop app exposes to the Solana OS site (see desktop/src/preload-tab.js). */
interface DesktopBridge {
  extensions(): Promise<{ id: string; name: string; version: string }[] | null>;
  installExtension(id: string, name: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string; name?: string }>;
  removeExtension(id: string): Promise<boolean>;
}

function bridge(): DesktopBridge | null {
  return typeof window !== "undefined" ? ((window as unknown as { solanaOSDesktop?: DesktopBridge }).solanaOSDesktop ?? null) : null;
}

/** Browser extensions installed in the desktop app, with install/remove (null outside the desktop app). */
export function useDesktopExtensions() {
  const [installed, setInstalled] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    const b = bridge();
    if (!b) return;
    const list = await b.extensions().catch(() => null);
    if (list) setInstalled(new Set(list.map((x) => x.id)));
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
  return {
    available: installed !== null,
    installed: installed ?? new Set<string>(),
    busy,
    error,
    install: (id: string, name: string) => run(id, (b) => b.installExtension(id, name)),
    remove: (id: string) => run(id, (b) => b.removeExtension(id)),
  };
}
