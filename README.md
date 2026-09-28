# Solana OS

**Everything Solana. One place.**

Solana OS is a gateway to the Solana ecosystem: universal search, an app store,
Solana AI, wallet and portfolio, token and transaction explorers, a security
center, DeFi/RWA/payments hubs, news, a social feed,
extensions and a developer platform, all in one fast, dark-first interface.

## Desktop app

`desktop/` contains **Solana OS Desktop**, a Chromium browser with Solana OS as
its home and real Chrome wallet extensions (Phantom, Solflare, Backpack), plus
a password manager, bookmarks, account sync and automatic updates. See
[desktop/README.md](desktop/README.md). Installers for macOS, Windows and Linux
are built by the "Desktop app" GitHub Actions workflow. The desktop app is
licensed GPL-3.0.

## Phone app

`mobile/` contains **Solana OS for Android and iPhone** (Expo / React Native):
the same browser with Solana OS as its home, connecting sites to your Phantom
or Solflare app (and to any wallet through Mobile Wallet Adapter on Android),
with bookmarks that sync with the desktop app. The "Mobile app" GitHub Actions
workflow builds an Android APK; iPhone builds go through Expo EAS and need an
Apple Developer account. See [mobile/README.md](mobile/README.md).

## Deploy to Vercel

1. Import this repository in Vercel. The framework (Next.js) is detected
   automatically; no Root Directory setting is needed.
2. Add environment variables (see `.env.example`). The only one required in
   production is `AUTH_SECRET` (`openssl rand -base64 32`). Recommended:
   `SOLANA_RPC_URL` (a private RPC) and `GROQ_API_KEY` (Solana AI, free at console.groq.com).
3. Deploy.

The server is stateless: sessions are signed cookies, caches live in memory
per instance, and nothing is written to disk. That's why it runs on Vercel's
serverless functions unchanged. Solana AI streams from a route with
`maxDuration = 120`.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run lint                 # type-check
```

## Real data, never fake data

Every response from a data provider is wrapped as `{ data, meta }`, where
`meta` names the provider and says whether the data is `live` or `demo`. The
UI shows a provenance badge on every data view and a warning banner whenever
demo data is displayed.

| Area | Provider (swappable) |
|---|---|
| Balances, transactions, mint authorities, holders, simulation | Solana JSON-RPC (`SOLANA_RPC_URL`) |
| Token search, metadata, prices, trending, audits | Jupiter Tokens API v2 / Price API v3 |
| Price charts | GeckoTerminal OHLCV |
| Protocol TVL, DEX volume, yields | DefiLlama |
| News | RSS/Atom feeds (`NEWS_FEEDS`) |
| Solana AI | Groq (`GROQ_API_KEY`; model auto-selected, or pinned with `GROQ_MODEL`) with tool calls into the services above |

With `DATA_MODE=auto` (default), an unreachable provider falls back to a
**demo dataset that is labelled as demo everywhere it appears**. Wallet
balances and transactions never fall back to demo data: if the RPC is down
you see an error, not invented balances. A clearly named demo wallet
(`/wallets/demo`) exists to preview the layout.

Things that need an indexer are shown as unavailable rather than estimated:
7d/30d/all-time PnL, protocol positions (lending, LP, perps), NFT metadata
and social data.

## Architecture

```
src/
  app/                 Next.js App Router pages + API routes (/api/*)
  components/          UI: shell (sidebar, ⌘K, mobile nav), domain views, charts, AI chat
  lib/
    types.ts           Domain model shared by server and client
    providers/         One module per upstream (rpc, jupiter, geckoterminal, defillama, news, demo)
    services/          Business logic composed from providers (tokens, wallets, transactions, security, ecosystem)
    solana/            Address helpers, program registry, transaction explainer, pre-sign decoder
    search/            Fuzzy scoring, natural-language intent detection, unified search engine
    ai/                Solana AI tools, Groq streaming tool-call loop, no-key offline mode
    auth/              Signed-cookie sessions, Sign-In With Solana, origin helper
    extensions/        Extension SDK (manifest schema, permissioned host) + catalog
    catalog/           Curated app registry and page index
    client/            Browser-side state (store), wallet/session layer, data fetching
```

- **Swapping providers:** each provider is a small module behind a service
  function. Replace `providers/jupiter.ts` with, say, Birdeye, and nothing
  else changes.
- **Search:** a static in-memory index (apps, developers, pages, extensions)
  plus federated live sources (tokens, news, markets, protocols), each with a
  small time budget. `detectIntent` routes addresses, signatures and
  natural-language questions ("what are whales buying?") to the right view or
  to Solana AI.
- **Solana AI:** runs on Groq's OpenAI-compatible API with a streaming
  tool-call loop over 13 tools. Tool results are streamed to the client as
  rich cards with source links; the system prompt requires separating
  verified data, analysis and uncertainty, and forbids financial advice.
  Without `GROQ_API_KEY`, an offline engine answers from the same tools using
  templates and says so.
- **Security:** token checks (mint/freeze authority, Token-2022 extensions,
  holder concentration, liquidity, age, verification), wallet/program checks
  (upgrade authority), domain checks (registry match, typosquatting, bait
  keywords) and a pre-sign decoder for serialized transactions (legacy + v0)
  that flags approvals, authority changes, account reassignment and durable
  nonces, then simulates via RPC. Results are Low/Medium/High indicators with
  explanations. Nothing is ever labelled simply "safe".
- **Wallets:** discovered through the Wallet Standard (Phantom, Solflare,
  Backpack…). Browsing never requires a wallet; any address can be watched
  read-only.
- **Auth:** email magic links (Resend), Google OAuth, and Sign-In With Solana
  (ed25519 signature verified server-side).
- **User data:** watchlist, follows, alerts, extensions, notifications and
  profile go through a `StorageAdapter` (localStorage by default), so a
  server-backed store can be added without UI changes.
- **Extensions:** manifests are validated with zod; every host capability
  (`search`, `wallet:read`, `ai`, `notifications`…) is permission-checked.
  Built-in extensions run in-process. Third-party extensions will use the same
  host API over a sandboxed iframe.

## Roadmap

- **Phase 1–3 (in this build):** landing and personalized home, universal
  search, token/wallet/transaction search, App Store, Solana AI, wallet
  connection, portfolio, extensions, discover, wallet following and alerts,
  notifications, security center, news, DeFi, RWA,
  payments (Solana Pay requests), social feed, developer platform.
- **Next integrations:** indexer for PnL, positions and NFTs (e.g. Helius DAS
  plus webhooks for server-side alerts); a database-backed `StorageAdapter`;
  a review backend for submissions; a social backend.
- **Phase 4:** execution layer (swaps and payments signed in-wallet), sandboxed
  third-party extensions, AI actions, ecosystem marketplace.
