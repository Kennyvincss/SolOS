/**
 * DEMO DATASET
 *
 * Everything in this file is placeholder data used only when a live provider
 * is unreachable (DATA_MODE=auto) or when DATA_MODE=demo. Token identities
 * (mint addresses, names) are real, but every number is synthetic. Anything
 * served from here is tagged `mode: "demo"` and the UI labels it "Demo data".
 */
import { KNOWN_MINTS, SOL_MINT } from "../solana/constants";
import type {
  ActivityItem,
  NewsItem,
  Portfolio,
  PricePoint,
  Protocol,
  Token,
  YieldPool,
} from "../types";
import type { ChartRange } from "./geckoterminal";

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_PRICE: Record<string, number> = {
  SOL: 150, USDC: 1, USDT: 1, PYUSD: 1, JUP: 0.8, BONK: 0.00002, JTO: 2.5, PYTH: 0.3, RAY: 3, WIF: 1.5,
  ORCA: 3, RENDER: 5, HNT: 4, W: 0.25, KMNO: 0.07, DRIFT: 0.6, JLP: 4.5, mSOL: 190, JitoSOL: 185, bSOL: 180,
  PENGU: 0.02, POPCAT: 0.4,
};

export function demoTokens(): Token[] {
  return Object.entries(KNOWN_MINTS).map(([mint, m]) => {
    const r = seeded(mint);
    const base = BASE_PRICE[m.symbol] ?? 1;
    const stable = m.kind === "stable";
    const price = stable ? 1 : base;
    const mcap = stable ? 1e9 * (2 + r() * 5) : m.symbol === "SOL" ? 8e10 : 2e8 * (1 + r() * 20);
    return {
      mint,
      symbol: m.symbol,
      name: m.name,
      decimals: m.decimals,
      priceUsd: price,
      change1h: stable ? 0 : (r() - 0.5) * 3,
      change24h: stable ? 0 : (r() - 0.45) * 16,
      change7d: stable ? 0 : (r() - 0.45) * 30,
      change30d: stable ? 0 : (r() - 0.45) * 50,
      marketCap: mcap,
      fdv: mcap * (1 + r()),
      volume24h: mcap * (0.01 + r() * 0.08),
      liquidity: mcap * (0.01 + r() * 0.05),
      holders: Math.round(20_000 + r() * 900_000),
      verified: true,
      tags: stable ? ["demo", "stable"] : ["demo"],
      audit: { mintAuthorityDisabled: m.kind !== "stable", freezeAuthorityDisabled: m.kind !== "stable", topHoldersPercentage: 5 + r() * 40 },
    };
  });
}

export function demoToken(mint: string): Token | undefined {
  return demoTokens().find((t) => t.mint === mint);
}

export function demoSearchTokens(q: string): Token[] {
  const s = q.toLowerCase();
  return demoTokens().filter((t) => t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || t.mint === q);
}

export function demoHistory(mint: string, range: ChartRange): PricePoint[] {
  const t = demoToken(mint);
  const r = seeded(mint + range);
  const n = { "1D": 96, "7D": 168, "30D": 180, "90D": 90, "1Y": 365 }[range];
  const stepMs = { "1D": 15 * 60e3, "7D": 3600e3, "30D": 4 * 3600e3, "90D": 86400e3, "1Y": 86400e3 }[range];
  const end = Date.now();
  let v = (t?.priceUsd ?? 1) * (0.85 + r() * 0.3);
  const out: PricePoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    v = Math.max(v * (1 + (r() - 0.5) * 0.03), 1e-9);
    out.push({ t: end - i * stepMs, v: t?.symbol && ["USDC", "USDT", "PYUSD"].includes(t.symbol) ? 1 : v });
  }
  return out;
}

export const DEMO_WALLET = "DemoWa11et1111111111111111111111111111111111";

export function demoPortfolio(address = DEMO_WALLET): Portfolio {
  const toks = demoTokens();
  const pick = (sym: string, amount: number) => {
    const t = toks.find((x) => x.symbol === sym)!;
    const k = KNOWN_MINTS[t.mint];
    return {
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      amount,
      decimals: t.decimals ?? 6,
      priceUsd: t.priceUsd,
      valueUsd: (t.priceUsd ?? 0) * amount,
      change24h: t.change24h,
      kind: k.kind,
    };
  };
  const holdings = [pick("SOL", 42.5), pick("USDC", 3120), pick("JitoSOL", 12), pick("JUP", 2400), pick("BONK", 18_000_000), pick("PYTH", 1500), pick("RENDER", 60)].sort(
    (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0),
  );
  const total = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const change = holdings.reduce((s, h) => s + (h.valueUsd ?? 0) * ((h.change24h ?? 0) / 100), 0);
  return {
    address,
    solBalance: 42.5,
    totalUsd: total,
    change24hPct: (change / total) * 100,
    holdings,
    nfts: [],
    unpricedCount: 0,
    pnl: { available: false, reason: "Demo wallet — PnL requires an indexer with cost-basis history." },
  };
}

export function demoActivity(address = DEMO_WALLET): ActivityItem[] {
  const r = seeded(address);
  const kinds: [ActivityItem["kind"], string][] = [
    ["swap", "Swapped 2.0 SOL for USDC via Jupiter"],
    ["transfer_in", "Received 500 USDC"],
    ["stake", "Staked 10 SOL for JitoSOL"],
    ["transfer_out", "Sent 1.2 SOL"],
    ["swap", "Swapped 300 USDC for JUP via Jupiter"],
    ["program", "Interacted with Kamino Lend"],
  ];
  return kinds.map(([kind, summary], i) => ({
    signature: `demo-signature-${i}`,
    slot: 300_000_000 - i * 5000,
    blockTime: Math.round(Date.now() / 1000 - i * 3600 * (2 + r() * 10)),
    status: "success",
    kind,
    summary: `[Demo] ${summary}`,
    programs: [],
    fee: 0.000005,
  }));
}

export function demoNews(): NewsItem[] {
  const now = Date.now();
  const items: [string, NewsItem["categories"]][] = [
    ["Sample story: how Solana validators coordinate network upgrades", ["Solana", "Infrastructure"]],
    ["Sample story: an explainer on liquid staking tokens", ["Solana", "DeFi"]],
    ["Sample story: what stablecoin payments look like on Solana", ["Solana", "Payments"]],
    ["Sample story: tokenized real-world assets, explained", ["Solana", "RWA"]],
    ["Sample story: AI agents that transact on-chain", ["Solana", "AI"]],
    ["Sample story: a guide to Solana wallets", ["Solana", "Apps"]],
  ];
  return items.map(([title, categories], i) => ({
    id: `demo-news-${i}`,
    title,
    url: "https://solana.com/news",
    source: "Demo feed",
    publishedAt: new Date(now - i * 3 * 3600e3).toISOString(),
    summary: "Placeholder item shown because no live news feed could be reached. Configure NEWS_FEEDS to aggregate real sources.",
    categories,
  }));
}

export function demoProtocols(): Protocol[] {
  const r = seeded("protocols");
  const list: [string, string][] = [
    ["Jupiter", "Dexs"], ["Kamino", "Lending"], ["Jito", "Liquid Staking"], ["Raydium", "Dexs"], ["Marinade", "Liquid Staking"],
    ["Drift", "Derivatives"], ["Orca", "Dexs"], ["Meteora", "Dexs"], ["marginfi", "Lending"], ["Sanctum", "Liquid Staking"],
    ["Save", "Lending"], ["Solayer", "Restaking"], ["Ondo Finance", "RWA"], ["Parcl", "RWA"], ["Maple", "RWA Lending"],
  ];
  return list.map(([name, category]) => ({
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    category,
    tvlUsd: Math.round((50 + r() * 2500) * 1e6),
    change1d: (r() - 0.5) * 6,
    change7d: (r() - 0.5) * 15,
  }));
}

export function demoYields(): YieldPool[] {
  const r = seeded("yields");
  const rows: [string, string, YieldPool["category"], boolean][] = [
    ["kamino-lend", "USDC", "Lending", true], ["marginfi", "SOL", "Lending", false], ["jito", "JITOSOL", "Liquid staking", false],
    ["marinade", "MSOL", "Liquid staking", false], ["raydium", "SOL-USDC", "Liquidity providing", false], ["orca", "SOL-USDC", "Liquidity providing", false],
    ["drift", "USDC", "Perpetuals", true], ["solayer", "SSOL", "Restaking", false], ["perena", "USD*", "Stablecoins", true],
    ["meteora", "JUP-SOL", "Liquidity providing", false], ["save", "USDT", "Lending", true], ["sanctum", "INF", "Liquid staking", false],
  ];
  return rows.map(([project, symbol, category, stablecoin], i) => ({
    id: `demo-pool-${i}`,
    project,
    symbol,
    category,
    stablecoin,
    apy: Math.round((2 + r() * 18) * 100) / 100,
    tvlUsd: Math.round((5 + r() * 500) * 1e6),
  }));
}

export function isDemoWallet(a: string) {
  return a === DEMO_WALLET || a === "demo";
}

export { SOL_MINT };
