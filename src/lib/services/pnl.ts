import "server-only";
import { config, PUBLIC_RPC } from "../config";
import { cached } from "../providers/http";
import { customRpcRejected, getSignatures, rpcBatch, type ParsedTransaction } from "../providers/rpc";
import { priceHistory } from "../providers/geckoterminal";
import { SOL_MINT } from "../solana/constants";
import { computePnl, tradeFromTx, type PnlResult } from "./pnl-core";

export type { PnlResult } from "./pnl-core";

const DAY = 86_400_000;

/**
 * Trading PnL for a wallet, reconstructed from its own swaps on-chain:
 * each swap against SOL or a USD stablecoin is priced at that day's SOL price,
 * positions use average cost, and current holdings are marked at today's price.
 */
export async function walletPnl(address: string, currentPrices: Map<string, number>, holdings: Map<string, number>): Promise<PnlResult> {
  const fast = config.rpcUrl !== PUBLIC_RPC && !customRpcRejected();
  // The public RPC is slow and rate-limited: look at less history there.
  const maxTx = fast ? 600 : 150;
  return cached(`pnl:${address}:${maxTx}`, 5 * 60_000, async () => {
    // 1) Signatures, newest first, up to a year back.
    const sigs: { signature: string; blockTime: number | null; err: unknown }[] = [];
    let before: string | undefined;
    while (sigs.length < maxTx) {
      const page = await getSignatures(address, Math.min(1000, maxTx - sigs.length), before);
      if (!page.length) break;
      sigs.push(...page);
      before = page[page.length - 1].signature;
      const oldest = page[page.length - 1].blockTime;
      if (page.length < 1000 || (oldest && Date.now() - oldest * 1000 > 365 * DAY)) break;
    }
    const ok = sigs.filter((s) => !s.err);

    // 2) Transactions in batches.
    const txs: ParsedTransaction[] = [];
    const size = fast ? 50 : 20;
    for (let i = 0; i < ok.length; i += size) {
      const chunk = ok.slice(i, i + size);
      const res = await rpcBatch<ParsedTransaction>(
        chunk.map((s) => ({ method: "getTransaction", params: [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] })),
      ).catch(() => []);
      for (const t of res) if (t) txs.push(t);
    }

    // 3) SOL price by day (for swaps against SOL).
    const solDaily = await priceHistory(SOL_MINT, "1Y").catch(() => []);
    const solPriceAt = (ms: number) => {
      if (!solDaily.length) return currentPrices.get(SOL_MINT);
      let best = solDaily[0];
      for (const p of solDaily) if (Math.abs(p.t - ms) < Math.abs(best.t - ms)) best = p;
      return best.v;
    };

    const trades = txs.map((t) => tradeFromTx(t, address, solPriceAt)).filter((t): t is NonNullable<typeof t> => t !== null);
    const oldest = sigs.length ? sigs[sigs.length - 1].blockTime : null;
    return computePnl(trades, currentPrices, holdings, {
      now: Date.now(),
      txsAnalyzed: txs.length,
      historyFrom: oldest ? oldest * 1000 : undefined,
      complete: sigs.length < maxTx,
    });
  });
}
