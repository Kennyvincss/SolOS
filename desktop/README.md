# STRATA

A desktop browser for the Solana ecosystem, built on Chromium (Electron).

- **Real wallet extensions.** Install Phantom, Solflare or Backpack from the
  **Wallets** button, or any extension from the Chrome Web Store ("Add to
  Chrome" works). Wallet popups, approvals and toolbar icons work as in Chrome.
- **STRATA built in.** The home tab is STRATA; the address bar searches
  STRATA when you type something that isn't a URL (tokens, wallets,
  transactions, questions).
- **Site safety badge.** Every site is checked against the STRATA Security
  Center (known-app registry, lookalike domains, bait keywords) and flagged in
  the address bar.
- **Chrome-style window.** Tabs sit in the title bar, and everything else is in
  the **⋮** menu (history, bookmarks, passwords, extensions, zoom, updates).
  The usual shortcuts work: Ctrl+T/W/N/L/R/D, Ctrl+Tab, Ctrl+1–9, Alt+←/→,
  Ctrl+±/0, F5, F11, F12. On macOS the menu bar at the top of the screen has
  the same items.
- **Every extension, from inside the app.** The Extensions page in STRATA
  lists every Solana extension on the Chrome Web Store (live, with icons and
  ratings) and has a search box for any other extension. Install is one click
  (confirmed in a dialog) and happens right in the app.
- **Chrome APIs wallets need.** Electron lacks a few Chrome extension APIs
  that wallets call at startup (`chrome.identity`, `chrome.sidePanel`, …),
  and newer Chromium exposes a separate `browser` object without the added
  APIs. `src/extension-polyfills.js` fills these in for extension pages and
  service workers, so Phantom and Solflare start normally. The "Desktop
  extension check" workflow installs real wallets on a CI machine and reports
  what they log.
- **Password manager.** Offers to save logins, fills them next time, and
  keeps them encrypted with the system keychain (Keychain on macOS, DPAPI on
  Windows, libsecret/KWallet on Linux). Manage them in **File → Passwords…**,
  where revealing a password asks for Touch ID or confirmation. Passwords
  never leave the computer.
- **Bookmarks and history.** Star any page (Ctrl/⌘+D). Bookmarks and history
  are in the menu bar.
- **Sync.** Sign in to STRATA in any tab and your bookmarks and browser
  settings sync to your account (File → Sync). History and passwords stay on
  the device.
- **Automatic updates.** Installed copies check GitHub Releases for new
  versions, download them in the background and offer to restart
  (STRATA → Check for Updates… on Mac, File → Check for Updates… elsewhere).

## Get the installers

Download the latest version at **[stratabrowser.xyz](https://stratabrowser.xyz)**.

Installers are built by GitHub Actions (`.github/workflows/desktop.yml`):

1. On GitHub, open **Actions → Desktop app → Run workflow**.
2. When it finishes, download the artifact for your OS from the run page:
   `.dmg` (macOS), `.exe` (Windows), `.AppImage` or `.deb` (Linux).

To publish a release, push a tag such as `desktop-v0.3.0`. The version comes
from the tag, the installers are attached to a GitHub Release, and installed
copies update themselves to it.

```bash
git tag desktop-v0.3.0 && git push origin desktop-v0.3.0
```

## Code signing

Without signing, the first launch shows a warning (macOS: right-click →
**Open**; Windows: **More info → Run anyway**), and macOS copies can't
auto-update. Signing turns on automatically when these repository secrets
exist (GitHub → Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `MAC_CERT_P12_BASE64` | Your "Developer ID Application" certificate exported as .p12, base64-encoded (`base64 -i cert.p12`) |
| `MAC_CERT_PASSWORD` | The .p12 export password |
| `APPLE_ID` | Your Apple ID email (for notarization) |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Your 10-character Apple Developer Team ID |
| `WIN_CERT_P12_BASE64` | A Windows code-signing certificate (.pfx), base64-encoded |
| `WIN_CERT_PASSWORD` | The .pfx password |

Apple's certificate needs an Apple Developer account ($99/year). For Windows,
any OV/EV code-signing certificate works. EV certificates, or Azure Trusted
Signing, get past SmartScreen fastest.

## Run from source

```bash
cd desktop
npm install
npm start
```

`SOLANA_OS_URL` sets the home page (default: `https://solos-rho.vercel.app`).
For local development of the website: `SOLANA_OS_URL=http://localhost:3000 npm start`.

```bash
npm test          # unit tests
npm run dist      # installers for the current OS, into dist/
```

## How it works

| File | Purpose |
|---|---|
| `src/main.js` | Windows, tabs (`WebContentsView`), extension support, menus, safety checks |
| `src/lib.js` | Pure helpers: wallet list, address-bar parsing, risk summary, bookmark merge |
| `src/passwords.js` | Encrypted password storage (OS keychain via `safeStorage`) |
| `src/preload-tab.js` | Runs isolated from pages; detects logins to save and fills saved ones |
| `src/library.js` | Bookmarks, history, settings and account sync |
| `src/updater.js` | Automatic updates from GitHub Releases |
| `src/extension-polyfills.js` | Missing Chrome extension APIs (identity, sidePanel, …) for extension pages and service workers |
| `src/webstore-search.js` | Searches the Chrome Web Store for the Extensions page |
| `src/preload-shell.js` | Bridge between the toolbar UI and the main process |
| `src/ui/` | Toolbar: tabs, address bar, safety badge, extension icons, Wallets menu |
| `test/` | Unit tests, plus smoke tests that boot the app (test wallet extension and its popup, tab clicks and shortcuts, password save/fill, bookmarks) |

Extension support comes from
[electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell)
(chrome.action popups, tabs, windows, storage…) and
[electron-chrome-web-store](https://www.npmjs.com/package/electron-chrome-web-store)
(installing and auto-updating extensions from the Chrome Web Store).

Web pages run sandboxed with context isolation and no Node.js access. Only the
toolbar has a privileged preload. Extensions live in a dedicated persistent
session (`persist:solanaos`), so wallet data survives restarts.

## License

GPL-3.0. See [LICENSE](LICENSE). This applies to the desktop app in this
folder because it uses electron-chrome-extensions under its GPL-3.0 option.
The STRATA website in the rest of the repository is not affected.
