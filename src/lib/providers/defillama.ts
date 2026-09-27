import { config } from "../config";
import type { DefiCategory, Protocol, YieldPool } from "../types";
import { cached, fetchJson } from "./http";

/**
 * DefiLlama open API: protocol TVL (filtered to Solana) and yield pools.
 * Docs: https://defillama.com/docs/api
 */

interface LlamaProtocol {
  name: string;
  slug: string;
  category: string;
  chains: string[];
  chainTvls?: Record<string, number>;
  tvl?: number;
  change_1d?: number | null;
  change_7d?: number | null;
  logo?: string;
  url?: string;
  twitter?: string;
  description?: string;
  parentProtocol?: string;
}

export async function solanaProtocols(): Promise<Protocol[]> {
  return cached("llama:protocols:solana", 15 * 60_000, async () => {
    const res = await fetchJson<LlamaProtocol[]>(`${config.llamaApi}/protocols`, { timeoutMs: 15000 });
    return res
      .filter((p) => p.chains?.includes("Solana"))
      .map((p) => ({
        name: p.name,
        slug: p.slug,
        category: p.category,
        tvlUsd: p.chainTvls?.Solana ?? p.tvl,
        change1d: p.change_1d ?? undefined,
        change7d: p.change_7d ?? undefined,
        logo: p.logo,
        url: p.url,
        twitter: p.twitter,
        description: p.description,
      }))
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
  });
}

export async function solanaChainTvl(): Promise<{ date: number; tvl: number }[]> {
  return cached("llama:chain:solana", 60 * 60_000, () =>
    fetchJson<{ date: number; tvl: number }[]>(`${config.llamaApi}/v2/historicalChainTvl/Solana`, { timeoutMs: 12000 }),
  );
}

export async function solanaDexVolume(): Promise<{ total24h?: number; protocols: { name: string; total24h?: number; change_1d?: number }[] }> {
  return cached("llama:dexs:solana", 15 * 60_000, () =>
    fetchJson(`${config.llamaApi}/overview/dexs/Solana?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, {
      timeoutMs: 12000,
    }),
  );
}

interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
}

const PROJECT_CATEGORY: [RegExp, DefiCategory][] = [
  [/marinade|jito|sanctum|blaze|jpool|lido|binance-staked|bybit-staked|helius-staked|infinity/i, "Liquid staking"],
  [/solayer|fragmetric|restak/i, "Restaking"],
  [/kamino-lend|marginfi|save|solend|drift|port|jupiter-lend|loopscale/i, "Lending"],
  [/drift|jupiter-perp|flash|zeta/i, "Perpetuals"],
  [/raydium|orca|meteora|lifinity|phoenix|saber/i, "Liquidity providing"],
  [/perena|usual|ethena|sky|ondo/i, "Stablecoins"],
];

function categorize(p: LlamaPool): DefiCategory {
  for (const [re, cat] of PROJECT_CATEGORY) if (re.test(p.project)) return cat;
  if (p.stablecoin) return "Stablecoins";
  return "Yield";
}

export async function solanaYields(): Promise<YieldPool[]> {
  return cached("llama:yields:solana", 15 * 60_000, async () => {
    const res = await fetchJson<{ data: LlamaPool[] }>(`${config.llamaYieldsApi}/pools`, { timeoutMs: 20000 });
    return res.data
      .filter((p) => p.chain === "Solana" && p.tvlUsd > 100_000)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, 400)
      .map((p) => ({
        id: p.pool,
        project: p.project,
        symbol: p.symbol,
        apy: p.apy ?? undefined,
        apyBase: p.apyBase ?? undefined,
        apyReward: p.apyReward ?? undefined,
        tvlUsd: p.tvlUsd,
        stablecoin: p.stablecoin,
        ilRisk: p.ilRisk,
        exposure: p.exposure,
        category: categorize(p),
      }));
  });
}
