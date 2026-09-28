"use client";

import { isDesktopApp, isMobileApp } from "./desktop";

export interface DeviceInfo {
  id: string;
  name: string;
  type: "desktop" | "laptop" | "mobile" | "browser";
  platform?: string;
  app?: "desktop" | "mobile" | "web";
  lastSeen: number;
  current?: boolean;
}

const KEY = "strata:device";

function browserName(ua: string) {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

function osName(ua: string) {
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "device";
}

/** This browser or phone as a device of the account (the desktop app registers itself). */
export function thisDevice(): { id: string; name: string; type: DeviceInfo["type"]; app: "mobile" | "web" } | null {
  if (typeof window === "undefined" || isDesktopApp()) return null;
  const ua = navigator.userAgent;
  let saved: { id: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    saved = null;
  }
  const id = saved?.id ?? (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  if (!saved) localStorage.setItem(KEY, JSON.stringify({ id }));
  const mobileApp = isMobileApp();
  const mobile = mobileApp || /Mobi|Android|iPhone/.test(ua);
  return {
    id,
    name: mobileApp ? `STRATA on ${osName(ua)}` : `${browserName(ua)} on ${osName(ua)}`,
    type: mobile ? "mobile" : "browser",
    app: mobileApp ? "mobile" : "web",
  };
}

export async function registerThisDevice(): Promise<boolean> {
  const me = thisDevice();
  if (!me) return false;
  const res = await fetch("/api/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...me, platform: osName(navigator.userAgent) }) }).catch(() => null);
  return Boolean(res?.ok);
}

export async function listDevices(): Promise<{ devices: DeviceInfo[] } | { error: "signed-out" | "unavailable" }> {
  const me = thisDevice();
  const res = await fetch(`/api/devices${me ? `?current=${encodeURIComponent(me.id)}` : ""}`).catch(() => null);
  if (!res) return { error: "unavailable" };
  if (res.status === 401) return { error: "signed-out" };
  if (!res.ok) return { error: "unavailable" };
  return res.json();
}

export async function sendTab(to: string, url: string, title: string): Promise<boolean> {
  const me = thisDevice();
  const from = me?.id ?? "web-unknown-device";
  const res = await fetch("/api/devices/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, from, url, title }) }).catch(() => null);
  return Boolean(res?.ok);
}

export async function removeDevice(id: string): Promise<boolean> {
  const res = await fetch(`/api/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  return Boolean(res?.ok);
}

export async function takeInbox(): Promise<{ id: string; url: string; title: string; fromName: string }[]> {
  const me = thisDevice();
  if (!me) return [];
  const res = await fetch(`/api/devices/inbox?device=${encodeURIComponent(me.id)}`).catch(() => null);
  if (!res?.ok) return [];
  return ((await res.json()) as { items?: { id: string; url: string; title: string; fromName: string }[] }).items ?? [];
}
