import "server-only";
import { config, PUBLIC_RPC } from "../config";
import { cached } from "../providers/http";
import { UpstreamError } from "../providers/http";
import { customRpcRejected, getSignatures, rpc, rpcBatch, type ParsedTransaction } from "../providers/rpc";
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
export async function walletPnl(address: string, currentPrices: Map<string, number>, holdings: Map<string, number>, opts: { budgetMs?: number } = {}): Promise<PnlResult> {
  const fast = config.rpcUrl !== PUBLIC_RPC && !customRpcRejected();
  // The public RPC is slow and rate-limited: look at less history there.
  const maxTx = fast ? 600 : 100;
  const budget = opts.budgetMs ?? 40_000;
  return cached(`pnl:${address}:${maxTx}:${budget}`, 5 * 60_000, async () => {
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

    // 2) Transactions (batched when the RPC allows it, one by one otherwise).
    const deadline = Date.now() + budget;
    const { txs, attempted } = await fetchTransactions(
      ok.map((s) => s.signature),
      fast,
      deadline,
    );
    if (ok.length && !txs.length) throw new UpstreamError("Couldn't load this wallet's trades right now.");

    // 3) SOL price by day (for swaps against SOL).
    const solDaily = await priceHistory(SOL_MINT, "1Y").catch(() => []);
    const solPriceAt = (ms: number) => {
      if (!solDaily.length) return currentPrices.get(SOL_MINT);
      let best = solDaily[0];
      for (const p of solDaily) if (Math.abs(p.t - ms) < Math.abs(best.t - ms)) best = p;
      return best.v;
    };

    const trades = txs.map((t) => tradeFromTx(t, address, solPriceAt)).filter((t): t is NonNullable<typeof t> => t !== null);
    // History covers the transactions actually read (newest first).
    const oldest = attempted ? ok[attempted - 1].blockTime : null;
    return computePnl(trades, currentPrices, holdings, {
      now: Date.now(),
      txsAnalyzed: txs.length,
      historyFrom: oldest ? oldest * 1000 : undefined,
      complete: sigs.length < maxTx && attempted === ok.length,
    });
  });
}

const TX_PARAMS = { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Many RPCs (including the free public one) refuse JSON-RPC batches, so try a
 * batch first and switch to single requests (a few at a time, with retries on
 * rate limits) when batches come back empty. Stops at the deadline; returns how
 * many signatures were covered so the caller can report partial history.
 */
async function fetchTransactions(signatures: string[], fast: boolean, deadline: number): Promise<{ txs: ParsedTransaction[]; attempted: number }> {
  const txs: ParsedTransaction[] = [];
  let i = 0;
  let batches = true;
  const size = fast ? 50 : 20;
  while (batches && i < signatures.length && Date.now() < deadline) {
    const chunk = signatures.slice(i, i + size);
    const res = await rpcBatch<ParsedTransaction>(chunk.map((sig) => ({ method: "getTransaction", params: [sig, TX_PARAMS] }))).catch(() => null);
    const got = (res ?? []).filter((t): t is ParsedTransaction => Boolean(t));
    if (!got.length) {
      batches = false; // retry this chunk one by one
      break;
    }
    txs.push(...got);
    i += chunk.length;
  }
  if (batches) return { txs, attempted: i };

  const one = async (sig: string): Promise<ParsedTransaction | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await rpc<ParsedTransaction | null>("getTransaction", [sig, TX_PARAMS], 8000);
      } catch (e) {
        const limited = e instanceof UpstreamError && (e.status === 429 || e.status === -32429 || /rate|too many/i.test(e.message));
        if (!limited || Date.now() > deadline) return null;
        await sleep(600 * (attempt + 1));
      }
    }
    return null;
  };
  // The public RPC allows about 40 getTransaction calls per 10 s: pace to 4/s there.
  const concurrency = fast ? 10 : 4;
  const minRoundMs = fast ? 0 : 1000;
  while (i < signatures.length && Date.now() < deadline) {
    const chunk = signatures.slice(i, i + concurrency);
    const started = Date.now();
    const res = await Promise.all(chunk.map(one));
    const wait = minRoundMs - (Date.now() - started);
    if (wait > 0 && i + chunk.length < signatures.length) await sleep(wait);
    for (const t of res) if (t) txs.push(t);
    i += chunk.length;
  }
  return { txs, attempted: i };
}
