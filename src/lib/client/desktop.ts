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
