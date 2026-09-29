import { after } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { getPortfolio } from "@/lib/services/wallets";
import { walletPnl, type PnlResult } from "@/lib/services/pnl";
import { readJson, syncConfigured, writeJson } from "@/lib/sync-store";

export const maxDuration = 60;

const SAVED_MS = 10 * 60_000;
const savedKey = (a: string) => `pnl:v2:${a}`;
const lockKey = (a: string) => `pnl:v2:lock:${a}`;
type Saved = PnlResult & { at: number };

/**
 * 7d / 30d / all-time trading PnL from the wallet's on-chain swaps.
 * Answers fast from the most recent trades; when there's more history, it keeps
 * reading after the response and saves the full result for the next request
 * (the page asks again while `refining` is true).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (!isAddress(address)) return fail("Invalid Solana address");
    const shared = syncConfigured();

    if (shared) {
      const saved = await readJson<Saved>(savedKey(address)).catch(() => null);
      if (saved && Date.now() - saved.at < SAVED_MS) return ok({ ...saved, refining: false });
    }

    const { data: p } = await getPortfolio(address);
    const prices = new Map<string, number>();
    const holdings = new Map<string, number>();
    for (const h of p.holdings) {
      if (h.priceUsd !== undefined) prices.set(h.mint, h.priceUsd);
      holdings.set(h.mint, h.amount);
    }

    const quick = await walletPnl(address, prices, holdings, { budgetMs: 12_000 });
    if (!shared) return ok({ ...quick, refining: false }, 120);
    if (quick.complete) {
      await writeJson(savedKey(address), { ...quick, at: Date.now() }, SAVED_MS / 1000).catch(() => {});
      return ok({ ...quick, refining: false });
    }

    // More history to read: finish it after responding (once per wallet at a time).
    const running = await readJson<number>(lockKey(address)).catch(() => null);
    if (!running) {
      await writeJson(lockKey(address), Date.now(), 70).catch(() => {});
      after(async () => {
        try {
          const full = await walletPnl(address, prices, holdings, { budgetMs: 38_000, gentle: true });
          await writeJson(savedKey(address), { ...full, at: Date.now() }, SAVED_MS / 1000);
        } catch {
          /* the quick result stands; the next visit tries again */
        }
      });
    }
    return ok({ ...quick, refining: true });
  });
}
