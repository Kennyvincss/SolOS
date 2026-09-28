// Browser appearance (Light / Dark / Match system), like Chrome's.
// Sets Electron's theme source, so every STRATA window (tab strip, menus,
// bubbles, extensions panel, passwords) and prefers-color-scheme in pages follow it.
const fs = require("node:fs");
const path = require("node:path");
const { app, nativeTheme } = require("electron");

const THEMES = ["light", "dark", "system"];
const file = () => path.join(app.getPath("userData"), "appearance.json");
let listeners = [];

function get() {
  try {
    const t = JSON.parse(fs.readFileSync(file(), "utf8")).theme;
    return THEMES.includes(t) ? t : "light";
  } catch {
    return "light";
  }
}

function set(theme) {
  if (!THEMES.includes(theme)) return;
  try {
    fs.writeFileSync(file(), JSON.stringify({ theme }));
  } catch {
    /* read-only profile: still apply for this session */
  }
  nativeTheme.themeSource = theme;
}

/** Colors native window parts need (window background, title bar buttons). */
function colors() {
  return nativeTheme.shouldUseDarkColors
    ? { bg: "#07070b", bar: "#0d0d12", symbol: "#9ba1ab", bubble: "#16161d", panel: "#1b1e23", page: "#07070b" }
    : { bg: "#f6f6f7", bar: "#eeeef1", symbol: "#5f636b", bubble: "#ffffff", panel: "#ffffff", page: "#ffffff" };
}

function onChange(fn) {
  listeners.push(fn);
}

function init() {
  nativeTheme.themeSource = get();
  nativeTheme.on("updated", () => listeners.forEach((fn) => fn(colors())));
}

module.exports = { init, get, set, colors, onChange, THEMES };
