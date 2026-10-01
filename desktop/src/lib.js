// Pure helpers shared by the main process and tests.
// SPDX-License-Identifier: GPL-3.0-only

/** The STRATA web app shown in the home tab. Override with SOLANA_OS_URL. */
const SOLANA_OS_URL = (process.env.SOLANA_OS_URL || "https://solos-rho.vercel.app").replace(/\/+$/, "");

/** Wallet extensions offered for one-click install (Chrome Web Store IDs). */
const WALLETS = [
  { id: "bfnaelmomeimhlpmgjnjophhpkkoljpa", name: "Phantom", color: "#ab9ff2" },
  { id: "bhhhlbepdkbapadjdnnojkbgioiodbic", name: "Solflare", color: "#fc7227" },
  { id: "aflkmfhebedbjioipglgcbcmnbpgliof", name: "Backpack", color: "#e33e3f" },
];

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const ADDRESS_RE = new RegExp(`^${BASE58}{32,44}$`);
const SIGNATURE_RE = new RegExp(`^${BASE58}{80,90}$`);
/** Requests about the current page go to STRATA AI (with the page as context). */
const AI_RE = /^(analy[sz]e|explain|summari[sz]e|research|compare|what (is|does|has)|who (is|owns)|is this|tell me about|should i)\b.*\b(this|these|that|my open tabs|page|tab|wallet|token|transaction|project)\b/i;

/**
 * Address-bar input -> where to go.
 *  - URLs and bare domains open directly.
 *  - Transaction signatures open the transaction page.
 *  - Addresses and $TICKERs are resolved by STRATA (token, wallet, program…).
 *  - "Analyze this wallet", "explain this transaction"… open STRATA AI.
 *  - Anything else searches STRATA.
 * Returns { kind: "url", url } or { kind: "ai", prompt }.
 */
function routeInput(input, base = SOLANA_OS_URL) {
  const t = String(input || "").trim();
  if (!t) return { kind: "url", url: base };
  // strata://tokens -> the STRATA page /tokens (what the address bar shows for STRATA pages).
  const internal = t.match(/^strata:\/\/(.*)$/i);
  if (internal) return { kind: "url", url: `${base}/${internal[1].replace(/^\/+/, "")}` };
  if (/^(https?|chrome-extension|about|file):/i.test(t)) return { kind: "url", url: t };
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return { kind: "url", url: `http://${t}` };
  if (SIGNATURE_RE.test(t)) return { kind: "url", url: `${base}/tx/${t}` };
  if (ADDRESS_RE.test(t)) return { kind: "url", url: `${base}/open?q=${encodeURIComponent(t)}` };
  if (/^\$[A-Za-z][A-Za-z0-9]{0,11}$/.test(t)) return { kind: "url", url: `${base}/open?q=${encodeURIComponent(t)}` };
  if (/^[A-Z][A-Z0-9]{1,9}$/.test(t)) return { kind: "url", url: `${base}/open?q=${encodeURIComponent(t)}` };
  const looksLikeDomain = !/\s/.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(t) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(t);
  if (looksLikeDomain) return { kind: "url", url: `https://${t}` };
  if (AI_RE.test(t)) return { kind: "ai", prompt: t };
  return { kind: "url", url: `${base}/search?q=${encodeURIComponent(t)}` };
}

/** Address-bar input -> URL (AI requests become a STRATA AI page). */
function normalizeInput(input, base = SOLANA_OS_URL) {
  const r = routeInput(input, base);
  return r.kind === "url" ? r.url : `${base}/ai?q=${encodeURIComponent(r.prompt)}`;
}

/* ------------------------------------------------------------ page types */

const MARKET_HOSTS = ["polymarket.com", "kalshi.com", "hedgehog.markets", "predict.fun", "manifold.markets", "limitless.exchange", "myriad.markets"];
const NFT_HOSTS = ["magiceden.io", "tensor.trade", "opensea.io", "exchange.art", "formfunction.xyz"];
const RESEARCH_HOSTS = ["medium.com", "mirror.xyz", "substack.com", "gitbook.io", "arxiv.org", "messari.io", "blockworks.co", "coindesk.com", "theblock.co", "decrypt.co", "coingecko.com", "defillama.com", "dune.com", "github.com", "x.com", "twitter.com"];

function hostMatches(host, list) {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * What kind of page a URL is, for history and bookmarks:
 * token, wallet, transaction, app, market, nft, research, search, ai, strata or website.
 * appHosts: domains of known Solana apps (from the STRATA App Store).
 */
function classifyUrl(url, base = SOLANA_OS_URL, appHosts = new Set()) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "website";
  }
  if (!/^https?:$/.test(u.protocol)) return "website";
  const host = u.hostname.replace(/^www\./, "");
  const p = u.pathname;
  let home = "";
  try {
    home = new URL(base).hostname.replace(/^www\./, "");
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
  if (hostMatches(host, MARKET_HOSTS)) return "market";
  if (hostMatches(host, NFT_HOSTS)) return "nft";
  if (/\.pdf$/i.test(p) || /whitepaper|litepaper/i.test(p) || /^docs\./.test(host) || hostMatches(host, RESEARCH_HOSTS)) return "research";
  if (appHosts.has(host) || [...appHosts].some((h) => host.endsWith(`.${h}`))) return "app";
  return "website";
}

/** Suggested bookmark folder for a page type (folder ids are shared across devices). */
const DEFAULT_FOLDERS = [
  { id: "f-trading", name: "Trading" },
  { id: "f-defi", name: "DeFi" },
  { id: "f-research", name: "Research" },
  { id: "f-wallets", name: "Wallets" },
  { id: "f-markets", name: "Markets" },
  { id: "f-apps", name: "Apps" },
];
function folderForType(type) {
  return { token: "f-trading", wallet: "f-wallets", transaction: "f-research", market: "f-markets", research: "f-research", app: "f-apps", nft: "f-apps" }[type] ?? null;
}

/* ------------------------------------------------------------ tab order */

/**
 * Keep tab order valid: pinned tabs first, and each group's tabs next to each
 * other (in the position of the group's first tab).
 */
function normalizeOrder(order, tabs) {
  const pinned = order.filter((id) => tabs.get(id)?.pinned);
  const rest = order.filter((id) => tabs.has(id) && !tabs.get(id).pinned);
  const out = [];
  const placed = new Set();
  for (const id of rest) {
    if (placed.has(id)) continue;
    const g = tabs.get(id).groupId;
    if (g) {
      for (const other of rest) if (!placed.has(other) && tabs.get(other).groupId === g) (out.push(other), placed.add(other));
    } else {
      out.push(id);
      placed.add(id);
    }
  }
  return [...pinned, ...out];
}

/** Move id to index (in the order without id). */
function moveInOrder(order, id, index) {
  const without = order.filter((x) => x !== id);
  const i = Math.max(0, Math.min(without.length, index));
  return [...without.slice(0, i), id, ...without.slice(i)];
}

/** Summarise a STRATA security report (/api/security) into one toolbar badge. */
function riskFromReport(report) {
  const ind = Array.isArray(report?.indicators) ? report.indicators : [];
  if (!ind.length) return null;
  const high = ind.find((i) => i.level === "high");
  if (high) return { level: "high", label: high.label, detail: high.explanation };
  // "Not in the app registry" is not a warning: most websites aren't Solana apps.
  const medium = ind.find((i) => i.level === "medium" && i.id !== "registry");
  if (medium) return { level: "medium", label: medium.label, detail: medium.explanation };
  const known = ind.find((i) => i.id === "registry");
  return { level: "low", label: known?.value ? `Known app · ${known.value}` : "No warnings", detail: known?.explanation };
}

/** Merge two record maps keyed by id/url: the most recently changed record wins (deletions are tombstones). */
function mergeRecords(local = {}, remote = {}) {
  return mergeBookmarks(local, remote);
}

/**
 * Merge two bookmark maps ({ [url]: { title, createdAt, updatedAt, deleted? } }).
 * For each URL the most recently changed record wins, so deletions (kept as
 * tombstones) sync correctly across computers.
 */
function mergeBookmarks(local = {}, remote = {}) {
  const out = { ...local };
  for (const [url, r] of Object.entries(remote)) {
    const l = out[url];
    if (!l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0)) out[url] = r;
  }
  return out;
}

/**
 * window.open() feature string -> popup size/position, or null when the page
 * didn't ask for a popup (no size or position, no "popup"). Sign-in flows
 * ("Continue with Google", wallets) open popups like this.
 */
function popupFeatures(features) {
  const f = {};
  for (const part of String(features || "").split(",")) {
    const [k, v] = part.split("=").map((x) => (x || "").trim().toLowerCase());
    if (k) f[k] = v === undefined || v === "" ? "yes" : v;
  }
  const num = (k) => (f[k] !== undefined && Number.isFinite(Number.parseInt(f[k], 10)) ? Number.parseInt(f[k], 10) : undefined);
  const width = num("width") ?? num("innerwidth");
  const height = num("height") ?? num("innerheight");
  const left = num("left") ?? num("screenx");
  const top = num("top") ?? num("screeny");
  const popup = f.popup !== undefined && !["0", "no", "false"].includes(f.popup);
  if (width === undefined && height === undefined && left === undefined && top === undefined && !popup) return null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { width: clamp(width ?? 500, 320, 1400), height: clamp(height ?? 640, 360, 1100), left, top };
}

module.exports = { popupFeatures, SOLANA_OS_URL, WALLETS, hostOf, normalizeInput, routeInput, classifyUrl, DEFAULT_FOLDERS, folderForType, normalizeOrder, moveInOrder, riskFromReport, mergeBookmarks, mergeRecords };
