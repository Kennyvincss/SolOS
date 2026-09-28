# Solana OS Desktop

A desktop browser for the Solana ecosystem, built on Chromium (Electron).

- **Real wallet extensions.** Install Phantom, Solflare or Backpack from the
  **Wallets** button, or any extension from the Chrome Web Store ("Add to
  Chrome" works). Wallet popups, approvals and toolbar icons work as in Chrome.
- **Solana OS built in.** The home tab is Solana OS; the address bar searches
  Solana OS when you type something that isn't a URL (tokens, wallets,
  transactions, questions).
- **Site safety badge.** Every site is checked against the Solana OS Security
  Center (known-app registry, lookalike domains, bait keywords) and flagged in
  the address bar.
- **Tabs, back/forward, zoom, DevTools**, and the usual shortcuts
  (Ctrl/⌘+T, W, L, R, [, ]).

## Get the installers

Installers are built by GitHub Actions (`.github/workflows/desktop.yml`):

1. On GitHub, open **Actions → Desktop app → Run workflow**.
2. When it finishes, download the artifact for your OS from the run page:
   `.dmg` (macOS), `.exe` (Windows), `.AppImage` or `.deb` (Linux).

To publish a release instead, push a tag such as `desktop-v0.1.0`. The
installers are attached to a GitHub Release.

The builds are **not code-signed** yet, so the first launch shows a warning:

- **macOS:** right-click the app → **Open** → **Open**. (Signing needs an
  Apple Developer ID, which costs $99/year.)
- **Windows:** SmartScreen → **More info** → **Run anyway**.

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
| `src/lib.js` | Pure helpers: wallet list, address-bar parsing, risk summary |
| `src/preload-shell.js` | Bridge between the toolbar UI and the main process |
| `src/ui/` | Toolbar: tabs, address bar, safety badge, extension icons, Wallets menu |
| `test/` | Unit tests, plus smoke tests that boot the app with a test wallet extension |

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
The Solana OS website in the rest of the repository is not affected.
