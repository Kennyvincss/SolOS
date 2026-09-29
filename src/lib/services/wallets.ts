import "server-only";
import type { ActivityItem, Holding, HoldingKind, Portfolio, Sourced, Token } from "../types";
import { getBalanceLamports, getSignatures, getTokenAccounts, getTransaction, rpc } from "../providers/rpc";
import { jupPrices, jupTokensByMint } from "../providers/jupiter";
import { demoActivity, demoPortfolio, isDemoWallet } from "../providers/demo";
import { liveOnly } from "../providers/source";
import { KNOWN_MINTS, LAMPORTS_PER_SOL, SOL_MINT, STABLE_SYMBOLS } from "../solana/constants";
import { explainTransaction, renderHeadline } from "../solana/explain";

const PNL_REASON =
  "PnL needs each asset's historical cost basis. Solana RPC only exposes current balances, so PnL is shown once an indexer provider (e.g. Helius, Birdeye) is configured.";

function kindFor(mint: string, symbol: string | undefined, tags: string[] | undefined): HoldingKind {
  const known = KNOWN_MINTS[mint]?.kind;
  if (known) return known;
  if (tags?.includes("lst")) return "lst";
  if (symbol && STABLE_SYMBOLS.has(symbol)) return "stable";
  if (tags?.some((t) => t === "rwa" || t === "tokenized-stock")) return "rwa";
  return "token";
}

const STAKE_PROGRAM = "Stake11111111111111111111111111111111111111";
/** SOL staked natively: stake accounts whose withdraw authority is this wallet. */
async function nativeStakeLamports(address: string): Promise<number> {
  try {
    const accounts = await rpc<{ account: { lamports: number } }[]>(
      "getProgramAccounts",
      [STAKE_PROGRAM, { encoding: "base64", dataSlice: { offset: 0, length: 0 }, filters: [{ memcmp: { offset: 44, bytes: address } }] }],
      8000,
    );
    return (accounts ?? []).reduce((s, a) => s + (a.account?.lamports ?? 0), 0);
  } catch {
    return 0; // some RPCs don't allow this query; staked SOL is then left out
  }
}

export async function getPortfolio(address: string): Promise<Sourced<Portfolio>> {
  if (isDemoWallet(address)) {
    return { data: demoPortfolio(), meta: { provider: "Demo dataset", mode: "demo", fetchedAt: new Date().toISOString(), note: "Demo wallet" } };
  }
  const res = await liveOnly("Solana RPC", async () => {
    const [lamports, accounts, stakedLamports] = await Promise.all([getBalanceLamports(address), getTokenAccounts(address), nativeStakeLamports(address)]);
    const sol = lamports / LAMPORTS_PER_SOL;

    // Aggregate token accounts per mint (a wallet can hold several accounts of one mint).
    const byMint = new Map<string, { amount: number; decimals: number; program: "spl-token" | "token-2022" }>();
    for (const a of accounts) {
      const info = a.account.data.parsed.info;
      const amt = Number(info.tokenAmount.uiAmountString ?? info.tokenAmount.uiAmount ?? 0);
      if (!amt) continue;
      const cur = byMint.get(info.mint);
      if (cur) cur.amount += amt;
      else byMint.set(info.mint, { amount: amt, decimals: info.tokenAmount.decimals, program: a.program });
    }

    let meta = new Map<string, Token>();
    let pricingNote: string | undefined;
    const fungible = [SOL_MINT, ...[...byMint.keys()].filter((m) => byMint.get(m)!.decimals > 0)];
    // Names and logos from token search; prices from the price API, which answers for every mint.
    const [metaRes, priceRes] = await Promise.allSettled([jupTokensByMint(fungible), jupPrices(fungible)]);
    if (metaRes.status === "fulfilled") meta = metaRes.value;
    const prices = priceRes.status === "fulfilled" ? priceRes.value : new Map<string, { usdPrice: number; priceChange24h?: number }>();
    if (metaRes.status === "rejected" && !prices.size) pricingNote = "Prices unavailable right now";
    for (const [mint, p] of prices) {
      const t = meta.get(mint);
      meta.set(mint, { ...(t ?? { mint, symbol: KNOWN_MINTS[mint]?.symbol ?? "", name: KNOWN_MINTS[mint]?.name ?? "" }), priceUsd: p.usdPrice, change24h: p.priceChange24h ?? t?.change24h } as Token);
    }

    const holdings: Holding[] = [];
    const nfts: Holding[] = [];
    const solMeta = meta.get(SOL_MINT);
    holdings.push({
      mint: SOL_MINT,
      symbol: "SOL",
      name: "Solana",
      icon: solMeta?.icon,
      amount: sol,
      decimals: 9,
      priceUsd: solMeta?.priceUsd,
      valueUsd: solMeta?.priceUsd !== undefined ? solMeta.priceUsd * sol : undefined,
      change24h: solMeta?.change24h,
      kind: "sol",
    });
    if (stakedLamports > 0) {
      const staked = stakedLamports / LAMPORTS_PER_SOL;
      holdings.push({
        mint: "native-stake",
        symbol: "SOL",
        name: "Staked SOL (native)",
        icon: solMeta?.icon,
        amount: staked,
        decimals: 9,
        priceUsd: solMeta?.priceUsd,
        valueUsd: solMeta?.priceUsd !== undefined ? solMeta.priceUsd * staked : undefined,
        change24h: solMeta?.change24h,
        kind: "lst",
      });
    }
    for (const [mint, v] of byMint) {
      const t = meta.get(mint);
      const known = KNOWN_MINTS[mint];
      const h: Holding = {
        mint,
        symbol: t?.symbol ?? known?.symbol,
        name: t?.name ?? known?.name,
        icon: t?.icon,
        amount: v.amount,
        decimals: v.decimals,
        priceUsd: t?.priceUsd,
        valueUsd: t?.priceUsd !== undefined ? t.priceUsd * v.amount : undefined,
        change24h: t?.change24h,
        kind: kindFor(mint, t?.symbol ?? known?.symbol, t?.tags),
        tokenProgram: v.program,
      };
      if (v.decimals === 0 && v.amount === 1 && !t) nfts.push({ ...h, kind: "nft" });
      else holdings.push(h);
    }
    holdings.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1) || b.amount - a.amount);
    const priced = holdings.filter((h) => h.valueUsd !== undefined);
    const total = priced.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    const prevTotal = priced.reduce((s, h) => s + (h.valueUsd ?? 0) / (1 + (h.change24h ?? 0) / 100), 0);
    const portfolio: Portfolio = {
      address,
      solBalance: sol,
      totalUsd: priced.length ? total : undefined,
      change24hPct: prevTotal ? ((total - prevTotal) / prevTotal) * 100 : undefined,
      holdings,
      nfts,
      unpricedCount: holdings.length - priced.length,
      pnl: { available: false, reason: PNL_REASON },
    };
    return { portfolio, pricingNote };
  });
  return {
    data: res.data.portfolio,
    meta: { ...res.meta, provider: "Solana RPC + Jupiter prices", note: res.data.pricingNote },
  };
}

export async function getActivity(address: string, limit = 15, viewer?: string): Promise<Sourced<ActivityItem[]>> {
  if (isDemoWallet(address)) {
    return { data: demoActivity(), meta: { provider: "Demo dataset", mode: "demo", fetchedAt: new Date().toISOString(), note: "Demo wallet" } };
  }
  return liveOnly("Solana RPC", async () => {
    const sigs = await getSignatures(address, limit);
    // Parse the most recent ones in full; older ones are listed with basic info only.
    const detailed = await Promise.all(
      sigs.slice(0, 10).map((s) =>
        getTransaction(s.signature)
          .then((tx) => (tx ? explainTransaction(s.signature, tx) : null))
          .catch(() => null),
      ),
    );
    return sigs.map((s, i): ActivityItem => {
      const ex = detailed[i];
      if (ex) {
        // Describe from the viewed wallet's perspective when it is not the fee payer.
        const mine = ex.balanceChanges.filter((c) => c.owner === address);
        let summary = renderHeadline(ex.headline, ex.feePayer, viewer);
        if (ex.feePayer !== address && mine.length) {
          const parts = mine.map((c) => `${c.change > 0 ? "+" : ""}${Number(c.change.toPrecision(6))} ${c.symbol}`);
          summary = `${parts.join(", ")} · ${summary}`;
        }
        return {
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? undefined,
          status: ex.status,
          kind: ex.kind,
          summary,
          programs: ex.programs.filter((p) => p.known && !["Compute Budget", "System Program"].includes(p.name)),
          fee: ex.feeSol,
        };
      }
      return {
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ?? undefined,
        status: s.err ? "failed" : "success",
        kind: s.err ? "failed" : "unknown",
        summary: s.memo ? `Memo: ${s.memo}` : "Transaction (open for details)",
        programs: [],
      };
    });
  });
}
