import { config } from "../config";
import type { NewsCategory, NewsItem } from "../types";
import { cached, fetchText } from "./http";

/**
 * RSS/Atom aggregation. Feeds are configurable via NEWS_FEEDS; general crypto
 * feeds are filtered down to Solana-relevant stories. Every item keeps its
 * original source and link.
 */

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#822[01];/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Feeds often entity-encode their HTML, so strip tags again after decoding.
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : undefined;
}

function link(block: string): string | undefined {
  const rss = block.match(/<link>([\s\S]*?)<\/link>/i);
  if (rss) return decode(rss[1]);
  const atom = block.match(/<link[^>]*href="([^"]+)"/i);
  return atom?.[1];
}

export function parseFeed(xml: string, source: string): Omit<NewsItem, "categories">[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items: Omit<NewsItem, "categories">[] = [];
  for (const b of blocks) {
    const title = tag(b, "title");
    const url = link(b);
    if (!title || !url || !/^https?:\/\//.test(url)) continue;
    const date = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
    const summary = tag(b, "description") ?? tag(b, "summary");
    const ts = date ? new Date(date) : null;
    items.push({
      id: url,
      title,
      url,
      source,
      publishedAt: ts && !isNaN(ts.getTime()) ? ts.toISOString() : new Date(0).toISOString(),
      summary: summary ? summary.slice(0, 280) : undefined,
    });
  }
  return items;
}

const CATEGORY_RULES: [NewsCategory, RegExp][] = [
  ["DeFi", /\b(defi|lending|dex|liquidity|yield|staking|perps?|perpetual|tvl|jupiter|raydium|kamino|drift|orca|meteora|marinade|jito)\b/i],
  ["Tokens", /\b(token|memecoin|meme coin|airdrop|price|rally|surge|plunge|etf|bonk|wif|pump\.fun)\b/i],
  ["Apps", /\b(app|launch(es|ed)?|wallet|phantom|backpack|solflare|mobile|seeker|saga)\b/i],
  ["AI", /\b(ai|agent|agents|llm|machine learning|artificial intelligence)\b/i],
  ["RWA", /\b(rwa|real[- ]world|tokeni[sz]ed|treasur(y|ies)|stocks?|equities|bonds?|fund)\b/i],
  ["Payments", /\b(payments?|stablecoin|usdc|pyusd|visa|mastercard|stripe|shopify|solana pay|merchant)\b/i],
  ["Gaming", /\b(gaming|game|games|esports)\b/i],
  ["Infrastructure", /\b(validator|firedancer|alpenglow|client|rpc|upgrade|outage|throughput|tps|network|agave|anza|helius)\b/i],
];

export function categorizeNews(title: string, summary = ""): NewsCategory[] {
  const text = `${title} ${summary}`;
  const cats: NewsCategory[] = ["Solana"];
  for (const [c, re] of CATEGORY_RULES) if (re.test(text)) cats.push(c);
  return cats;
}

const SOLANA_RE = /\b(solana|sol\b|jupiter|phantom|raydium|bonk|pump\.fun|helius|firedancer|anza|jito|kamino|drift|backpack|solflare|seeker)\b/i;

export async function fetchNews(): Promise<NewsItem[]> {
  return cached("news:all", 10 * 60_000, async () => {
    const results = await Promise.allSettled(
      config.newsFeeds.map(async (f) => {
        const xml = await fetchText(f.url, 7000);
        const items = parseFeed(xml, f.name);
        // Solana-native feeds are kept whole; general crypto feeds are filtered.
        const solanaNative = /solana/i.test(f.name) || /solana/i.test(f.url);
        return items.filter((i) => solanaNative || SOLANA_RE.test(`${i.title} ${i.summary ?? ""}`));
      }),
    );
    const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!all.length) throw new Error("no news feeds reachable");
    const seen = new Set<string>();
    return all
      .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
      .map((i) => ({ ...i, categories: categorizeNews(i.title, i.summary) }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 120);
  });
}
