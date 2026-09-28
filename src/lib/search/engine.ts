import "server-only";
import type { DataMeta, SearchHit, SearchKind, SearchResponse } from "../types";
import { APPS } from "../catalog/apps";
import { PAGES } from "../catalog/pages";
import { BROWSER_EXTENSIONS } from "../extensions/browser";
import { scoreDoc, normalize } from "./fuzzy";
import { detectIntent } from "./intent";
import { searchTokens } from "../services/tokens";
import { news, protocols } from "../services/ecosystem";
import { shortAddr, fmtUsd, fmtPct } from "../format";

/**
 * Unified search: a static in-memory index (apps, projects, developers,
 * pages, extensions) plus federated live sources (tokens, news, markets,
 * protocols). Each source has a short time budget so search stays instant;
 * slow sources simply drop out of that response.
 */

const LABELS: Record<SearchKind, string> = {
  answer: "Answer",
  token: "Tokens",
  wallet: "Wallets",
  transaction: "Transactions",
  app: "Apps",
  project: "Projects",
  protocol: "Protocols",
  news: "News",
  extension: "Extensions",
  page: "Go to",
  nft: "NFTs",
  developer: "Developers",
};

const ORDER: SearchKind[] = ["wallet", "transaction", "token", "app", "protocol", "news", "extension", "developer", "page", "project", "nft"];

function withBudget<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function staticHits(q: string): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const app of APPS) {
    const s = scoreDoc(q, app.name, [app.tagline, app.category, ...(app.subcategories ?? []), app.developer], [...(app.keywords ?? []), app.token?.symbol ?? ""]);
    if (s > 0.35) {
      hits.push({ kind: "app", id: app.slug, title: app.name, subtitle: `${app.category} · ${app.tagline}`, href: `/apps/${app.slug}`, color: app.color, score: s + (app.featured ? 0.02 : 0), badge: app.token?.symbol });
    }
  }
  const devs = new Map<string, string[]>();
  for (const app of APPS) devs.set(app.developer, [...(devs.get(app.developer) ?? []), app.name]);
  for (const [dev, apps] of devs) {
    const s = scoreDoc(q, dev, apps);
    if (s > 0.6 && !apps.some((a) => normalize(a) === normalize(dev))) {
      hits.push({ kind: "developer", id: dev, title: dev, subtitle: `Builds ${apps.join(", ")}`, href: `/search?q=${encodeURIComponent(dev)}`, score: s * 0.8 });
    }
  }
  for (const p of PAGES) {
    const s = scoreDoc(q, p.title, [p.description], p.keywords);
    if (s > 0.5) hits.push({ kind: "page", id: p.href, title: p.title, subtitle: p.description, href: p.href, score: s * 0.9, icon: p.icon });
  }
  for (const e of BROWSER_EXTENSIONS) {
    const s = scoreDoc(q, e.name, [e.description, e.kind, "extension"]);
    if (s > 0.45) hits.push({ kind: "extension", id: e.id, title: e.name, subtitle: e.description, href: "/extensions", color: e.color, score: s * 0.85, icon: "Puzzle" });
  }
  return hits;
}

export async function search(query: string, opts: { limitPerGroup?: number } = {}): Promise<SearchResponse> {
  const started = Date.now();
  const q = query.trim().slice(0, 200);
  const intent = detectIntent(q);
  const limit = opts.limitPerGroup ?? 6;
  const hits: SearchHit[] = [];
  const meta: DataMeta[] = [];

  if (intent.type === "analyze_wallet" && intent.entity) {
    hits.push({ kind: "wallet", id: intent.entity, title: shortAddr(intent.entity, 6), subtitle: "Open wallet, token or program", href: `/wallets/${intent.entity}`, score: 1 });
  }
  if (intent.type === "explain_tx" && intent.entity) {
    hits.push({ kind: "transaction", id: intent.entity, title: shortAddr(intent.entity, 8), subtitle: "Explain this transaction", href: `/tx/${intent.entity}`, score: 1 });
  }

  const isFreeText = intent.type !== "analyze_wallet" && intent.type !== "explain_tx";
  if (q && isFreeText) hits.push(...staticHits(q));

  const tokenQuery = isFreeText ? q.replace(/^\$/, "") : intent.entity ?? "";
  const shortEnough = tokenQuery.split(/\s+/).length <= 3;

  const [tokens, newsRes, protoRes] = await Promise.all([
    tokenQuery && (shortEnough || intent.type === "analyze_wallet") ? withBudget(searchTokens(tokenQuery), 2500) : null,
    isFreeText && q ? withBudget(news(), 1200) : null,
    isFreeText && q ? withBudget(protocols(), 1200) : null,
  ]);

  if (tokens) {
    meta.push(tokens.meta);
    tokens.data.slice(0, 8).forEach((t, i) => {
      const exact = t.symbol.toLowerCase() === tokenQuery.toLowerCase() || t.mint === tokenQuery;
      const exactName = t.name.toLowerCase() === tokenQuery.toLowerCase();
      const base = exact || exactName ? 0.97 : Math.max(scoreDoc(tokenQuery, t.symbol), scoreDoc(tokenQuery, t.name)) || 0.5;
      const demo = tokens.meta.mode === "demo";
      hits.push({
        kind: "token",
        id: t.mint,
        title: `${t.name}`,
        subtitle: `${t.symbol} · ${fmtUsd(t.priceUsd)}${t.change24h !== undefined ? ` · ${fmtPct(t.change24h)}` : ""}${t.marketCap ? ` · MC ${fmtUsd(t.marketCap, { compact: true })}` : ""}`,
        href: `/tokens/${t.mint}`,
        icon: t.icon,
        score: base - i * 0.01 + (t.verified ? 0.03 : 0),
        badge: demo ? "Demo" : t.verified ? "Verified" : undefined,
        meta: { symbol: t.symbol, mode: tokens.meta.mode },
      });
    });
  }
  if (newsRes) {
    meta.push(newsRes.meta);
    for (const n of newsRes.data) {
      const s = scoreDoc(q, n.title, [n.summary ?? ""]);
      if (s > 0.5) hits.push({ kind: "news", id: n.id, title: n.title, subtitle: `${n.source} · ${new Date(n.publishedAt).toLocaleDateString()}`, href: n.url, score: s * 0.85, meta: { mode: newsRes.meta.mode } });
    }
  }
  if (protoRes) {
    const appNames = new Set(APPS.map((a) => normalize(a.name)));
    for (const p of protoRes.data.slice(0, 300)) {
      if (appNames.has(normalize(p.name))) continue;
      const s = scoreDoc(q, p.name, [p.category]);
      if (s > 0.6) hits.push({ kind: "protocol", id: p.slug, title: p.name, subtitle: `${p.category}${p.tvlUsd ? ` · TVL ${fmtUsd(p.tvlUsd, { compact: true })}` : ""}`, href: p.url ?? `https://defillama.com/protocol/${p.slug}`, icon: p.logo, score: s * 0.8 });
    }
  }

  // Category intents surface every app in the category.
  if (intent.type === "category" && intent.category) {
    for (const app of APPS.filter((a) => a.category === intent.category || a.subcategories?.includes(intent.category!))) {
      if (!hits.some((h) => h.kind === "app" && h.id === app.slug)) {
        hits.push({ kind: "app", id: app.slug, title: app.name, subtitle: `${app.category} · ${app.tagline}`, href: `/apps/${app.slug}`, color: app.color, score: 0.6 });
      }
    }
  }

  const groups = ORDER.map((kind) => ({
    kind,
    label: LABELS[kind],
    hits: hits
      .filter((h) => h.kind === kind)
      .sort((a, b) => b.score - a.score)
      .slice(0, kind === "app" && intent.type === "category" ? 30 : limit),
  }))
    .filter((g) => g.hits.length)
    .sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0));

  return { query: q, intent, groups, tookMs: Date.now() - started, meta };
}
