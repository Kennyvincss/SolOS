import { describe, expect, it } from "vitest";
import { computePnl, tradeFromEnhanced, tradeFromTx, type EnhancedTx, type Trade } from "@/lib/services/pnl-core";
import type { ParsedTransaction } from "@/lib/providers/rpc";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 28);
const W = "Wa11etAddress1111111111111111111111111111111";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";

const opts = { now: NOW, txsAnalyzed: 10, complete: true };

describe("computePnl", () => {
  it("books realized PnL at sale time and unrealized on what's still held", () => {
    const trades: Trade[] = [
      { time: NOW - 60 * DAY, mint: BONK, side: "buy", qty: 1000, usd: 100 }, // $0.10
      { time: NOW - 20 * DAY, mint: BONK, side: "sell", qty: 500, usd: 100 }, // $0.20 -> +50
      { time: NOW - 3 * DAY, mint: BONK, side: "buy", qty: 500, usd: 150 }, // $0.30
      { time: NOW - 1 * DAY, mint: BONK, side: "sell", qty: 200, usd: 80 }, // $0.40 FIFO from $0.10 lot -> +60
    ];
    const r = computePnl(trades, new Map([[BONK, 0.5]]), new Map([[BONK, 800]]), opts);
    expect(r.all.realized).toBeCloseTo(110);
    // Held: 300 @0.10 (+120) and 500 @0.30 (+100)
    expect(r.all.unrealized).toBeCloseTo(220);
    expect(r.all.total).toBeCloseTo(330);
    expect(r.d30.realized).toBeCloseTo(110);
    expect(r.d7.realized).toBeCloseTo(60);
    expect(r.d7.unrealized).toBeCloseTo(100); // only the lot bought 3 days ago
    expect(r.d30.unrealized).toBeCloseTo(100);
  });

  it("caps unrealized at the current balance and leaves out sales with no known cost", () => {
    const trades: Trade[] = [
      { time: NOW - 10 * DAY, mint: BONK, side: "buy", qty: 100, usd: 10 },
      { time: NOW - 5 * DAY, mint: BONK, side: "sell", qty: 300, usd: 60 }, // 200 came from elsewhere
    ];
    const r = computePnl(trades, new Map([[BONK, 1]]), new Map([[BONK, 0]]), opts);
    expect(r.all.realized).toBeCloseTo(10); // 100 * (0.2 - 0.1)
    expect(r.unmatchedSells).toBeCloseTo(40);
    expect(r.all.unrealized).toBe(0);
  });
});

describe("tradeFromTx", () => {
  const tx = (sol: [number, number], tokens: { mint: string; pre: number; post: number }[], fee = 5000): ParsedTransaction => ({
    slot: 1,
    blockTime: Math.floor((NOW - DAY) / 1000),
    meta: {
      err: null,
      fee,
      preBalances: [sol[0]],
      postBalances: [sol[1]],
      preTokenBalances: tokens.map((t, i) => ({ accountIndex: i + 1, mint: t.mint, owner: W, uiTokenAmount: { amount: "0", decimals: 6, uiAmount: t.pre, uiAmountString: String(t.pre) } })),
      postTokenBalances: tokens.map((t, i) => ({ accountIndex: i + 1, mint: t.mint, owner: W, uiTokenAmount: { amount: "0", decimals: 6, uiAmount: t.post, uiAmountString: String(t.post) } })),
    },
    transaction: { signatures: ["s"], message: { accountKeys: [{ pubkey: W, signer: true, writable: true }], instructions: [] } },
  });

  it("reads a SOL -> token buy priced at the day's SOL price", () => {
    const t = tradeFromTx(tx([2_000_000_000, 1_000_000_000 - 5000], [{ mint: BONK, pre: 0, post: 1_000_000 }]), W, () => 150);
    expect(t).toMatchObject({ mint: BONK, side: "buy", qty: 1_000_000 });
    expect(t!.usd).toBeCloseTo(150);
  });

  it("reads a token -> USDC sell", () => {
    const t = tradeFromTx(tx([1e9, 1e9 - 5000], [{ mint: BONK, pre: 500, post: 0 }, { mint: USDC, pre: 0, post: 42 }]), W, () => 150);
    expect(t).toMatchObject({ mint: BONK, side: "sell", qty: 500, usd: 42 });
  });

  it("ignores transfers and token-for-token swaps", () => {
    expect(tradeFromTx(tx([1e9, 1e9 - 5000], [{ mint: BONK, pre: 0, post: 10 }]), W, () => 150)).toBeNull();
    const other = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
    expect(tradeFromTx(tx([1e9, 1e9 - 5000], [{ mint: BONK, pre: 10, post: 0 }, { mint: other, pre: 0, post: 5 }]), W, () => 150)).toBeNull();
    expect(SOL).toBeTruthy();
  });
});

describe("tradeFromEnhanced (Helius)", () => {
  const W = "Wallet1111111111111111111111111111111111111";
  const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const sol = () => 150;
  it("reads a SOL → token buy, ignoring the fee", () => {
    const tx: EnhancedTx = {
      signature: "s1",
      timestamp: 1_700_000_000,
      fee: 5000,
      feePayer: W,
      accountData: [
        { account: W, nativeBalanceChange: -1_000_005_000 },
        { account: "BonkAta", tokenBalanceChanges: [{ userAccount: W, mint: BONK, rawTokenAmount: { tokenAmount: "5000000000", decimals: 5 } }] },
      ],
    };
    expect(tradeFromEnhanced(tx, W, sol)).toEqual({ time: 1_700_000_000_000, mint: BONK, side: "buy", qty: 50_000, usd: 150 });
  });
  it("reads a token → USDC sell and skips failed transactions", () => {
    const tx: EnhancedTx = {
      signature: "s2",
      timestamp: 1_700_000_100,
      feePayer: "someone-else",
      accountData: [
        { account: "a", tokenBalanceChanges: [{ userAccount: W, mint: BONK, rawTokenAmount: { tokenAmount: "-2500000000", decimals: 5 } }] },
        { account: "b", tokenBalanceChanges: [{ userAccount: W, mint: USDC, rawTokenAmount: { tokenAmount: "80000000", decimals: 6 } }] },
      ],
    };
    expect(tradeFromEnhanced(tx, W, sol)).toMatchObject({ mint: BONK, side: "sell", qty: 25_000, usd: 80 });
    expect(tradeFromEnhanced({ ...tx, transactionError: { InstructionError: [0, "x"] } }, W, sol)).toBeNull();
  });
});
