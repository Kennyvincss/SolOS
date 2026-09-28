// Browser profiles (Main Wallet, Trading, DeFi, Research, Burner, ...).
// SPDX-License-Identifier: GPL-3.0-only
//
// Each profile is fully separate, like Chrome profiles: its own browser
// session (cookies, site data, wallet extensions and their keys), bookmarks,
// history, reading list, settings, passwords and open tabs. The first profile
// keeps the data of the single-profile version.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app } = require("electron");

const COLORS = ["#9b9cff", "#6fb7ff", "#5fd4a8", "#f5b841", "#ff7a90", "#c58af9", "#78d9ec", "#fcad70"];
const PRESETS = [
  { name: "Trading", color: "#f5b841" },
  { name: "DeFi", color: "#5fd4a8" },
  { name: "Research", color: "#6fb7ff" },
  { name: "Burner", color: "#ff7a90" },
];

const registryFile = () => path.join(app.getPath("userData"), "profiles.json");

let registry = null;
function load() {
  if (registry) return registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryFile(), "utf8"));
  } catch {
    registry = null;
  }
  if (!registry || !Array.isArray(registry.profiles) || !registry.profiles.length) {
    registry = { profiles: [{ id: "default", name: "Main Wallet", color: COLORS[0], createdAt: Date.now() }], lastUsed: "default" };
    save();
  }
  return registry;
}

function save() {
  fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
  fs.writeFileSync(registryFile(), JSON.stringify(registry, null, 2));
}

function list() {
  return load().profiles.map((p) => ({ ...p }));
}

function get(id) {
  return load().profiles.find((p) => p.id === id) ?? null;
}

function create({ name, color } = {}) {
  const d = load();
  const id = crypto.randomUUID().slice(0, 8);
  const used = new Set(d.profiles.map((p) => p.color));
  const p = {
    id,
    name: String(name || `Profile ${d.profiles.length + 1}`).trim().slice(0, 40) || "Profile",
    color: /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : COLORS.find((c) => !used.has(c)) ?? COLORS[d.profiles.length % COLORS.length],
    createdAt: Date.now(),
  };
  d.profiles.push(p);
  save();
  return p;
}

function update(id, patch) {
  const p = get(id);
  if (!p) return null;
  const d = load();
  const i = d.profiles.findIndex((x) => x.id === id);
  d.profiles[i] = {
    ...d.profiles[i],
    ...(typeof patch.name === "string" && patch.name.trim() ? { name: patch.name.trim().slice(0, 40) } : {}),
    ...(/^#[0-9a-f]{6}$/i.test(patch.color ?? "") ? { color: patch.color } : {}),
  };
  save();
  return d.profiles[i];
}

/** Forget a profile (its data folder is deleted by the caller after its windows close). */
function remove(id) {
  const d = load();
  if (id === "default" || d.profiles.length <= 1) return false;
  d.profiles = d.profiles.filter((p) => p.id !== id);
  if (d.lastUsed === id) d.lastUsed = d.profiles[0].id;
  save();
  return true;
}

function lastUsed() {
  const d = load();
  return get(d.lastUsed) ? d.lastUsed : d.profiles[0].id;
}

function setLastUsed(id) {
  const d = load();
  if (d.lastUsed === id || !get(id)) return;
  d.lastUsed = id;
  save();
}

/** Where a profile keeps its files, and its browser session partition. */
function dataDir(id) {
  return id === "default" ? app.getPath("userData") : path.join(app.getPath("userData"), "Profiles", id);
}
function partition(id) {
  return id === "default" ? "persist:solanaos" : `persist:strata-${id}`;
}

module.exports = { COLORS, PRESETS, list, get, create, update, remove, lastUsed, setLastUsed, dataDir, partition };
