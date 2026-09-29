"use client";

import { useSyncExternalStore } from "react";

/**
 * Interface mode. Lite (the default) is the minimal search-first STRATA; Pro is
 * the full dashboard workspace. Kept per device and applied before first paint
 * (html.mode-lite / html.mode-pro) by the layout script, so there is no flash.
 */
export type Mode = "lite" | "pro";
const KEY = "strata:mode";
const EVENT = "strata:mode";

export function getMode(): Mode {
  if (typeof document === "undefined") return "lite";
  return document.documentElement.classList.contains("mode-pro") ? "pro" : "lite";
}

export function setMode(mode: Mode) {
  const html = document.documentElement;
  if (getMode() === mode) return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private window: still switch for this visit */
  }
  html.classList.add("mode-switching");
  html.classList.toggle("mode-pro", mode === "pro");
  html.classList.toggle("mode-lite", mode === "lite");
  window.dispatchEvent(new Event(EVENT));
  window.setTimeout(() => html.classList.remove("mode-switching"), 260);
}

function subscribe(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export function useMode(): Mode {
  return useSyncExternalStore(subscribe, getMode, () => "lite");
}
