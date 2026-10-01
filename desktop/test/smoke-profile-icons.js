// Each profile shows as its own taskbar entry with a badged icon (the STRATA
// icon plus the profile's picture or colour and initial), like Chrome.
// Run: xvfb-run -a npx electron test/smoke-profile-icons.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const server = http.createServer((_q, r) => r.end("<!doctype html><title>Home</title>home")).listen(0);
process.env.SOLANA_OS_URL = `http://localhost:${server.address().port}`;
const errors = [];
process.on("uncaughtException", (e) => errors.push(String(e?.stack || e)));

const { app, nativeImage } = require("electron");
require("../src/main.js");
const W = require("../src/window");
const profiles = require("../src/profiles");
const icons = require("../src/profile-icon");
const ipc = require("../src/ipc");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });

app.whenReady().then(async () => {
  try {
    await wait(2500);
    const main = [...W.shells][0];
    const p = profiles.create({ name: "Trading", color: "#e5484d" });
    const s = ipc.openProfile(p.id);
    for (let i = 0; i < 40 && !s.ready; i++) await wait(100);
    await wait(500);
    const png = await icons.profileIconPng(profiles.get(p.id), s.win.webContents);
    const img = png && nativeImage.createFromBuffer(png);
    check("a badged icon is painted for the profile", img && !img.isEmpty() && img.getSize().width === 256, img?.getSize());
    if (png) fs.writeFileSync(path.join(process.env.OUT_DIR || require("node:os").tmpdir(), "profile-icon-trading.png"), png);
    // Refresh both windows (two profiles now: the default one is badged too).
    for (const w of W.shells) await icons.apply(w.win, w.profile.id);
    const a = await icons.profileIconPng(profiles.get("default"), main.win.webContents);
    check("each profile gets its own icon", a && png && !a.equals(png));
    check("each profile has its own taskbar group id", icons.appIdFor("default") !== icons.appIdFor(p.id), [icons.appIdFor("default"), icons.appIdFor(p.id)]);
    check("--profile=<id> opens that profile", icons.profileFromArgs(["strata", `--profile=${p.id}`]) === p.id && icons.profileFromArgs(["strata", "--profile=nope"]) === null);
    check("windows of different profiles are separate", s.win !== main.win && W.shells.size === 2, W.shells.size);
  } catch (e) {
    errors.push(String(e?.stack || e));
  }
  check("no errors", errors.length === 0, errors);
  for (const c of checks) console.log(`[profile-icons] ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : ` ${JSON.stringify(c.detail)}`}`);
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
});
