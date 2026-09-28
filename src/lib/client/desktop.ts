"use client";

import { useEffect, useState } from "react";

/** True inside the Solana OS desktop app (it adds "SolanaOSDesktop/x.y.z" to its user agent). */
export function isDesktopApp(): boolean {
  return typeof navigator !== "undefined" && /\bSolanaOSDesktop\//.test(navigator.userAgent);
}

/** Hydration-safe hook version of isDesktopApp(). */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktopApp()), []);
  return desktop;
}
