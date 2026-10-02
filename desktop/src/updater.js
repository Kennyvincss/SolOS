// Automatic updates from GitHub Releases (electron-updater).
// SPDX-License-Identifier: GPL-3.0-only
//
// Installed copies check for a new release at startup and every 4 hours,
// download it in the background, and offer to restart. macOS only allows
// self-updating for code-signed apps; unsigned Mac builds show a link to the
// download page instead.

const { app, dialog, shell } = require("electron");

const RELEASES_URL = "https://stratabrowser.xyz";
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let updater = null;
let state = { status: "idle", version: null, error: null };
const listeners = new Set();

function setState(next) {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

function onUpdateState(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function getUpdateState() {
  return state;
}

function initUpdater() {
  if (!app.isPackaged) {
    setState({ status: "dev" });
    return;
  }
  // The Microsoft Store installs updates itself.
  if (process.windowsStore) {
    setState({ status: "store" });
    return;
  }
  ({ autoUpdater: updater } = require("electron-updater"));
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on("checking-for-update", () => setState({ status: "checking", error: null }));
  updater.on("update-not-available", () => setState({ status: "current" }));
  updater.on("update-available", (info) => setState({ status: "downloading", version: info.version }));
  updater.on("update-downloaded", async (info) => {
    setState({ status: "ready", version: info.version });
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `STRATA ${info.version} is ready`,
      detail: "Restart to finish updating. Otherwise it installs the next time you quit.",
    });
    if (response === 0) updater.quitAndInstall();
  });
  updater.on("error", (err) => {
    const msg = String(err?.message ?? err);
    // Unsigned macOS builds can't self-update; point people to the download page.
    const needsSigning = process.platform === "darwin" && /sign|code ?signature/i.test(msg);
    setState({ status: needsSigning ? "manual" : "error", error: msg });
  });
  const check = () => updater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, CHECK_EVERY_MS);
}

/** "Check for Updates…" menu item. */
async function checkForUpdatesInteractive() {
  if (!updater) {
    const store = Boolean(process.windowsStore);
    await dialog.showMessageBox({
      type: "info",
      message: store ? "STRATA updates through the Microsoft Store" : "Updates are only available in installed builds.",
      detail: store ? `Version ${app.getVersion()}. New versions install automatically from the Store.` : `Version ${app.getVersion()}`,
    });
    return;
  }
  try {
    const result = await updater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    if (!latest || latest === app.getVersion()) {
      await dialog.showMessageBox({ type: "info", message: "You're up to date", detail: `STRATA ${app.getVersion()} is the latest version.` });
    } else if (state.status !== "ready") {
      await dialog.showMessageBox({ type: "info", message: `Downloading STRATA ${latest}…`, detail: "You'll be asked to restart when it's ready." });
    }
  } catch (err) {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Open download page", "Close"],
      message: "Couldn't update automatically",
      detail: String(err?.message ?? err),
    });
    if (response === 0) shell.openExternal(RELEASES_URL);
  }
}

module.exports = { initUpdater, checkForUpdatesInteractive, onUpdateState, getUpdateState, RELEASES_URL };
