import { config } from "../config";
import type { PricePoint } from "../types";
import { cached, fetchJson } from "./http";

/**
 * GeckoTerminal public API — used for price history (OHLCV) of any Solana
 * token by picking its most liquid pool.
 * Docs: https://apiguide.geckoterminal.com
 */

interface PoolsResponse {
  data: { id: string; attributes: { address: string; reserve_in_usd?: string; name?: string }; relationships?: { base_token?: { data?: { id: string } } } }[];
}

interface OhlcvResponse {
  data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } };
}

export type ChartRange = "1D" | "7D" | "30D" | "90D" | "1Y";

const RANGE: Record<ChartRange, { timeframe: "minute" | "hour" | "day"; aggregate: number; limit: number }> = {
  "1D": { timeframe: "minute", aggregate: 15, limit: 96 },
  "7D": { timeframe: "hour", aggregate: 1, limit: 168 },
  "30D": { timeframe: "hour", aggregate: 4, limit: 180 },
  "90D": { timeframe: "day", aggregate: 1, limit: 90 },
  "1Y": { timeframe: "day", aggregate: 1, limit: 365 },
};

async function topPool(mint: string): Promise<string | null> {
  return cached(`gt:pool:${mint}`, 30 * 60_000, async () => {
    const res = await fetchJson<PoolsResponse>(`${config.geckoTerminalApi}/networks/solana/tokens/${mint}/pools?page=1`, {
      headers: { accept: "application/json;version=20230302" },
    });
    // Prefer pools where the token is the base asset so prices are quoted in USD for it.
    const pools = res.data ?? [];
    const asBase = pools.filter((p) => p.relationships?.base_token?.data?.id === `solana_${mint}`);
    const pick = (asBase.length ? asBase : pools).sort(
      (a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0),
    )[0];
    return pick?.attributes.address ?? null;
  });
}

export async function priceHistory(mint: string, range: ChartRange): Promise<PricePoint[]> {
  const pool = await topPool(mint);
  if (!pool) return [];
  const r = RANGE[range];
  return cached(`gt:ohlcv:${pool}:${range}`, r.timeframe === "minute" ? 60_000 : 10 * 60_000, async () => {
    const res = await fetchJson<OhlcvResponse>(
      `${config.geckoTerminalApi}/networks/solana/pools/${pool}/ohlcv/${r.timeframe}?aggregate=${r.aggregate}&limit=${r.limit}&currency=usd&token=${mint}`,
      { headers: { accept: "application/json;version=20230302" } },
    );
    return (res.data?.attributes?.ohlcv_list ?? [])
      .map(([t, , , , close]) => ({ t: t * 1000, v: close }))
      .sort((a, b) => a.t - b.t);
  });
}
