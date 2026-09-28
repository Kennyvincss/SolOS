// "Send to your devices": this computer registers with the STRATA account that
// is signed in inside a profile, can send tabs to the account's other devices,
// and receives tabs sent to it.
// SPDX-License-Identifier: GPL-3.0-only

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, Notification } = require("electron");
const { SOLANA_OS_URL } = require("./lib");

function identity() {
  const file = path.join(app.getPath("userData"), "device.json");
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (d.id) return d;
  } catch {
    /* new device */
  }
  const platform = { darwin: "Mac", win32: "Windows PC", linux: "Linux PC" }[process.platform] ?? "Computer";
  const host = os.hostname().replace(/\.local$/, "").slice(0, 40);
  const d = { id: crypto.randomUUID(), name: host ? `${host} (${platform})` : platform };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d));
  return d;
}

/** A laptop runs on battery at some point; desktops never report a battery. */
function deviceType() {
  try {
    const { powerMonitor } = require("electron");
    if (powerMonitor.isOnBatteryPower?.()) return "laptop";
  } catch {
    /* ignore */
  }
  return process.platform === "darwin" && /MacBook/i.test(os.hostname()) ? "laptop" : "desktop";
}

const cache = new Map(); // profileId -> { at, value }

async function call(rt, method, pathname, body) {
  return rt.session.fetch(`${SOLANA_OS_URL}${pathname}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function register(rt) {
  const me = identity();
  const res = await call(rt, "POST", "/api/devices", { id: me.id, name: me.name, type: deviceType(), platform: process.platform, app: "desktop" }).catch(() => null);
  return Boolean(res?.ok);
}

/** Cached device list: null (not loaded), { signedOut }, { unavailable } or { devices }. */
function cached(rt) {
  const c = cache.get(rt.id);
  return c && Date.now() - c.at < 5 * 60 * 1000 ? c.value : null;
}

async function refresh(rt) {
  const me = identity();
  const res = await call(rt, "GET", `/api/devices?current=${encodeURIComponent(me.id)}`).catch(() => null);
  let value;
  if (!res) value = { unavailable: true };
  else if (res.status === 401) value = { signedOut: true };
  else if (!res.ok) value = { unavailable: true };
  else {
    const body = await res.json().catch(() => ({}));
    value = { devices: (body.devices ?? []).map((d) => ({ ...d, current: d.id === me.id })) };
  }
  cache.set(rt.id, { at: Date.now(), value });
  return value;
}

async function send(rt, deviceId, { url, title }) {
  const me = identity();
  const res = await call(rt, "POST", "/api/devices/send", { to: deviceId, from: me.id, url, title: String(title ?? "").slice(0, 200) });
  return res.ok;
}

/** Tabs sent to this device: show a notification that opens them. */
async function poll(rt, open) {
  const me = identity();
  const res = await call(rt, "GET", `/api/devices/inbox?device=${encodeURIComponent(me.id)}`).catch(() => null);
  if (!res?.ok) return;
  const body = await res.json().catch(() => ({}));
  for (const item of body.items ?? []) {
    if (!/^https?:/.test(item.url ?? "")) continue;
    const n = new Notification({ title: `Tab from ${item.fromName || "your device"}`, body: item.title || item.url, silent: false });
    n.on("click", () => open(item.url));
    n.show();
    // Also open it in the background so it's there when you look.
    open(item.url, { background: true });
  }
}

/** Register and start checking for sent tabs (every 45 s while the profile is open). */
function start(rt, open) {
  if (rt.devicesTimer) return;
  const tick = async () => {
    if (!rt.devicesRegistered) rt.devicesRegistered = await register(rt);
    if (rt.devicesRegistered) await poll(rt, open).catch(() => {});
  };
  setTimeout(tick, 4000);
  rt.devicesTimer = setInterval(tick, 45 * 1000);
}

function stop(rt) {
  clearInterval(rt.devicesTimer);
  rt.devicesTimer = null;
}

module.exports = { identity, register, refresh, cached, send, poll, start, stop };
