import "server-only";
import type { AppMetrics, NewsItem, PredictionMarket, Protocol, Sourced, YieldPool } from "../types";
import { solanaDexVolume, solanaProtocols, solanaYields } from "../providers/defillama";
import { fetchNews } from "../providers/news";
import { demoMarkets, demoNews, demoProtocols, demoYields } from "../providers/demo";
import { withSource } from "../providers/source";
import { cached, fetchJson } from "../providers/http";
import { APPS } from "../catalog/apps";
import { getEpochInfo, getPrioritizationFees, getRecentPerformance } from "../providers/rpc";
import { liveOnly } from "../providers/source";

export async function protocols(): Promise<Sourced<Protocol[]>> {
  return withSource("DefiLlama", solanaProtocols, demoProtocols);
}

export async function yields(): Promise<Sourced<YieldPool[]>> {
  return withSource("DefiLlama Yields", solanaYields, demoYields);
}

export async function dexVolume() {
  return withSource("DefiLlama", solanaDexVolume, () => ({ total24h: undefined, protocols: [] }));
}

/** Map catalog apps to live DefiLlama metrics. Never invents metrics: unmatched apps get none. */
export async function appMetrics(): Promise<Sourced<Record<string, AppMetrics>>> {
  return withSource(
    "DefiLlama",
    async () => {
      const [list, vol] = await Promise.all([solanaProtocols(), solanaDexVolume().catch(() => ({ protocols: [] as { name: string; total24h?: number }[] }))]);
      const bySlug = new Map(list.map((p) => [p.slug, p]));
      const byName = new Map(list.map((p) => [p.name.toLowerCase(), p]));
      const volByName = new Map(vol.protocols.map((p) => [p.name.toLowerCase(), p.total24h]));
      const out: Record<string, AppMetrics> = {};
      for (const app of APPS) {
        if (!app.llama) continue;
        const matches = app.llama.map((s) => bySlug.get(s) ?? byName.get(s.toLowerCase())).filter(Boolean) as Protocol[];
        if (!matches.length) continue;
        // Parent names in `llama` can overlap children; sum distinct protocols.
        const uniq = [...new Map(matches.map((m) => [m.slug, m])).values()];
        const tvl = uniq.reduce((s, m) => s + (m.tvlUsd ?? 0), 0);
        const volume = uniq.reduce((s, m) => s + (volByName.get(m.name.toLowerCase()) ?? 0), 0);
        out[app.slug] = {
          tvlUsd: tvl || undefined,
          change1d: uniq[0].change1d,
          change7d: uniq[0].change7d,
          volume24h: volume || undefined,
          logo: uniq[0].logo,
          llamaCategory: uniq[0].category,
        };
      }
      return out;
    },
    // No demo metrics: we would rather show nothing than invented usage numbers.
    () => ({}),
  );
}

export async function news(): Promise<Sourced<NewsItem[]>> {
  return withSource("RSS feeds", fetchNews, demoNews);
}

/**
 * Prediction markets. There is no single public API for Solana prediction
 * markets, so a normalised adapter endpoint can be configured with
 * PREDICTION_MARKETS_URL returning `PredictionMarket[]`. Without it we show
 * demo markets, labelled as such.
 */
export async function predictionMarkets(): Promise<Sourced<PredictionMarket[]>> {
  const url = process.env.PREDICTION_MARKETS_URL;
  if (!url) {
    return {
      data: demoMarkets(),
      meta: { provider: "Demo dataset", mode: "demo", fetchedAt: new Date().toISOString(), note: "No prediction market provider configured (PREDICTION_MARKETS_URL)." },
    };
  }
  return withSource("Prediction markets adapter", () => cached("markets", 60_000, () => fetchJson<PredictionMarket[]>(url)), demoMarkets);
}

export interface NetworkStatus {
  slot: number;
  epoch: number;
  epochProgress: number;
  tps?: number;
  priorityFee: { p50: number; p75: number; p90: number };
}

export async function networkStatus(): Promise<Sourced<NetworkStatus>> {
  return liveOnly("Solana RPC", () =>
    cached("network:status", 10_000, async () => {
      const [epoch, perf, fees] = await Promise.all([getEpochInfo(), getRecentPerformance().catch(() => []), getPrioritizationFees().catch(() => [])]);
      const samples = perf.filter((p) => p.samplePeriodSecs > 0);
      const tps = samples.length ? samples.reduce((s, p) => s + p.numTransactions / p.samplePeriodSecs, 0) / samples.length : undefined;
      const sorted = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
      const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
      return {
        slot: epoch.absoluteSlot,
        epoch: epoch.epoch,
        epochProgress: epoch.slotIndex / epoch.slotsInEpoch,
        tps,
        priorityFee: { p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) },
      };
    }),
  );
}
