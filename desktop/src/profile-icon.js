// Each profile in its own taskbar entry, like Chrome: on Windows a profile's
// windows get their own taskbar group (AppUserModelID), and every window's
// icon is the STRATA icon with the profile's picture (or its colour and
// initial) as a badge. Pinning a profile's taskbar icon reopens that profile.
// SPDX-License-Identifier: GPL-3.0-only

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, nativeImage } = require("electron");
const profiles = require("./profiles");

const APP_ID = "app.solanaos.desktop";
const APP_ICON = path.join(__dirname, "ui", "app-icon.png");

/** Taskbar group of a profile: the default profile keeps the app's own. */
const appIdFor = (id) => (id === "default" ? APP_ID : `${APP_ID}.profile.${id}`);

/** Command that reopens a profile (pinned taskbar icons, jump list). */
function relaunchCommand(id) {
  const exe = `"${process.execPath}"`;
  return app.isPackaged ? `${exe} --profile=${id}` : `${exe} "${path.resolve(process.argv[1] || ".")}" --profile=${id}`;
}

// Painted with a canvas in the window's own page (text and round clipping),
// so no extra window is needed.
function paintScript({ icon, picture, color, initial }) {
  return `(async () => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    g.drawImage(await load(${JSON.stringify(icon)}), 0, 0, 256, 256);
    // Badge in the lower right, with a ring that separates it from the icon.
    const cx = 178, cy = 178, r = 74;
    g.beginPath(); g.arc(cx, cy, r + 9, 0, Math.PI * 2); g.fillStyle = "#ffffff"; g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    ${
      picture
        ? `g.drawImage(await load(${JSON.stringify(picture)}), cx - r, cy - r, r * 2, r * 2);`
        : `g.fillStyle = ${JSON.stringify(color)}; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = "#ffffff"; g.font = "700 92px Segoe UI, Helvetica, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(${JSON.stringify(initial)}, cx, cy + 5);`
    }
    g.restore();
    return c.toDataURL("image/png");
  })()`;
}

const cache = new Map(); // key -> Promise<Buffer | null>

/** The badged icon of a profile as PNG bytes (256×256), or null. `wc`: a loaded page to paint in. */
function profileIconPng(meta, wc) {
  const picture = profiles.pictureUrl(meta.id);
  const initial = (meta.name || "?").trim().charAt(0).toUpperCase() || "?";
  const key = `${meta.id}|${meta.color}|${initial}|${meta.picture || 0}`;
  if (!cache.has(key)) {
    const icon = `data:image/png;base64,${fs.readFileSync(APP_ICON).toString("base64")}`;
    cache.set(
      key,
      wc
        .executeJavaScript(paintScript({ icon, picture, color: meta.color || "#6b5cf6", initial }))
        .then((url) => Buffer.from(String(url).replace(/^data:image\/png;base64,/, ""), "base64"))
        .catch(() => {
          cache.delete(key);
          return null;
        }),
    );
  }
  return cache.get(key);
}

/** A .ico file holding one 256×256 PNG (Windows uses it for pinned taskbar icons). */
function writeIco(png, id) {
  const dir = path.join(app.getPath("userData"), "profile-icons");
  const file = path.join(dir, `${id}-${crypto.createHash("sha256").update(png).digest("hex").slice(0, 10)}.ico`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${id}-`)) fs.rmSync(path.join(dir, f), { force: true });
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // icon
  head.writeUInt16LE(1, 4); // one image
  head.writeUInt8(0, 6); // width 256
  head.writeUInt8(0, 7); // height 256
  head.writeUInt16LE(1, 10); // planes
  head.writeUInt16LE(32, 12); // bits per pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18); // image offset
  fs.writeFileSync(file, Buffer.concat([head, png]));
  return file;
}

/** The taskbar group, right away (before the window's taskbar button settles). */
function setTaskbarGroup(win, profileId) {
  if (process.platform !== "win32" || win.isDestroyed()) return;
  const meta = profiles.get(profileId);
  if (!meta) return;
  win.setAppDetails({ appId: appIdFor(profileId), relaunchCommand: relaunchCommand(profileId), relaunchDisplayName: profileId === "default" ? "STRATA" : `${meta.name} - STRATA` });
}

/** Give a window its profile's taskbar group and badged icon (once its page has loaded). */
async function apply(win, profileId) {
  if (process.platform === "darwin" || win.isDestroyed()) return; // macOS has one Dock icon per app
  const meta = profiles.get(profileId);
  if (!meta) return;
  // Like Chrome: with a single profile the plain icon, otherwise every profile badged.
  const badged = profiles.list().length > 1 || profileId !== "default";
  const png = badged ? await profileIconPng(meta, win.webContents) : null;
  if (win.isDestroyed()) return;
  win.setIcon(png ? nativeImage.createFromBuffer(png) : nativeImage.createFromPath(APP_ICON));
  if (process.platform === "win32") {
    win.setAppDetails({
      appId: appIdFor(profileId),
      relaunchCommand: relaunchCommand(profileId),
      relaunchDisplayName: profileId === "default" ? "STRATA" : `${meta.name} - STRATA`,
      ...(png ? { appIconPath: writeIco(png, profileId), appIconIndex: 0 } : {}),
    });
  }
}

/** The profile asked for on the command line (--profile=<id>), if any. */
function profileFromArgs(argv) {
  const a = argv.find((x) => x.startsWith("--profile="));
  const id = a?.slice("--profile=".length);
  return id && profiles.get(id) ? id : null;
}

module.exports = { apply, setTaskbarGroup, appIdFor, profileFromArgs, profileIconPng };
