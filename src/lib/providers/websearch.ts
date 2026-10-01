import "server-only";
import { APPS } from "../catalog/apps";
import { cached, fetchJson, UpstreamError } from "./http";

/**
 * Web search: results from the whole internet for any query, with results
 * about Solana first. Uses Brave Search when BRAVE_SEARCH_API_KEY is set;
 * otherwise Bing (DuckDuckGo if Bing doesn't answer) and Wikipedia, which
 * need no key. (DuckDuckGo, Mojeek and Yahoo refuse requests from servers.)
 */

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** About Solana (ranked first). */
  solana: boolean;
  source: "brave" | "bing" | "duckduckgo" | "wikipedia";
}

export interface WebSearchResponse {
  query: string;
  results: WebResult[];
  /** Which services answered, e.g. ["DuckDuckGo", "Wikipedia"]. */
  sources: string[];
  tookMs: number;
}

type Raw = Omit<WebResult, "solana">;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const WIKI_UA = "STRATA/1.0 (https://solos-rho.vercel.app; search)";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Sites that are about Solana: the catalog's apps plus the main explorers and data sites. */
const SOLANA_HOSTS = new Set(
  [
    ...APPS.map((a) => host(a.website)),
    "solana.com",
    "solana.org",
    "solanacompass.com",
    "solscan.io",
    "explorer.solana.com",
    "solana.fm",
    "birdeye.so",
    "pump.fun",
    "jup.ag",
    "phantom.com",
    "phantom.app",
    "solflare.com",
    "magiceden.io",
    "tensor.trade",
    "helius.dev",
    "solanafloor.com",
  ].filter(Boolean),
);
const SOLANA_TEXT = /\bsolana\b|\bspl token\b|pump\.fun|\$SOL\b/i;

export function isSolanaRelated(r: Pick<WebResult, "title" | "url" | "snippet">): boolean {
  const h = host(r.url);
  if ([...SOLANA_HOSTS].some((s) => h === s || h.endsWith(`.${s}`))) return true;
  if (/\/solana(\/|$|\?)/i.test(r.url)) return true; // dexscreener.com/solana/..., coingecko .../solana
  return SOLANA_TEXT.test(`${r.title} ${r.snippet}`);
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

/* ------------------------------------------------------------------ Brave */

async function brave(q: string, key: string): Promise<Raw[]> {
  type R = { web?: { results?: { title: string; url: string; description?: string }[] } };
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20&safesearch=moderate`;
  const data = await fetchJson<R>(url, { headers: { "X-Subscription-Token": key }, timeoutMs: 5000 });
  return (data.web?.results ?? []).map((r) => ({ title: decode(r.title), url: r.url, snippet: decode(r.description ?? ""), source: "brave" as const }));
}

/* ------------------------------------------------------------------- Bing */

/** Bing wraps result links in bing.com/ck/a?...&u=a1<base64url of the address>. */
function bingTarget(href: string): string {
  const h = href.replace(/&amp;/g, "&");
  const u = /[?&]u=a1([^&]+)/.exec(h);
  if (/^https?:\/\/(www\.)?bing\.com\/ck\//.test(h) && u) {
    try {
      return Buffer.from(u[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  return h;
}

/** Results from Bing's result page. */
export function parseBing(html: string): Raw[] {
  const out: Raw[] = [];
  for (const block of html.split(/<li class="b_algo"/).slice(1)) {
    const a = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!a) continue;
    const url = bingTarget(a[1]);
    if (!/^https?:\/\//.test(url) || /^https?:\/\/(www\.)?bing\.com\//.test(url)) continue;
    const snip = /<p class="b_lineclamp\d*"[^>]*>([\s\S]*?)<\/p>/.exec(block) ?? /<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/.exec(block);
    const snippet = snip ? decode(snip[1]).replace(/^(?:[A-Z][a-z]{2} \d{1,2}, \d{4}|\d+ (?:days?|hours?) ago) · /, "") : "";
    out.push({ title: decode(a[2]), url, snippet, source: "bing" });
  }
  return out;
}

async function bing(q: string): Promise<Raw[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en&cc=us&count=20`, {
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new UpstreamError(`${res.status} ${res.statusText}`, res.status);
    const results = parseBing(await res.text());
    if (!results.length) throw new UpstreamError("no results");
    return results;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(err instanceof Error && /abort/i.test(err.message) ? "timed out" : "unreachable");
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- DuckDuckGo */

/** Results from DuckDuckGo's HTML page (no key, no ads). */
export function parseDuckDuckGo(html: string): Raw[] {
  const out: Raw[] = [];
  for (const block of html.split(/(?=<div[^>]+class="[^"]*\bresult\b)/)) {
    const tag = /^<div[^>]*>/.exec(block)?.[0];
    if (!tag || /result--ad\b/.test(tag)) continue;
    const a = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!a) continue;
    let href = a[1].replace(/&amp;/g, "&");
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (href.startsWith("//")) href = `https:${href}`;
    if (!/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/.exec(block);
    out.push({ title: decode(a[2]), url: href, snippet: snip ? decode(snip[1]) : "", source: "duckduckgo" });
  }
  return out;
}

async function duckduckgo(q: string): Promise<Raw[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded", accept: "text/html", "accept-language": "en-US,en;q=0.9" },
      body: new URLSearchParams({ q, kl: "us-en" }).toString(),
      signal: ctrl.signal,
      cache: "no-store",
    });
    // 202 is DuckDuckGo's "are you a robot" page.
    if (res.status !== 200) throw new UpstreamError(`${res.status} ${res.statusText}`, res.status);
    const results = parseDuckDuckGo(await res.text());
    if (!results.length) throw new UpstreamError("no results");
    return results;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(err instanceof Error && /abort/i.test(err.message) ? "timed out" : "unreachable");
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- Wikipedia */

/** Words of the query worth matching ("stonk launchpad" → ["stonk", "launchpad"]). */
const queryWords = (q: string) => q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

async function wikipedia(q: string): Promise<Raw[]> {
  type R = { pages?: { key: string; title: string; excerpt?: string; description?: string | null }[] };
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=5`;
  const data = await fetchJson<R>(url, { headers: { "user-agent": WIKI_UA, "api-user-agent": WIKI_UA }, timeoutMs: 4000 });
  // Only articles whose title has a word of the query (Wikipedia's search
  // otherwise answers "stonk launchpad" with Ubuntu).
  const words = queryWords(q);
  const relevant = (title: string) => !words.length || words.some((w) => title.toLowerCase().includes(w));
  return (data.pages ?? []).filter((p) => relevant(p.title)).map((p) => ({
    title: `${p.title} — Wikipedia`,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
    snippet: [p.description, p.excerpt ? `${decode(p.excerpt)}…` : ""].filter(Boolean).join(" · "),
    source: "wikipedia" as const,
  }));
}

/* ------------------------------------------------------------------ merge */

const settle = <T,>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), () => ({ ok: false as const }));
const canonical = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();

/**
 * Search the web for `query`. Runs "<query>" and "<query> solana" side by
 * side; results about Solana come first, then everything else, each in the
 * search engine's order.
 */
export async function webSearch(query: string): Promise<WebSearchResponse> {
  const started = Date.now();
  const q = query.trim().slice(0, 200);
  if (!q) return { query: q, results: [], sources: [], tookMs: 0 };
  return cached(`web:${q.toLowerCase()}`, 10 * 60_000, async () => {
    const withSolana = /\bsolana\b/i.test(q) ? null : `${q} solana`;
    const key = process.env.BRAVE_SEARCH_API_KEY;
    const engine = key ? (s: string) => brave(s, key) : (s: string) => bing(s).catch(() => duckduckgo(s));
    const [plain, sol, wiki] = await Promise.all([settle(engine(q)), withSolana ? settle(engine(withSolana)) : null, key ? null : settle(wikipedia(q))]);

    const sources: string[] = [];
    const names = { brave: "Brave Search", bing: "Bing", duckduckgo: "DuckDuckGo", wikipedia: "Wikipedia" };
    for (const r of [plain, sol]) if (r?.ok && r.v[0] && !sources.includes(names[r.v[0].source])) sources.push(names[r.v[0].source]);
    if (wiki?.ok && wiki.v.length) sources.push("Wikipedia");
    if (!sources.length && !plain.ok) throw new UpstreamError("web search unavailable");

    // Plain results keep their order; the Solana query adds what's about
    // Solana. A site that also comes up for "<query> solana" and matches the
    // query's words counts as about Solana (launchpads rarely say "Solana").
    const words = queryWords(q);
    const matchesQuery = (r: Raw) => words.length > 0 && words.every((w) => `${r.title} ${r.url}`.toLowerCase().includes(w));
    const byKey = new Map<string, WebResult>();
    const all: WebResult[] = [];
    const add = (r: Raw, solanaQuery: boolean) => {
      const k = canonical(r.url);
      const solana = isSolanaRelated(r) || (solanaQuery && matchesQuery(r));
      const known = byKey.get(k);
      if (known) {
        if (solana) known.solana = true;
        return;
      }
      if (solanaQuery && !solana) return;
      const item = { ...r, solana };
      byKey.set(k, item);
      all.push(item);
    };
    for (const r of plain.ok ? plain.v : []) add(r, false);
    for (const r of sol?.ok ? sol.v : []) add(r, true);
    for (const r of wiki?.ok ? wiki.v : []) add(r, false);

    const results = [...all.filter((r) => r.solana), ...all.filter((r) => !r.solana)].slice(0, 30);
    return { query: q, results, sources, tookMs: Date.now() - started };
  });
}
