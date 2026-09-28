import { NextResponse } from "next/server";
import { classifyAddress } from "@/lib/services/account";
import { search } from "@/lib/search/engine";

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const ADDRESS = new RegExp(`^${BASE58}{32,44}$`);
const SIGNATURE = new RegExp(`^${BASE58}{80,90}$`);

/**
 * Universal "open": what the STRATA address bar sends for tickers, addresses
 * and signatures. BONK -> token page, a wallet -> wallet explorer, a mint ->
 * token page, a program -> security check, a signature -> transaction.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  const go = (path: string) => NextResponse.redirect(new URL(path, req.url), 307);
  if (!q) return go("/");
  if (SIGNATURE.test(q)) return go(`/tx/${q}`);
  if (ADDRESS.test(q)) {
    const c = await classifyAddress(q).catch(() => null);
    if (c?.type === "mint") return go(`/tokens/${q}`);
    if (c?.type === "program" || c?.type === "other") return go(`/security?q=${q}`);
    if (c?.type === "token_account" && c.wallet) return go(`/wallets/${c.wallet}`);
    return go(`/wallets/${q}`);
  }
  // A ticker: the token whose symbol matches exactly (the most liquid one wins in search ranking).
  const symbol = q.replace(/^\$/, "").toUpperCase();
  if (/^[A-Z0-9]{1,12}$/.test(symbol)) {
    const res = await search(symbol).catch(() => null);
    const hit = res?.groups.flatMap((g) => g.hits).find((h) => h.kind === "token" && (h.title.toUpperCase() === symbol || h.title.toUpperCase().startsWith(`${symbol} `) || String(h.meta?.symbol ?? "").toUpperCase() === symbol));
    if (hit) return go(hit.href);
  }
  return go(`/search?q=${encodeURIComponent(q)}`);
}
