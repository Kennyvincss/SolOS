import { config } from "../config";
import type { Token } from "../types";
import { cached, fetchJson } from "./http";

/**
 * Jupiter Tokens API v2 + Price API v3.
 * Docs: https://dev.jup.ag/docs/token-api and https://dev.jup.ag/docs/price-api
 */

interface JupStats {
  priceChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  numBuys?: number;
  numSells?: number;
  numTraders?: number;
}

export interface JupToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals?: number;
  twitter?: string;
  website?: string;
  circSupply?: number;
  totalSupply?: number;
  tokenProgram?: string;
  launchpad?: string;
  firstPool?: { id: string; createdAt: string };
  holderCount?: number;
  audit?: { mintAuthorityDisabled?: boolean; freezeAuthorityDisabled?: boolean; topHoldersPercentage?: number; isSus?: boolean };
  organicScore?: number;
  isVerified?: boolean;
  tags?: string[];
  fdv?: number;
  mcap?: number;
  usdPrice?: number;
  liquidity?: number;
  stats1h?: JupStats;
  stats24h?: JupStats;
  stats7d?: JupStats;
  stats30d?: JupStats;
}

function headers(): Record<string, string> {
  return config.jupiterApiKey ? { "x-api-key": config.jupiterApiKey } : {};
}

export function mapJupToken(t: JupToken): Token {
  const vol = (s?: JupStats) => (s ? (s.buyVolume ?? 0) + (s.sellVolume ?? 0) : undefined);
  return {
    mint: t.id,
    symbol: t.symbol,
    name: t.name,
    icon: t.icon,
    decimals: t.decimals,
    priceUsd: t.usdPrice,
    change1h: t.stats1h?.priceChange,
    change24h: t.stats24h?.priceChange,
    change7d: t.stats7d?.priceChange,
    change30d: t.stats30d?.priceChange,
    marketCap: t.mcap,
    fdv: t.fdv,
    volume24h: vol(t.stats24h),
    liquidity: t.liquidity,
    holders: t.holderCount,
    circulatingSupply: t.circSupply,
    totalSupply: t.totalSupply,
    verified: t.isVerified,
    tags: t.tags,
    launchpad: t.launchpad,
    createdAt: t.firstPool?.createdAt,
    audit: t.audit,
    website: t.website,
    twitter: t.twitter,
  };
}

export async function jupSearch(query: string): Promise<Token[]> {
  const q = query.trim();
  if (!q) return [];
  return cached(`jup:search:${q.toLowerCase()}`, 60_000, async () => {
    const res = await fetchJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/search?query=${encodeURIComponent(q)}`, {
      headers: headers(),
      timeoutMs: 6000,
    });
    return res.map(mapJupToken);
  });
}

/** Look up many mints at once (the search endpoint accepts comma separated mints, max 100). */
export async function jupTokensByMint(mints: string[]): Promise<Map<string, Token>> {
  const out = new Map<string, Token>();
  const unique = [...new Set(mints)];
  // Search returns a limited number of results per request, so ask for a few mints at a time.
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 20) chunks.push(unique.slice(i, i + 20));
  let failures = 0;
  for (let i = 0; i < chunks.length; i += 5) {
    await Promise.all(
      chunks.slice(i, i + 5).map(async (chunk) => {
        try {
          const res = await cached(`jup:mints:${chunk.join(",")}`, 60_000, () =>
            fetchJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/search?query=${chunk.join(",")}`, { headers: headers() }),
          );
          for (const t of res) out.set(t.id, mapJupToken(t));
        } catch (e) {
          failures++;
          if (failures === chunks.length) throw e;
        }
      }),
    );
  }
  if (failures && failures === chunks.length) throw new Error("token data unavailable");
  return out;
}

export type JupCategory = "toptrending" | "toptraded" | "toporganicscore";
export type JupInterval = "5m" | "1h" | "6h" | "24h";

export async function jupCategory(category: JupCategory, interval: JupInterval = "24h", limit = 50): Promise<Token[]> {
  return cached(`jup:cat:${category}:${interval}:${limit}`, 60_000, async () => {
    const res = await fetchJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/${category}/${interval}?limit=${limit}`, {
      headers: headers(),
    });
    return res.map(mapJupToken);
  });
}

export async function jupRecent(limit = 30): Promise<Token[]> {
  return cached(`jup:recent:${limit}`, 60_000, async () => {
    const res = await fetchJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/recent?limit=${limit}`, { headers: headers() });
    return res.map(mapJupToken);
  });
}

export async function jupTag(tag: "verified" | "lst", limit = 200): Promise<Token[]> {
  return cached(`jup:tag:${tag}`, 10 * 60_000, async () => {
    const res = await fetchJson<JupToken[]>(`${config.jupiterApi}/tokens/v2/tag?query=${tag}`, { headers: headers() });
    return res.slice(0, limit).map(mapJupToken);
  });
}

export async function jupPrices(mints: string[]): Promise<Map<string, { usdPrice: number; priceChange24h?: number }>> {
  const out = new Map<string, { usdPrice: number; priceChange24h?: number }>();
  const unique = [...new Set(mints)];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const res = await cached(`jup:price:${chunk.join(",")}`, 30_000, () =>
      fetchJson<Record<string, { usdPrice: number; priceChange24h?: number } | null>>(
        `${config.jupiterApi}/price/v3?ids=${chunk.join(",")}`,
        { headers: headers() },
      ),
    );
    for (const [k, v] of Object.entries(res)) if (v && typeof v.usdPrice === "number") out.set(k, v);
  }
  return out;
}
