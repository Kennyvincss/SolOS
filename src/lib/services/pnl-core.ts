// Pure PnL math (unit-tested). See services/pnl.ts for where the data comes from.
import type { ParsedTransaction } from "../providers/rpc";

const SOL_MINT = "So11111111111111111111111111111111111111112";
/** USD stablecoins: priced at $1 when they're one side of a swap. */
const USD_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", // PYUSD
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", // USD1
]);
const DAY = 86_400_000;

export interface Trade {
  time: number;
  mint: string;
  side: "buy" | "sell";
  qty: number;
  /** USD paid (buy) or received (sell). */
  usd: number;
}

export interface PnlWindow {
  realized: number;
  unrealized: number;
  total: number;
}

export interface PnlResult {
  available: true;
  d7: PnlWindow;
  d30: PnlWindow;
  all: PnlWindow;
  trades: number;
  txsAnalyzed: number;
  /** Oldest transaction looked at. */
  historyFrom?: number;
  /** False when the wallet has more history than was analyzed. */
  complete: boolean;
  /** Sold amounts that were never bought here (received by transfer/airdrop): no cost basis, left out. */
  unmatchedSells: number;
}

/** One swap from a parsed RPC transaction (see tradeFromDeltas). */
export function tradeFromTx(tx: ParsedTransaction, wallet: string, solPriceAt: (ms: number) => number | undefined): Trade | null {
  const meta = tx.meta;
  if (!meta || meta.err || !tx.blockTime) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const idx = keys.indexOf(wallet);
  const deltas = new Map<string, number>();
  const add = (mint: string, d: number) => deltas.set(mint, (deltas.get(mint) ?? 0) + d);

  if (idx >= 0) {
    let lamports = (meta.postBalances[idx] ?? 0) - (meta.preBalances[idx] ?? 0);
    if (idx === 0) lamports += meta.fee; // the fee isn't a trade
    add(SOL_MINT, lamports / 1e9);
  }
  const amount = (b: { uiTokenAmount: { uiAmount: number | null; uiAmountString?: string } }) => Number(b.uiTokenAmount.uiAmountString ?? b.uiTokenAmount.uiAmount ?? 0);
  for (const b of meta.preTokenBalances ?? []) if (b.owner === wallet) add(b.mint, -amount(b));
  for (const b of meta.postTokenBalances ?? []) if (b.owner === wallet) add(b.mint, amount(b));
  return tradeFromDeltas(deltas, tx.blockTime * 1000, solPriceAt);
}

/** A transaction as returned by Helius' Enhanced Transactions API (only the fields used here). */
export interface EnhancedTx {
  signature: string;
  timestamp: number;
  fee?: number;
  feePayer?: string;
  transactionError?: unknown;
  accountData?: {
    account: string;
    nativeBalanceChange?: number;
    tokenBalanceChanges?: { userAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  }[];
}

/** Same as tradeFromTx, from an Enhanced Transactions API record. */
export function tradeFromEnhanced(tx: EnhancedTx, wallet: string, solPriceAt: (ms: number) => number | undefined): Trade | null {
  if (tx.transactionError || !tx.timestamp) return null;
  const deltas = new Map<string, number>();
  const add = (mint: string, d: number) => deltas.set(mint, (deltas.get(mint) ?? 0) + d);
  for (const a of tx.accountData ?? []) {
    if (a.account === wallet && a.nativeBalanceChange) add(SOL_MINT, a.nativeBalanceChange / 1e9);
    for (const t of a.tokenBalanceChanges ?? []) {
      if (t.userAccount !== wallet) continue;
      const d = Number(t.rawTokenAmount.tokenAmount) / 10 ** (t.rawTokenAmount.decimals ?? 0);
      if (Number.isFinite(d)) add(t.mint, d);
    }
  }
  if (tx.feePayer === wallet && tx.fee) add(SOL_MINT, tx.fee / 1e9); // the fee isn't a trade
  return tradeFromDeltas(deltas, tx.timestamp * 1000, solPriceAt);
}

/**
 * One swap from the wallet's own balance changes in a transaction: exactly one
 * non-quote token moved one way and SOL/stablecoins moved the other way.
 * Token-for-token swaps are skipped (no USD side to price them).
 */
export function tradeFromDeltas(deltas: Map<string, number>, time: number, solPriceAt: (ms: number) => number | undefined): Trade | null {
  const legs = [...deltas.entries()].filter(([mint, d]) => Math.abs(d) > (mint === SOL_MINT ? 0.003 : 1e-9));
  const base = legs.filter(([m]) => m !== SOL_MINT && !USD_MINTS.has(m));
  if (base.length !== 1) return null;
  const [mint, d] = base[0];
  const quote = legs.filter(([m, q]) => (m === SOL_MINT || USD_MINTS.has(m)) && Math.sign(q) === -Math.sign(d));
  if (!quote.length) return null;
  let usd = 0;
  for (const [m, q] of quote) {
    if (m === SOL_MINT) {
      const p = solPriceAt(time);
      if (p === undefined) return null;
      usd += Math.abs(q) * p;
    } else usd += Math.abs(q);
  }
  if (!(usd > 0)) return null;
  return { time, mint, side: d > 0 ? "buy" : "sell", qty: Math.abs(d), usd };
}

const empty = (): PnlWindow => ({ realized: 0, unrealized: 0, total: 0 });

/**
 * FIFO lots per token. Realized PnL is booked at the time of each sale;
 * unrealized PnL is what's still held (capped at the current balance) marked
 * at today's price. The 7d/30d windows count sales in the window and the
 * unrealized gain on positions bought in the window.
 */
export function computePnl(
  trades: Trade[],
  prices: Map<string, number>,
  holdings: Map<string, number>,
  opts: { now: number; txsAnalyzed: number; historyFrom?: number; complete: boolean },
): PnlResult {
  const starts = { d7: opts.now - 7 * DAY, d30: opts.now - 30 * DAY };
  const out = { d7: empty(), d30: empty(), all: empty() };
  const lots = new Map<string, { qty: number; price: number; time: number }[]>();
  let unmatched = 0;

  for (const t of [...trades].sort((a, b) => a.time - b.time)) {
    const list = lots.get(t.mint) ?? [];
    lots.set(t.mint, list);
    const unit = t.usd / t.qty;
    if (t.side === "buy") {
      list.push({ qty: t.qty, price: unit, time: t.time });
      continue;
    }
    let left = t.qty;
    let realized = 0;
    while (left > 1e-12 && list.length) {
      const lot = list[0];
      const take = Math.min(lot.qty, left);
      realized += take * (unit - lot.price);
      lot.qty -= take;
      left -= take;
      if (lot.qty <= 1e-12) list.shift();
    }
    if (left > 1e-9) unmatched += left * unit;
    out.all.realized += realized;
    if (t.time >= starts.d30) out.d30.realized += realized;
    if (t.time >= starts.d7) out.d7.realized += realized;
  }

  for (const [mint, list] of lots) {
    const price = prices.get(mint);
    if (price === undefined || !list.length) continue;
    // Tokens may have been sent away: only count what the wallet still holds (newest lots).
    let held = holdings.get(mint) ?? 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const qty = Math.min(list[i].qty, held);
      held -= qty;
      if (qty <= 0) continue;
      const gain = qty * (price - list[i].price);
      out.all.unrealized += gain;
      if (list[i].time >= starts.d30) out.d30.unrealized += gain;
      if (list[i].time >= starts.d7) out.d7.unrealized += gain;
    }
  }
  for (const w of [out.d7, out.d30, out.all]) w.total = w.realized + w.unrealized;
  return {
    available: true,
    ...out,
    trades: trades.length,
    txsAnalyzed: opts.txsAnalyzed,
    historyFrom: opts.historyFrom,
    complete: opts.complete,
    unmatchedSells: unmatched,
  };
}
