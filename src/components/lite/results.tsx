"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowUpRight, BookOpen, Code2, Coins, Globe, MessageCircle, Sparkles } from "lucide-react";
import { InlineAnswer } from "../ai/inline-answer";
import { Icon } from "../icon";
import { LogoMark } from "../shell/logo";
import { ModeSwitch } from "../mode-switch";
import { Monogram, Skeleton, cn } from "../ui";
import { LiteSearchInput } from "./search-input";
import { LiteHome } from "./home";
import { APPS } from "@/lib/catalog/apps";
import { useApi } from "@/lib/client/fetch";
import { inDesktopApp, useLibrary } from "@/lib/client/library";
import { isQuestion, searchTerms } from "@/lib/search/lite";
import { asWebUrl, goHref } from "@/lib/web-url";
import type { AppEntry, SearchHit, SearchResponse } from "@/lib/types";

type Filter = "all" | "apps" | "tokens" | "news";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "apps", label: "Apps" },
  { id: "tokens", label: "Tokens" },
  { id: "news", label: "News" },
];
const AI_INTENTS = new Set(["question", "trending_tokens", "whales", "today", "compare", "yield", "new_apps"]);

const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const openUrl = (a: AppEntry) => a.download ?? a.appUrl ?? a.website;

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 mt-8 text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint first:mt-0">{children}</h2>;
}

function OpenButton({ href, label = "Open" }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[12.5px] font-medium text-fg shadow-[var(--shadow)] transition-colors hover:border-line-strong">
      {label} <ArrowUpRight size={13} className="text-muted" />
    </a>
  );
}

/** A result line: icon, title, address, one-line description, and an action. */
function Row({ icon, title, href, url, description, action, external }: { icon: React.ReactNode; title: string; href: string; url?: string; description?: string; action?: React.ReactNode; external?: boolean }) {
  return (
    <div className="group -mx-3 flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-surface-2/60">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        {url && <div className="truncate text-[12px] text-muted">{url}</div>}
        <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="block truncate text-[16px] font-medium leading-snug text-fg decoration-[1.5px] underline-offset-2 hover:underline">
          {title}
        </Link>
        {description && <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function AppRow({ app }: { app: AppEntry }) {
  return (
    <Row
      icon={<Monogram name={app.name} color={app.color} src={`/api/logo/${app.slug}`} size={36} />}
      title={app.name}
      href={`/apps/${app.slug}`}
      url={`${domain(app.website)} · ${app.category}`}
      description={app.tagline}
      action={<OpenButton href={openUrl(app)} label={app.download ? "Get" : "Open"} />}
    />
  );
}

function HitLine({ h }: { h: SearchHit }) {
  const external = /^https?:/.test(h.href);
  const icon =
    h.kind === "token" || h.kind === "protocol" ? (
      <Monogram name={String(h.meta?.symbol ?? h.title)} src={h.icon} size={36} rounded="full" color="#9ba1ab" />
    ) : (
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted">
        <Icon name={h.kind === "news" ? "Newspaper" : h.kind === "wallet" ? "Wallet" : h.kind === "transaction" ? "ReceiptText" : h.kind === "extension" ? "Puzzle" : h.kind === "developer" ? "Code2" : h.icon ?? "Compass"} size={16} />
      </span>
    );
  return <Row icon={icon} title={h.title} href={h.href} external={external} url={external ? domain(h.href) : undefined} description={h.subtitle} action={external ? undefined : <ArrowRight size={15} className="mt-2 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />} />;
}

/** "Official" panel for the project the query is about. */
function OfficialPanel({ app, className }: { app: AppEntry; className?: string }) {
  const links = [
    { label: "Website", href: app.website, icon: Globe },
    app.twitter && { label: "X", href: `https://x.com/${app.twitter}`, icon: MessageCircle, sub: `@${app.twitter}` },
    app.docs && { label: "Docs", href: app.docs, icon: BookOpen },
    app.github && { label: "GitHub", href: app.github, icon: Code2 },
    app.discord && { label: "Discord", href: app.discord, icon: MessageCircle },
  ].filter(Boolean) as { label: string; href: string; icon: typeof Globe; sub?: string }[];
  return (
    <aside className={cn("rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]", className)} aria-label={`${app.name}, official links`}>
      <div className="flex items-center gap-3">
        <Monogram name={app.name} color={app.color} src={`/api/logo/${app.slug}`} size={44} />
        <div className="min-w-0">
          <div className="truncate text-[18px] font-semibold tracking-[-0.01em]">{app.name}</div>
          <div className="text-[12.5px] text-muted">
            {app.category}
            {app.launched ? ` · since ${app.launched}` : ""}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{app.description}</p>
      <a href={openUrl(app)} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm mt-4 w-full">
        {app.download ? "Get" : "Open"} {app.name} <ArrowUpRight size={14} />
      </a>
      <h3 className="mb-1 mt-5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint">Official</h3>
      <ul className="-mx-2">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
              <l.icon size={15} className="text-muted" />
              <span className="font-medium">{l.label}</span>
              <span className="ml-auto truncate text-[12px] text-faint">{l.sub ?? domain(l.href)}</span>
            </a>
          </li>
        ))}
        {app.token && (
          <li>
            <Link href={`/tokens/${app.token.mint}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
              <Coins size={15} className="text-muted" />
              <span className="font-medium">Token</span>
              <span className="ml-auto text-[12px] text-faint">${app.token.symbol}</span>
            </Link>
          </li>
        )}
      </ul>
      <Link href={`/apps/${app.slug}`} className="mt-3 flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
        More about {app.name} on STRATA <ArrowRight size={12} />
      </Link>
    </aside>
  );
}

function Results({ q, ask }: { q: string; ask: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const filter = (params.get("type") as Filter) || "all";
  const terms = searchTerms(q);
  const question = ask || isQuestion(q);
  const { data, loading, error } = useApi<SearchResponse>(`/api/search?q=${encodeURIComponent(terms)}`, { staleMs: 30_000 });
  const library = useLibrary();
  const recorded = useRef("");
  useEffect(() => {
    if (recorded.current === q || inDesktopApp()) return;
    recorded.current = q;
    library.record(question ? "ai" : "search", q, window.location.href).catch(() => {});
  }, [q, question, library]);

  const r = useMemo(() => {
    const hits = (kind: string) => data?.groups.find((g) => g.kind === kind)?.hits ?? [];
    const appHits = hits("app");
    const appsBySlug = new Map(APPS.map((a) => [a.slug, a]));
    const top = appHits.find((h) => h.score >= 0.9 || norm(h.title) === norm(terms));
    const topApp = top ? appsBySlug.get(top.id) : undefined;
    const primary = topApp?.products?.filter((p) => !p.related) ?? [];
    const apps = appHits.map((h) => appsBySlug.get(h.id)).filter((a): a is AppEntry => Boolean(a) && !(primary.length && a!.slug === topApp?.slug));
    const shown = new Set(apps.map((a) => a.slug));
    if (topApp) shown.add(topApp.slug);
    const relatedApps = topApp
      ? [...APPS.filter((a) => a.developer === topApp.developer && !shown.has(a.slug)), ...APPS.filter((a) => a.category === topApp.category && a.featured && !shown.has(a.slug) && a.developer !== topApp.developer)].slice(0, 3)
      : [];
    return {
      topApp,
      primary,
      related: topApp?.products?.filter((p) => p.related) ?? [],
      relatedApps,
      apps,
      tokens: hits("token").slice(0, 4),
      direct: [...hits("wallet"), ...hits("transaction")],
      projects: hits("protocol").slice(0, 4),
      extensions: hits("extension").slice(0, 4),
      news: hits("news").slice(0, 5),
      pages: hits("page").slice(0, 3),
    };
  }, [data, terms]);

  const show = (f: Filter) => filter === "all" || filter === f;
  const empty = {
    apps: !r.primary.length && !r.apps.length && !r.related.length && !r.relatedApps.length && !r.projects.length && !r.extensions.length,
    tokens: !r.tokens.length,
    news: !r.news.length,
  };
  const nothing = Boolean(data) && (filter === "all" ? empty.apps && empty.tokens && empty.news && !r.direct.length && !r.pages.length : empty[filter]);
  const showAnswer = filter === "all" && (question || (data && AI_INTENTS.has(data.intent.type)));
  const setFilter = (f: Filter) => {
    const u = new URLSearchParams(params.toString());
    if (f === "all") u.delete("type");
    else u.set("type", f);
    router.replace(`/search?${u.toString()}`, { scroll: false });
  };

  return (
    <>
      <div className="no-scrollbar -mx-1 mb-6 flex gap-1 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors", filter === f.id ? "bg-fg text-bg" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            {f.label}
          </button>
        ))}
        <Link href={`/search?q=${encodeURIComponent(q)}&ask=1`} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors", ask ? "bg-sol-green/10 text-sol-green" : "text-muted hover:bg-surface-2 hover:text-fg")}>
          <Sparkles size={13} /> Ask STRATA
        </Link>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {showAnswer && <InlineAnswer key={q} question={q} variant="lite" />}
          {r.topApp && filter === "all" && <OfficialPanel app={r.topApp} className="mb-8 lg:hidden" />}

          {loading && (
            <div className="space-y-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-full max-w-md" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-[14px] text-muted">Search is having trouble right now. Try again in a moment.</p>}

          {data && (
            <div>
              {r.direct.length > 0 && show("all") && (
                <section>
                  {r.direct.map((h) => (
                    <HitLine key={h.id} h={h} />
                  ))}
                </section>
              )}
              {show("apps") && (r.primary.length > 0 || r.apps.length > 0) && (
                <section>
                  <Heading>Apps</Heading>
                  {r.topApp &&
                    r.primary.map((p) => (
                      <Row
                        key={p.name}
                        icon={<Monogram name={r.topApp!.name} color={r.topApp!.color} src={`/api/logo/${r.topApp!.slug}`} size={36} />}
                        title={p.name}
                        href={p.url}
                        external
                        url={domain(p.url) + (p.url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "")}
                        description={p.description}
                        action={<OpenButton href={p.url} />}
                      />
                    ))}
                  {r.apps.slice(0, filter === "apps" ? 30 : 8).map((a) => (
                    <AppRow key={a.slug} app={a} />
                  ))}
                </section>
              )}
              {show("tokens") && r.tokens.length > 0 && (
                <section>
                  <Heading>Tokens</Heading>
                  {r.tokens.map((h) => (
                    <HitLine key={h.id} h={h} />
                  ))}
                </section>
              )}
              {show("apps") && (r.related.length > 0 || r.relatedApps.length > 0) && (
                <section>
                  <Heading>Related</Heading>
                  {r.related.map((p) => (
                    <Row key={p.name} icon={<Monogram name={r.topApp!.name} color={r.topApp!.color} src={`/api/logo/${r.topApp!.slug}`} size={36} />} title={p.name} href={p.url} external url={domain(p.url)} description={p.description} action={<OpenButton href={p.url} />} />
                  ))}
                  {r.relatedApps.map((a) => (
                    <AppRow key={a.slug} app={a} />
                  ))}
                </section>
              )}
              {show("apps") && r.projects.length > 0 && (
                <section>
                  <Heading>Projects</Heading>
                  {r.projects.map((h) => (
                    <HitLine key={h.id} h={h} />
                  ))}
                </section>
              )}
              {show("apps") && r.extensions.length > 0 && (
                <section>
                  <Heading>Browser extensions</Heading>
                  {r.extensions.map((h) => (
                    <HitLine key={h.id} h={h} />
                  ))}
                </section>
              )}
              {show("news") && r.news.length > 0 && (
                <section>
                  <Heading>News</Heading>
                  {r.news.map((h) => (
                    <HitLine key={h.id} h={h} />
                  ))}
                </section>
              )}
              {filter === "all" && r.pages.length > 0 && (
                <section>
                  <Heading>On STRATA</Heading>
                  {r.pages.map((h) => (
                    <HitLine key={h.id} h={h} />
                  ))}
                </section>
              )}
              {nothing && !showAnswer && (
                <div className="py-10">
                  <p className="text-[15px]">
                    No results for <span className="font-medium">“{q}”</span>.
                  </p>
                  <p className="mt-1 text-[13.5px] text-muted">Try an app, token or project name, a wallet address or a transaction — or ask STRATA.</p>
                  <Link href={`/search?q=${encodeURIComponent(q)}&ask=1`} className="btn btn-ghost btn-sm mt-4">
                    <Sparkles size={14} className="text-sol-green" /> Ask STRATA about “{q}”
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="hidden lg:block">{r.topApp && filter === "all" && <OfficialPanel app={r.topApp} className="sticky top-28" />}</div>
      </div>
    </>
  );
}

/** STRATA Lite search: clean, sectioned results with Ask STRATA on top for questions. */
export function LiteSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get("q") ?? "").trim();
  const [ask, setAsk] = useState(params.get("ask") === "1");
  useEffect(() => setAsk(params.get("ask") === "1"), [params]);
  // A web address goes to the site (after a safety check).
  useEffect(() => {
    const site = asWebUrl(q);
    if (site && params.get("ask") !== "1") router.replace(goHref(site));
  }, [q, params, router]);

  if (!q) return <LiteHome />;
  return (
    <div className="min-h-[100svh]" data-lite-results>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1120px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link href="/" aria-label="STRATA home" className="shrink-0">
            <LogoMark size={30} />
          </Link>
          <LiteSearchInput key={`${q}:${ask}`} initial={q} ask={ask} onAskChange={setAsk} size="bar" className="max-w-[680px] flex-1" />
          <ModeSwitch compact className="ml-auto hidden sm:inline-flex" />
        </div>
      </header>
      <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-5 sm:px-6 sm:pl-[calc(1.5rem+30px+1.25rem)]">
        <div className="mb-4 flex justify-end sm:hidden">
          <ModeSwitch compact />
        </div>
        <Results q={q} ask={ask} />
      </div>
    </div>
  );
}
