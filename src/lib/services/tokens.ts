import "server-only";
import type { PricePoint, Sourced, Token, TokenHolder } from "../types";
import { jupCategory, jupRecent, jupSearch, jupTokensByMint, type JupInterval } from "../providers/jupiter";
import { priceHistory, type ChartRange } from "../providers/geckoterminal";
import { demoHistory, demoSearchTokens, demoToken, demoTokens } from "../providers/demo";
import { getLargestAccounts, getMultipleAccounts, getTokenSupply } from "../providers/rpc";
import { liveOnly, withSource } from "../providers/source";
import { isAddress } from "../solana/address";

export async function searchTokens(q: string): Promise<Sourced<Token[]>> {
  return withSource("Jupiter Tokens API", () => jupSearch(q), () => demoSearchTokens(q));
}

export async function getToken(idOrSymbol: string): Promise<Sourced<Token | null>> {
  return withSource(
    "Jupiter Tokens API",
    async () => {
      if (isAddress(idOrSymbol)) {
        const m = await jupTokensByMint([idOrSymbol]);
        return m.get(idOrSymbol) ?? null;
      }
      // Symbol lookup: prefer verified exact-symbol matches with the most liquidity.
      const res = await jupSearch(idOrSymbol);
      const exact = res.filter((t) => t.symbol.toLowerCase() === idOrSymbol.toLowerCase());
      const pool = exact.length ? exact : res;
      return pool.sort((a, b) => Number(b.verified ?? 0) - Number(a.verified ?? 0) || (b.liquidity ?? 0) - (a.liquidity ?? 0))[0] ?? null;
    },
    () => demoToken(idOrSymbol) ?? demoTokens().find((t) => t.symbol.toLowerCase() === idOrSymbol.toLowerCase()) ?? null,
  );
}

export async function trendingTokens(interval: JupInterval = "24h", limit = 30): Promise<Sourced<Token[]>> {
  return withSource("Jupiter Tokens API", () => jupCategory("toptrending", interval, limit), () => demoTokens().filter((t) => !t.tags?.includes("stable")).sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0)).slice(0, limit));
}

export async function topTradedTokens(interval: JupInterval = "24h", limit = 30): Promise<Sourced<Token[]>> {
  return withSource(
    "Jupiter Tokens API",
    () => jupCategory("toptraded", interval, limit),
    () => [...demoTokens()].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, limit),
  );
}

export async function organicTokens(interval: JupInterval = "24h", limit = 30): Promise<Sourced<Token[]>> {
  return withSource("Jupiter Tokens API", () => jupCategory("toporganicscore", interval, limit), () => demoTokens().slice(0, limit));
}

export async function newTokens(limit = 30): Promise<Sourced<Token[]>> {
  return withSource("Jupiter Tokens API", () => jupRecent(limit), () => []);
}

/** Biggest movers among liquid, actively traded tokens (filters out illiquid noise). */
export async function movers(): Promise<Sourced<{ gainers: Token[]; losers: Token[] }>> {
  const traded = await topTradedTokens("24h", 100);
  const liquid = traded.data.filter((t) => (t.liquidity ?? 0) > 250_000 && t.change24h !== undefined);
  const sorted = [...liquid].sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
  return {
    data: { gainers: sorted.slice(0, 10), losers: sorted.slice(-10).reverse() },
    meta: traded.meta,
  };
}

export async function tokenHistory(mint: string, range: ChartRange): Promise<Sourced<PricePoint[]>> {
  return withSource("GeckoTerminal", () => priceHistory(mint, range), () => demoHistory(mint, range));
}

export async function topHolders(mint: string): Promise<Sourced<TokenHolder[]>> {
  return liveOnly("Solana RPC", async () => {
    const [largest, supply] = await Promise.all([getLargestAccounts(mint), getTokenSupply(mint)]);
    const total = supply.uiAmount ?? 0;
    const accounts = await getMultipleAccounts(largest.map((l) => l.address)).catch(() => []);
    return largest.map((l, i) => {
      const acc = accounts[i];
      const parsed = acc && !Array.isArray(acc.data) ? acc.data.parsed : undefined;
      const owner = (parsed?.info?.owner as string | undefined) ?? l.address;
      const amount = l.uiAmount ?? 0;
      return { address: owner, amount, percentage: total ? (amount / total) * 100 : undefined };
    });
  });
}

export async function tokensByMints(mints: string[]): Promise<Sourced<Token[]>> {
  const valid = mints.filter(isAddress).slice(0, 100);
  return withSource(
    "Jupiter Tokens API",
    async () => {
      const m = await jupTokensByMint(valid);
      return valid.map((x) => m.get(x)).filter(Boolean) as Token[];
    },
    () => valid.map((x) => demoToken(x)).filter(Boolean) as Token[],
  );
}
