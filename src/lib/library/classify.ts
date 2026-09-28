import type { PageType } from "./types";

const MARKET_HOSTS = ["polymarket.com", "kalshi.com", "hedgehog.markets", "predict.fun", "manifold.markets", "limitless.exchange", "myriad.markets"];
const NFT_HOSTS = ["magiceden.io", "tensor.trade", "opensea.io", "exchange.art", "formfunction.xyz"];
const RESEARCH_HOSTS = ["medium.com", "mirror.xyz", "substack.com", "gitbook.io", "arxiv.org", "messari.io", "blockworks.co", "coindesk.com", "theblock.co", "decrypt.co", "coingecko.com", "defillama.com", "dune.com", "github.com", "x.com", "twitter.com"];

const matches = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

/**
 * What kind of page a URL is: token, wallet, transaction, app, market, nft,
 * research, search, ai, strata or website. Mirrors desktop/src/lib.js.
 */
export function classifyUrl(url: string, homeOrigin: string, appHosts: Set<string> = new Set()): PageType {
  let u: URL;
  try {
    u = new URL(url, homeOrigin);
  } catch {
    return "website";
  }
  if (!/^https?:$/.test(u.protocol)) return "website";
  const host = u.hostname.replace(/^www\./, "");
  const p = u.pathname;
  let home = "";
  try {
    home = new URL(homeOrigin).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }
  if (host === home) {
    if (/^\/tokens\/[^/]+/.test(p)) return "token";
    if (/^\/wallets\/[^/]+/.test(p)) return "wallet";
    if (/^\/tx\/[^/]+/.test(p)) return "transaction";
    if (/^\/(apps|projects)\/[^/]+/.test(p)) return "app";
    if (/^\/search/.test(p)) return "search";
    if (/^\/ai/.test(p)) return "ai";
    if (/^\/news/.test(p)) return "research";
    return "strata";
  }
  if (/(^|\.)solscan\.io$|(^|\.)explorer\.solana\.com$|(^|\.)solana\.fm$|(^|\.)xray\.helius\.xyz$/.test(host)) {
    if (/^\/(tx|transaction)s?\//.test(p)) return "transaction";
    if (/^\/token\//.test(p)) return "token";
    if (/^\/(account|address)\//.test(p)) return "wallet";
  }
  if (/(^|\.)birdeye\.so$/.test(host) && /^\/token\//.test(p)) return "token";
  if (/(^|\.)dexscreener\.com$/.test(host) && /^\/solana\/[^/]+/.test(p)) return "token";
  if (/(^|\.)pump\.fun$/.test(host) && /^\/(coin\/)?[1-9A-HJ-NP-Za-km-z]{32,44}/.test(p)) return "token";
  if (matches(host, MARKET_HOSTS)) return "market";
  if (matches(host, NFT_HOSTS)) return "nft";
  if (/\.pdf$/i.test(p) || /whitepaper|litepaper/i.test(p) || /^docs\./.test(host) || matches(host, RESEARCH_HOSTS)) return "research";
  if (appHosts.has(host) || [...appHosts].some((h) => host.endsWith(`.${h}`))) return "app";
  return "website";
}

/** Solana ids (mint/wallet address, transaction signature) found in a page URL. */
export function idsInUrl(url: string): { address?: string; signature?: string } {
  const parts = (() => {
    try {
      const u = new URL(url);
      return [...u.pathname.split("/"), ...u.searchParams.values()];
    } catch {
      return [];
    }
  })();
  const out: { address?: string; signature?: string } = {};
  for (const p of parts) {
    if (!out.signature && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(p)) out.signature = p;
    else if (!out.address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p)) out.address = p;
  }
  return out;
}
