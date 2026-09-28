import "server-only";
import { z } from "zod";
import type { DataMeta } from "../types";
import { APPS, appsByCategory } from "../catalog/apps";
import { APP_CATEGORIES } from "../types";
import { search } from "../search/engine";
import { getToken, movers, newTokens, topTradedTokens, trendingTokens } from "../services/tokens";
import { getActivity, getPortfolio } from "../services/wallets";
import { explainSignature } from "../services/transactions";
import { addressRisk, domainRisk } from "../services/security";
import { news, protocols, yields, networkStatus } from "../services/ecosystem";
import { isAddress, isSignature } from "../solana/address";
import { classifyAddress, type AccountClass } from "../services/account";
import { renderHeadline } from "../solana/explain";
import { scoreDoc } from "../search/fuzzy";

/**
 * Tools Solana AI can call. Each tool returns:
 *  - `result`: compact JSON for the model
 *  - `card`:   structured data the chat UI renders as a rich card
 *  - `sources`: links to the underlying Solana OS objects, with provenance
 */

export interface AiSource {
  label: string;
  href: string;
  provider: string;
  mode: DataMeta["mode"];
}

export type AiCard =
  | { kind: "portfolio"; data: unknown }
  | { kind: "token"; data: unknown }
  | { kind: "tokens"; title: string; data: unknown }
  | { kind: "tx"; data: unknown }
  | { kind: "risk"; data: unknown }
  | { kind: "apps"; data: unknown }
  | { kind: "news"; data: unknown }
  | { kind: "yields"; data: unknown }
  | { kind: "activity"; address: string; data: unknown };

export interface ToolOutput {
  result: unknown;
  action?: import("./protocol").AiAction;
  card?: AiCard;
  sources: AiSource[];
}

export interface ToolContext {
  wallet?: string | null;
  user?: import("./protocol").UserContext;
}

function src(label: string, href: string, meta: DataMeta): AiSource {
  return { label, href, provider: meta.provider, mode: meta.mode };
}

const round = (n: number | undefined, d = 4) => (n === undefined ? undefined : Number(n.toPrecision(d)));

const TOKEN_LISTS = ["trending", "top_traded", "new", "gainers", "losers"] as const;

export const TOOL_SCHEMAS = {
  search_solana: z.object({ query: z.string().min(1).max(200) }),
  get_token: z.object({ token: z.string().min(1).max(60) }),
  get_token_list: z.object({ list: z.enum(TOKEN_LISTS), limit: z.number().int().min(1).max(20).optional() }),
  get_wallet_portfolio: z.object({ address: z.string().min(2).max(60) }),
  get_wallet_activity: z.object({ address: z.string().min(2).max(60) }),
  explain_transaction: z.object({ signature: z.string().min(40).max(100) }),
  check_security: z.object({ target: z.string().min(3).max(200) }),
  find_apps: z.object({ category: z.enum(APP_CATEGORIES).optional(), query: z.string().max(100).optional() }),
  get_news: z.object({ topic: z.string().max(60).optional() }),
  get_defi_yields: z.object({ asset: z.string().max(20).optional(), category: z.string().max(40).optional() }),
  get_protocols: z.object({ names: z.array(z.string().max(60)).max(6).optional() }),
  get_network_status: z.object({}),
  identify_address: z.object({ address: z.string().min(20).max(100) }),
  open_page: z.object({ path: z.string().min(1).max(300), label: z.string().max(80).optional() }),
  install_extension: z.object({ name: z.string().min(1).max(80) }),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export const TOOL_DEFS: { name: ToolName; description: string; input_schema: Record<string, unknown> }[] = [
  { name: "search_solana", description: "Unified Solana OS search across tokens, apps, protocols, news and extensions. Use for anything you need to locate.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_token", description: "Live market data for one token: price, market cap, volume, liquidity, holders, 1h/24h/7d change, verification and audit flags. Accepts a mint address or a symbol like SOL or JUP.", input_schema: { type: "object", properties: { token: { type: "string", description: "Mint address or symbol" } }, required: ["token"] } },
  { name: "get_token_list", description: "Lists of tokens: trending (attention), top_traded (volume), new (recently launched), gainers or losers (24h, liquid tokens only).", input_schema: { type: "object", properties: { list: { type: "string", enum: [...TOKEN_LISTS] }, limit: { type: "integer", minimum: 1, maximum: 20 } }, required: ["list"] } },
  { name: "get_wallet_portfolio", description: "Current holdings and USD value of a Solana wallet from on-chain balances. Use address \"me\" for the user's connected wallet.", input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_wallet_activity", description: "Recent transactions of a wallet, each explained in plain English. Use address \"me\" for the connected wallet.", input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "explain_transaction", description: "Decode a transaction signature into plain English: who did what, tokens moved, programs, fees and status.", input_schema: { type: "object", properties: { signature: { type: "string" } }, required: ["signature"] } },
  { name: "check_security", description: "Transparent risk indicators for a token mint, wallet, program or website domain. Never returns a blanket 'safe' verdict.", input_schema: { type: "object", properties: { target: { type: "string", description: "Mint/wallet/program address, or a domain/URL" } }, required: ["target"] } },
  { name: "find_apps", description: "Find Solana applications from the Solana OS App Store by category and/or keyword.", input_schema: { type: "object", properties: { category: { type: "string", enum: [...APP_CATEGORIES] }, query: { type: "string" } } } },
  { name: "get_news", description: "Latest Solana ecosystem headlines with their sources, optionally filtered by a topic keyword.", input_schema: { type: "object", properties: { topic: { type: "string" } } } },
  { name: "get_defi_yields", description: "Solana DeFi yield opportunities (APY, TVL, project) from DefiLlama. Filter by asset symbol (e.g. USDC, SOL) or category (Lending, Liquid staking, Liquidity providing, Perpetuals, Restaking, Stablecoins, Yield).", input_schema: { type: "object", properties: { asset: { type: "string" }, category: { type: "string" } } } },
  { name: "get_protocols", description: "Solana DeFi protocols with TVL and 1d/7d change from DefiLlama. Pass names to compare specific protocols, or omit for the top list.", input_schema: { type: "object", properties: { names: { type: "array", items: { type: "string" } } } } },
  { name: "open_page", description: "Take the user to a page in Solana OS (it opens after your answer). Use for requests like 'open/show/take me to …'. path is an internal path such as /extensions, /wallets/<address>, /tokens/<mint>, /apps/<slug>, /portfolio, /security?q=<target>, /tx/<signature>.", input_schema: { type: "object", properties: { path: { type: "string" }, label: { type: "string", description: "Short name of the destination, e.g. 'Phantom on the Extensions page'" } }, required: ["path"] } },
  { name: "install_extension", description: "Help the user install a browser extension (wallets like Phantom, Solflare, Backpack, or any Chrome Web Store extension) in the Solana OS desktop app: opens the Extensions page on it and starts the install, which the user confirms.", input_schema: { type: "object", properties: { name: { type: "string", description: "Extension name, e.g. Phantom" } }, required: ["name"] } },
  { name: "identify_address", description: "Find out what a pasted address or ID is before using it: a wallet, a token (mint / contract address / CA), a token account, a program, or a transaction signature. Call this first whenever the user pastes an address without saying what it is.", input_schema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "get_network_status", description: "Solana network status: current slot, epoch progress, throughput (TPS) and priority fee percentiles.", input_schema: { type: "object", properties: {} } },
];

export const TOOL_LABELS: Record<ToolName, string> = {
  search_solana: "Searching Solana OS",
  get_token: "Fetching token data",
  get_token_list: "Loading token list",
  get_wallet_portfolio: "Reading wallet balances",
  get_wallet_activity: "Reading wallet activity",
  explain_transaction: "Decoding transaction",
  check_security: "Running security checks",
  find_apps: "Searching the App Store",
  get_news: "Reading news",
  get_defi_yields: "Loading DeFi yields",
  get_protocols: "Loading protocol data",
  get_network_status: "Checking network status",
  identify_address: "Identifying address",
  open_page: "Opening page",
  install_extension: "Finding extension",
};

/** Internal pages the assistant may open (no external URLs). */
function safeInternalPath(path: string): string | null {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//") || /[\s<>"'\\]/.test(p)) return null;
  const root = "/" + (p.split(/[/?#]/)[1] ?? "");
  const allowed = new Set(["/", "/search", "/discover", "/apps", "/extensions", "/ai", "/tokens", "/wallets", "/tx", "/defi", "/rwa", "/payments", "/news", "/security", "/portfolio", "/feed", "/notifications", "/profile", "/developers", "/settings", "/login", "/go"]);
  return allowed.has(root) ? p : null;
}

const KIND_LABEL: Record<AccountClass["type"], string> = {
  wallet: "wallet",
  mint: "token (mint / contract address)",
  token_account: "token account (holds one token for a wallet)",
  program: "program (smart contract)",
  other: "program-owned account",
  missing: "unused address (no on-chain account yet; usually an empty wallet)",
};

/** Look up what an address is; never fails the calling tool if the lookup itself fails. */
async function kindOf(address: string): Promise<AccountClass | null> {
  return classifyAddress(address).catch(() => null);
}

function resolveAddress(a: string, ctx: ToolContext): string {
  if (/^(me|my|mine|self|connected)$/i.test(a.trim())) {
    if (!ctx.wallet) throw new Error("No wallet is connected. Ask the user to connect a wallet or paste an address.");
    return ctx.wallet;
  }
  if (!isAddress(a) && a !== "demo") throw new Error(`"${a}" is not a valid Solana address.`);
  return a;
}

export async function runTool(name: ToolName, rawInput: unknown, ctx: ToolContext): Promise<ToolOutput> {
  const parsed = TOOL_SCHEMAS[name].safeParse(rawInput);
  if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  const input = parsed.data as Record<string, unknown>;

  switch (name) {
    case "open_page": {
      const href = safeInternalPath(String(input.path));
      if (!href) throw new Error("That isn't a Solana OS page.");
      const label = String(input.label ?? href);
      return { result: { opening: href, note: "The page opens when your answer finishes; tell the user." }, action: { type: "navigate", href, label }, sources: [] };
    }
    case "install_extension": {
      const raw = String(input.name).trim();
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      const inDesktop = ctx.user?.app === "desktop";
      const already = ctx.user?.installedExtensions?.find((x) => x.toLowerCase().includes(name.toLowerCase()));
      if (already) return { result: { name, alreadyInstalled: already, note: "It's already installed; its icon is next to the address bar (or in ⋮ → Extensions if hidden)." }, sources: [] };
      const href = `/extensions?q=${encodeURIComponent(name)}&install=1`;
      return {
        result: inDesktop
          ? { name, opening: href, note: `The Extensions page opens on ${name} and the app asks the user to confirm the install.` }
          : { name, opening: href, note: "Browser extensions install in the Solana OS desktop app. In a normal browser the page links to the Chrome Web Store; on phones, wallets connect through the wallet's own app instead." },
        action: { type: "navigate", href, label: `Install ${name}` },
        sources: [],
      };
    }
    case "identify_address": {
      const a = String(input.address).trim();
      if (isSignature(a) && !isAddress(a)) return { result: { kind: "transaction signature", next: "explain_transaction", link: `/tx/${a}` }, sources: [] };
      if (!isAddress(a)) return { result: { kind: "not a Solana address or signature" }, sources: [] };
      const c = await classifyAddress(a);
      const next = { wallet: "get_wallet_portfolio", missing: "get_wallet_portfolio", mint: "get_token", token_account: "get_wallet_portfolio (for the owning wallet)", program: "check_security", other: "check_security" }[c.type];
      const link = c.type === "mint" ? `/tokens/${a}` : c.type === "program" ? `/security?q=${a}` : `/wallets/${c.type === "token_account" && c.wallet ? c.wallet : a}`;
      const meta: DataMeta = { provider: "Solana RPC", mode: "live", fetchedAt: new Date().toISOString() };
      return {
        result: { address: a, kind: KIND_LABEL[c.type], programName: c.name, ownerProgram: c.ownerName ?? c.owner, owningWallet: c.wallet, tokenMint: c.mint, next, link },
        sources: [src(c.type === "mint" ? "Token" : c.type === "program" ? "Program" : "Wallet", link, meta)],
      };
    }
    case "search_solana": {
      const r = await search(String(input.query), { limitPerGroup: 4 });
      return {
        result: { intent: r.intent.label, groups: r.groups.map((g) => ({ type: g.label, results: g.hits.map((h) => ({ title: h.title, detail: h.subtitle, link: h.href })) })) },
        sources: r.groups.flatMap((g) => g.hits.slice(0, 2)).slice(0, 6).map((h) => ({ label: h.title, href: h.href, provider: "Solana OS search", mode: (h.meta?.mode as DataMeta["mode"]) ?? "live" })),
      };
    }
    case "get_token": {
      const r = await getToken(String(input.token));
      if (!r.data) return { result: { found: false }, sources: [] };
      const t = r.data;
      return {
        result: {
          dataMode: r.meta.mode,
          mint: t.mint, symbol: t.symbol, name: t.name, priceUsd: round(t.priceUsd, 6), change1h: round(t.change1h, 3), change24h: round(t.change24h, 3), change7d: round(t.change7d, 3),
          marketCap: round(t.marketCap), volume24h: round(t.volume24h), liquidity: round(t.liquidity), holders: t.holders, verified: t.verified, createdAt: t.createdAt,
          mintAuthorityDisabled: t.audit?.mintAuthorityDisabled, freezeAuthorityDisabled: t.audit?.freezeAuthorityDisabled, topHoldersPercentage: round(t.audit?.topHoldersPercentage, 3),
          link: `/tokens/${t.mint}`,
        },
        card: { kind: "token", data: { token: t, meta: r.meta } },
        sources: [src(`${t.symbol} token page`, `/tokens/${t.mint}`, r.meta)],
      };
    }
    case "get_token_list": {
      const list = input.list as (typeof TOKEN_LISTS)[number];
      const limit = (input.limit as number | undefined) ?? 10;
      let data;
      let meta: DataMeta;
      if (list === "gainers" || list === "losers") {
        const m = await movers();
        data = m.data[list];
        meta = m.meta;
      } else {
        const r = list === "trending" ? await trendingTokens("24h", 30) : list === "top_traded" ? await topTradedTokens("24h", 30) : await newTokens(30);
        data = r.data;
        meta = r.meta;
      }
      const top = data.slice(0, limit);
      return {
        result: { dataMode: meta.mode, list, tokens: top.map((t) => ({ symbol: t.symbol, name: t.name, mint: t.mint, priceUsd: round(t.priceUsd, 6), change24h: round(t.change24h, 3), volume24h: round(t.volume24h), marketCap: round(t.marketCap), liquidity: round(t.liquidity), verified: t.verified, link: `/tokens/${t.mint}` })) },
        card: { kind: "tokens", title: { trending: "Trending tokens", top_traded: "Most traded", new: "New tokens", gainers: "Top gainers (24h)", losers: "Top losers (24h)" }[list], data: { tokens: top, meta } },
        sources: [src("Tokens", `/tokens?tab=${list}`, meta)],
      };
    }
    case "get_wallet_portfolio": {
      const address = resolveAddress(String(input.address), ctx);
      // People paste token contract addresses too: answer with the token instead.
      const kind = await kindOf(address);
      if (kind?.type === "mint") return runTool("get_token", { token: address }, ctx);
      if (kind?.type === "program") return runTool("check_security", { target: address }, ctx);
      if (kind?.type === "token_account" && kind.wallet) return runTool("get_wallet_portfolio", { address: kind.wallet }, ctx);
      const r = await getPortfolio(address);
      const p = r.data;
      return {
        result: {
          dataMode: r.meta.mode, address, totalUsd: round(p.totalUsd, 8), change24hPct: round(p.change24hPct, 3), solBalance: round(p.solBalance, 6),
          holdings: p.holdings.slice(0, 15).map((h) => ({ symbol: h.symbol ?? h.mint, amount: round(h.amount, 6), valueUsd: round(h.valueUsd, 6), kind: h.kind })),
          nftCount: p.nfts.length, unpricedTokens: p.unpricedCount, pnl: p.pnl.available ? p.pnl : `Not available: ${p.pnl.reason}`, link: `/wallets/${address}`,
        },
        card: { kind: "portfolio", data: { portfolio: p, meta: r.meta } },
        sources: [src(ctx.wallet === address ? "Your portfolio" : "Wallet", ctx.wallet === address ? "/portfolio" : `/wallets/${address}`, r.meta)],
      };
    }
    case "get_wallet_activity": {
      const address = resolveAddress(String(input.address), ctx);
      const kind = await kindOf(address);
      if (kind?.type === "mint") return runTool("get_token", { token: address }, ctx);
      const r = await getActivity(address, 12, ctx.wallet ?? undefined);
      return {
        result: { dataMode: r.meta.mode, address, activity: r.data.map((a) => ({ time: a.blockTime ? new Date(a.blockTime * 1000).toISOString() : undefined, kind: a.kind, summary: a.summary, status: a.status, link: `/tx/${a.signature}` })) },
        card: { kind: "activity", address, data: { items: r.data, meta: r.meta } },
        sources: [src("Wallet activity", `/wallets/${address}`, r.meta)],
      };
    }
    case "explain_transaction": {
      const sig = String(input.signature);
      if (!isSignature(sig)) throw new Error("That is not a valid transaction signature.");
      const r = await explainSignature(sig);
      const t = r.data;
      return {
        result: { dataMode: r.meta.mode, headline: renderHeadline(t.headline, t.feePayer, ctx.wallet), status: t.status, error: t.error, time: t.blockTime ? new Date(t.blockTime * 1000).toISOString() : undefined, feeSol: t.feeSol, feePayer: t.feePayer, programs: t.programs.map((p) => p.name), signerChanges: t.payerChanges.map((c) => `${c.change > 0 ? "+" : ""}${round(c.change, 8)} ${c.symbol}`), details: t.details, link: `/tx/${sig}` },
        card: { kind: "tx", data: { tx: t, meta: r.meta } },
        sources: [src("Transaction", `/tx/${sig}`, r.meta)],
      };
    }
    case "check_security": {
      const target = String(input.target).trim();
      const report = isAddress(target) ? await addressRisk(target) : domainRisk(target);
      return {
        result: { subjectType: report.subjectType, indicators: report.indicators.map((i) => ({ label: i.label, level: i.level, value: i.value, explanation: i.explanation })), methodology: report.methodology },
        card: { kind: "risk", data: report },
        sources: [src("Security report", `/security?q=${encodeURIComponent(target)}`, report.meta)],
      };
    }
    case "find_apps": {
      const cat = input.category as (typeof APP_CATEGORIES)[number] | undefined;
      const q = input.query as string | undefined;
      let list = cat ? appsByCategory(cat) : APPS;
      if (q) list = list.map((a) => ({ a, s: scoreDoc(q, a.name, [a.tagline, a.description, a.category], a.keywords) })).filter((x) => x.s > 0.3).sort((x, y) => y.s - x.s).map((x) => x.a);
      const top = list.slice(0, 10);
      const meta: DataMeta = { provider: "Solana OS App Store", mode: "live", fetchedAt: new Date().toISOString() };
      return {
        result: { apps: top.map((a) => ({ name: a.name, category: a.category, tagline: a.tagline, website: a.website, token: a.token?.symbol, link: `/apps/${a.slug}` })) },
        card: { kind: "apps", data: top },
        sources: top.slice(0, 4).map((a) => src(a.name, `/apps/${a.slug}`, meta)),
      };
    }
    case "get_news": {
      const r = await news();
      const topic = (input.topic as string | undefined)?.toLowerCase();
      const items = (topic ? r.data.filter((n) => `${n.title} ${n.summary ?? ""}`.toLowerCase().includes(topic)) : r.data).slice(0, 8);
      return {
        result: { dataMode: r.meta.mode, items: items.map((n) => ({ title: n.title, source: n.source, publishedAt: n.publishedAt, url: n.url })) },
        card: { kind: "news", data: { items, meta: r.meta } },
        sources: items.slice(0, 4).map((n) => ({ label: `${n.source}: ${n.title}`, href: n.url, provider: n.source, mode: r.meta.mode })),
      };
    }
    case "get_defi_yields": {
      const r = await yields();
      const asset = (input.asset as string | undefined)?.toUpperCase();
      const cat = (input.category as string | undefined)?.toLowerCase();
      const items = r.data
        .filter((p) => (!asset || p.symbol.toUpperCase().split(/[-/]/).includes(asset) || p.symbol.toUpperCase().includes(asset)) && (!cat || p.category.toLowerCase().includes(cat)))
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 10);
      return {
        result: { dataMode: r.meta.mode, note: "APYs are variable and backward-looking; reward APY can change quickly.", pools: items.map((p) => ({ project: p.project, symbol: p.symbol, apy: round(p.apy, 3), baseApy: round(p.apyBase, 3), rewardApy: round(p.apyReward, 3), tvlUsd: round(p.tvlUsd), category: p.category, ilRisk: p.ilRisk })) },
        card: { kind: "yields", data: { pools: items, meta: r.meta } },
        sources: [src("DeFi hub", `/defi${asset ? `?asset=${asset}` : ""}`, r.meta)],
      };
    }
    case "get_protocols": {
      const r = await protocols();
      const names = (input.names as string[] | undefined) ?? [];
      const list = names.length
        ? names.map((n) => r.data.map((p) => ({ p, s: scoreDoc(n, p.name) })).sort((a, b) => b.s - a.s)[0]).filter((x) => x && x.s > 0.5).map((x) => x.p)
        : r.data.slice(0, 15);
      return {
        result: { dataMode: r.meta.mode, protocols: list.map((p) => ({ name: p.name, category: p.category, tvlUsdOnSolana: round(p.tvlUsd), change1d: round(p.change1d, 3), change7d: round(p.change7d, 3) })) },
        sources: [src("DeFi hub", "/defi", r.meta)],
      };
    }
    case "get_network_status": {
      const r = await networkStatus();
      return { result: { dataMode: r.meta.mode, ...r.data }, sources: [src("Network", "/discover", r.meta)] };
    }
  }
}
