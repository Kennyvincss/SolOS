// Password manager: saves and fills website logins.
// SPDX-License-Identifier: GPL-3.0-only
//
// Passwords are encrypted with the operating system's keychain via Electron's
// safeStorage (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux)
// and stored in the app's user-data folder. They never leave this device.
// Only top-level https pages (and localhost) can save or receive a password,
// and only for their own exact origin.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, safeStorage } = require("electron");

/** Origins allowed to save/fill: https, or http on localhost for development. */
function eligibleOrigin(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return u.origin;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin;
  } catch {
    /* invalid */
  }
  return null;
}

function available() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  // On Linux without a keyring Electron falls back to "basic_text", which only
  // obscures data. Don't store passwords that way.
  if (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text") return false;
  return true;
}

function encrypt(plain) {
  return safeStorage.encryptString(plain).toString("base64");
}

function decrypt(b64) {
  return safeStorage.decryptString(Buffer.from(b64, "base64"));
}

/** A password store for one profile (dir defaults to the app's data folder). */
function createPasswords(dir = app.getPath("userData")) {
const storePath = () => path.join(dir, "passwords.json");

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return { entries: Array.isArray(d.entries) ? d.entries : [], never: Array.isArray(d.never) ? d.never : [] };
  } catch {
    return { entries: [], never: [] };
  }
}

function persist(d) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  const tmp = storePath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 });
  fs.renameSync(tmp, storePath());
}

/** Credentials for an origin, most recently used first. */
function forOrigin(origin) {
  if (!available()) return [];
  return load()
    .entries.filter((e) => e.origin === origin)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((e) => {
      try {
        return { id: e.id, username: e.username, password: decrypt(e.password) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** What saving would do: "new", "update", "same" or "never" (user opted out for this site). */
function classify(origin, username, password) {
  const d = load();
  if (d.never.includes(origin)) return "never";
  const existing = forOrigin(origin).find((e) => e.username === username);
  if (!existing) return "new";
  return existing.password === password ? "same" : "update";
}

function save(origin, username, password) {
  if (!available()) throw new Error("Secure storage isn't available on this system, so passwords can't be saved.");
  const d = load();
  const now = Date.now();
  const existing = d.entries.find((e) => e.origin === origin && e.username === username);
  if (existing) {
    existing.password = encrypt(password);
    existing.updatedAt = now;
  } else {
    d.entries.push({ id: crypto.randomUUID(), origin, username, password: encrypt(password), createdAt: now, updatedAt: now });
  }
  persist(d);
}

function neverFor(origin) {
  const d = load();
  if (!d.never.includes(origin)) d.never.push(origin);
  persist(d);
}

/** List for the Passwords page (no secrets). */
function list() {
  return load()
    .entries.map(({ id, origin, username, updatedAt }) => ({ id, origin, username, updatedAt }))
    .sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username));
}

function reveal(id) {
  const e = load().entries.find((x) => x.id === id);
  return e ? decrypt(e.password) : null;
}

function remove(id) {
  const d = load();
  d.entries = d.entries.filter((e) => e.id !== id);
  persist(d);
}

function neverList() {
  return load().never;
}

function allowAgain(origin) {
  const d = load();
  d.never = d.never.filter((o) => o !== origin);
  persist(d);
}

return { available, eligibleOrigin, forOrigin, classify, save, neverFor, list, reveal, remove, neverList, allowAgain };
}

module.exports = { createPasswords, eligibleOrigin, available };
