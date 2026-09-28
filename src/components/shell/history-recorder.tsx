"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordVisit } from "@/lib/client/library";

/** Records STRATA pages you visit in your history (on the website; the desktop app records its own). */
export function HistoryRecorder() {
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("panel") === "1") return;
    // Wait for the page to set its title.
    const t = setTimeout(() => recordVisit(window.location.href, document.title), 800);
    return () => clearTimeout(t);
  }, [path, params]);
  return null;
}
