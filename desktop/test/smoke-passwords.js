// Smoke test for the password manager, bookmarks and history in the real app.
// Run: xvfb-run -a npx electron --no-sandbox test/smoke-passwords.js
const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");
const { app, BrowserWindow, dialog, safeStorage } = electron;

// Isolated profile, auto-accept the "Save password?" prompt, and pretend the
// sandbox has a real keyring (it only has Electron's basic_text fallback).
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "sos-smoke-")));
dialog.showMessageBox = async () => ({ response: 0 });
safeStorage.getSelectedStorageBackend = () => "gnome_libsecret";
safeStorage.isEncryptionAvailable = () => true;
// Stand-in cipher for the test only (real builds use the OS keychain).
safeStorage.encryptString = (text) => Buffer.from(Buffer.from(text, "utf8").map((b) => b ^ 0x5a));
safeStorage.decryptString = (buf) => Buffer.from(Buffer.from(buf).map((b) => b ^ 0x5a)).toString("utf8");

const page = `<!doctype html><form id="f" action="/done" method="post" onsubmit="event.preventDefault(); document.title='submitted'">
<input name="email" type="email" autocomplete="username"><input name="pw" type="password" autocomplete="current-password"><button>Log in</button></form>`;
const server = http.createServer((_req, res) => res.end(page)).listen(0, "127.0.0.1");

require("../src/main.js");
const passwords = require("../src/passwords.js");
const library = require("../src/library.js");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const result = {};
  try {
    await wait(5000);
    const origin = `http://localhost:${server.address().port}`;
    const win = BrowserWindow.getAllWindows()[0];
    const tab = win.contentView.children.find((v) => v.webContents)?.webContents;
    await tab.loadURL(`${origin}/login`);
    await tab.executeJavaScript(`(() => {
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      set(document.querySelector('[name=email]'), 'kenny@example.com');
      set(document.querySelector('[name=pw]'), 'correct horse battery staple');
      document.getElementById('f').requestSubmit();
    })()`);
    await wait(1500);
    const saved = passwords.forOrigin(origin);
    result.saved = saved.length === 1 && saved[0].username === "kenny@example.com";
    const onDisk = fs.readFileSync(path.join(app.getPath("userData"), "passwords.json"), "utf8");
    result.encryptedOnDisk = !onDisk.includes("correct horse battery staple");

    await tab.loadURL(`${origin}/login?again=1`);
    await wait(1500);
    result.autofilled = await tab.executeJavaScript("document.querySelector('[name=email]').value === 'kenny@example.com' && document.querySelector('[name=pw]').value === 'correct horse battery staple'");

    library.toggleBookmark(`${origin}/login`, "Login");
    result.bookmarked = library.isBookmarked(`${origin}/login`);
    result.history = library.recentHistory(5).some((h) => h.url.startsWith(origin));
    result.ok = Object.values(result).every(Boolean);
  } catch (e) {
    result.error = String(e?.stack || e);
  }
  console.log("SMOKE " + JSON.stringify(result));
  server.close();
  app.exit(result.ok ? 0 : 1);
});
