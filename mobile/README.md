# STRATA for phones

The STRATA browser for Android and iPhone, built with Expo (React Native).

- **STRATA home.** The home tab is STRATA. The address bar opens
  websites or searches STRATA (tokens, wallets, transactions, questions).
- **Connect your wallet app to any site.** Phones can't run browser
  extensions, so the app connects sites to your wallet *app* instead:
  - **Phantom and Solflare** show up in every site's "Connect wallet" list.
    Connecting or signing switches to the wallet app, you approve there, and
    it switches back. Each site is approved separately, and the wallet shows
    which site is asking.
  - **Android:** sites that support Mobile Wallet Adapter (most Solana apps)
    also work with any installed wallet: Phantom, Solflare, Backpack, Seed
    Vault and others.
  - Sites that don't use the standard wallet list can be opened inside a
    wallet's own browser: **menu → Open in Phantom / Solflare**.
- **Site safety badge** from the STRATA Security Center.
- **Tabs, bookmarks, history.** Bookmarks sync with the desktop app when you
  sign in to STRATA (same account sync).
- **Solana Pay and wallet links** (`solana:`, `solana-wallet:`) open in your
  wallet app.
- **Passwords:** the phone's own password manager (iCloud Keychain, Google
  Password Manager) fills logins inside the app.
- **Updates:** the Android APK checks GitHub Releases and offers new versions;
  store versions are updated by the store.

## Install on Android (free)

1. On GitHub: **Actions → Mobile app → Run workflow** (or open the latest
   `mobile-v…` release).
2. Download `solana-os-…-android.apk` on your phone and open it. Android asks
   you to allow installing from your browser the first time.

To publish a release: push a tag like `mobile-v0.2.0` (or run the workflow
with `release_tag` set). The APK is attached to that release and installed
copies offer the update.

## iPhone

iPhones only install apps from the App Store or TestFlight, so an Apple
Developer account ($99/year) is required. Builds run on Expo's EAS service
(no Mac needed):

1. Create a free account at expo.dev, then **Create a project** and copy its
   project ID. Create an access token under **Account settings → Access
   tokens**.
2. Add GitHub secrets `EXPO_TOKEN` and `EAS_PROJECT_ID`.
3. Once, from any computer with Node.js, run
   `cd mobile && npm install && EAS_PROJECT_ID=<id> npx eas-cli build -p ios`.
   It asks for your Apple ID and creates the signing certificates for you.
4. From then on, each `mobile-v…` tag (or "Run workflow" with **ios**
   checked) builds on EAS and sends the build to TestFlight. Install
   TestFlight on the iPhone to test it, then submit for App Store review in
   App Store Connect.

## Google Play

Play needs a developer account ($25 once) and your own signing key:

```bash
keytool -genkeypair -v -keystore release.jks -alias solanaos -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.jks   # macOS: base64 -i release.jks
```

Add secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Builds are then signed with
that key and also produce an `.aab` to upload to the Play Console. Keep the
keystore safe: Play only accepts updates signed with it. APKs built before
you add a key use a development key, so uninstall those before installing a
key-signed one.

## Develop

```bash
cd mobile
npm install
npm test            # unit tests (+ a browser test of the wallet bridge if Playwright is installed)
npm run typecheck
npx expo run:android   # or run:ios on a Mac; needs Android Studio / Xcode
```

The app uses native modules, so it runs in a development build rather than
Expo Go. `SOLANA_OS_URL` changes the home site (default
`https://solos-rho.vercel.app`).

## How it works

| File | Purpose |
|---|---|
| `src/components/Browser.tsx` | Tabs (one WebView each), address bar, toolbar, link handling |
| `src/wallet/injected.ts` | Registers Phantom/Solflare as Wallet Standard wallets inside each page |
| `src/wallet/bridge.ts` | Sends page requests to the wallet app ([deeplink protocol](https://docs.phantom.com/phantom-deeplinks)) and returns the result |
| `src/wallet/protocol.ts` | Encryption and URLs for that protocol |
| `src/components/SyncView.tsx` | Bookmark sync with your STRATA account |
| `src/lib/` | Address bar, link decisions, bookmarks and history (unit-tested) |

Wallet requests only come from the page itself (not embedded frames), carry
a per-tab secret, and are checked before anything opens the wallet. The site
shown in the wallet comes from the browser, not from the page. Wallet
sessions are stored in the phone's secure storage (Keychain/Keystore).
