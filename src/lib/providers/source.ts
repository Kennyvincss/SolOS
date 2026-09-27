import { config } from "../config";
import type { Sourced } from "../types";
import { UpstreamError } from "./http";

/**
 * Run a live provider and, depending on DATA_MODE, fall back to demo data.
 * The returned `meta.mode` is what the UI uses to show the "Demo data" badge,
 * so mock values can never be mistaken for on-chain or market data.
 */
export async function withSource<T>(
  provider: string,
  live: () => Promise<T>,
  demo: (() => T | Promise<T>) | null,
): Promise<Sourced<T>> {
  const now = () => new Date().toISOString();
  if (config.dataMode === "demo" && demo) {
    return { data: await demo(), meta: { provider: "Demo dataset", mode: "demo", fetchedAt: now(), note: "DATA_MODE=demo" } };
  }
  try {
    return { data: await live(), meta: { provider, mode: "live", fetchedAt: now() } };
  } catch (err) {
    if (config.dataMode === "live" || !demo) throw err;
    const reason = err instanceof UpstreamError ? err.message : err instanceof Error ? err.message : "unknown error";
    if (!config.isProd) console.warn(`[solana-os] ${provider} unavailable (${reason}); serving demo data`);
    return {
      data: await demo(),
      meta: { provider: "Demo dataset", mode: "demo", fetchedAt: now(), note: `${provider} unavailable: ${reason}` },
    };
  }
}

/** A provider result with no demo equivalent (e.g. a specific wallet or signature). */
export async function liveOnly<T>(provider: string, live: () => Promise<T>): Promise<Sourced<T>> {
  return withSource(provider, live, null);
}
