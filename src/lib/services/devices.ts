import "server-only";
import { readJson, takeJson, writeJson } from "../sync-store";

/**
 * "Send to your devices": each signed-in STRATA install (desktop app, phone
 * app, website) registers as a device of the account; tabs sent to a device
 * wait in its inbox until it picks them up.
 */
export interface Device {
  id: string;
  name: string;
  type: "desktop" | "laptop" | "mobile" | "browser";
  platform?: string;
  app?: "desktop" | "mobile" | "web";
  lastSeen: number;
}

export interface InboxItem {
  id: string;
  url: string;
  title: string;
  fromId: string;
  fromName: string;
  at: number;
}

const MAX_DEVICES = 20;
const INBOX_TTL = 14 * 24 * 3600;
const devicesKey = (uid: string) => `dev:v1:devices:${uid}`;
const inboxKey = (uid: string, deviceId: string) => `dev:v1:inbox:${uid}:${deviceId}`;

export async function listDevices(uid: string): Promise<Device[]> {
  return ((await readJson<Device[]>(devicesKey(uid))) ?? []).sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function upsertDevice(uid: string, d: Omit<Device, "lastSeen">): Promise<Device[]> {
  const list = await listDevices(uid);
  const next = [{ ...d, lastSeen: Date.now() }, ...list.filter((x) => x.id !== d.id)].slice(0, MAX_DEVICES);
  await writeJson(devicesKey(uid), next);
  return next;
}

export async function touchDevice(uid: string, id: string): Promise<void> {
  const list = await listDevices(uid);
  const d = list.find((x) => x.id === id);
  if (!d || Date.now() - d.lastSeen < 5 * 60 * 1000) return;
  d.lastSeen = Date.now();
  await writeJson(devicesKey(uid), list);
}

export async function removeDevice(uid: string, id: string): Promise<void> {
  await writeJson(
    devicesKey(uid),
    (await listDevices(uid)).filter((x) => x.id !== id),
  );
}

export async function sendToDevice(uid: string, to: string, item: Omit<InboxItem, "id" | "at" | "fromName"> & { fromName?: string }): Promise<boolean> {
  const list = await listDevices(uid);
  if (!list.some((d) => d.id === to)) return false;
  const from = list.find((d) => d.id === item.fromId);
  const inbox = (await readJson<InboxItem[]>(inboxKey(uid, to))) ?? [];
  inbox.push({ id: Math.random().toString(36).slice(2, 12), url: item.url, title: item.title, fromId: item.fromId, fromName: item.fromName ?? from?.name ?? "your device", at: Date.now() });
  await writeJson(inboxKey(uid, to), inbox.slice(-50), INBOX_TTL);
  return true;
}

export async function takeInbox(uid: string, deviceId: string): Promise<InboxItem[]> {
  return (await takeJson<InboxItem[]>(inboxKey(uid, deviceId))) ?? [];
}
