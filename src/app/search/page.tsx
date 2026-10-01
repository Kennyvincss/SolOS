"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { asWebUrl, goHref } from "@/lib/web-url";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { SearchBox, SuggestionChips } from "@/components/search-box";
import { Card, DataBadge, EmptyState, ErrorState, Monogram, Page, Skeleton, Badge } from "@/components/ui";
import { InlineAnswer } from "@/components/ai/inline-answer";
import { LiteSearch } from "@/components/lite/results";
import { useMode } from "@/lib/client/mode";
import { Icon } from "@/components/icon";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import type { SearchHit, SearchResponse } from "@/lib/types";
import type { WebSearchResponse } from "@/lib/providers/websearch";
import { inDesktopApp, useLibrary } from "@/lib/client/library";

const AI_INTENTS = new Set(["question", "trending_tokens", "whales", "today", "compare", "yield", "new_apps", "portfolio"]);

function HitRow({ h }: { h: SearchHit }) {
  const ext = /^https?:/.test(h.href);
  const icon =
    h.kind === "token" || h.kind === "protocol" ? (
      <Monogram name={String(h.meta?.symbol ?? h.title)} src={h.icon} size={36} rounded="full" color="#9ba1ab" />
    ) : h.kind === "app" || h.kind === "extension" ? (
      h.kind === "extension" && h.icon ? (
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${h.color}22`, color: h.color }}>
          <Icon name={h.icon} size={17} />
        </span>
      ) : (
        <Monogram name={h.title} color={h.color} src={h.kind === "app" ? `/api/logo/${h.id}` : undefined} size={36} />
      )
    ) : (
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted">
        <Icon name={h.kind === "news" ? "Newspaper" : h.kind === "wallet" ? "Wallet" : h.kind === "transaction" ? "ReceiptText" : h.kind === "developer" ? "Code2" : h.icon ?? "Compass"} size={16} />
      </span>
    );
  return (
    <Link href={h.href} target={ext ? "_blank" : undefined} rel={ext ? "noopener noreferrer" : undefined} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium">{h.title}</span>
          {h.badge && <Badge tone={h.badge === "Verified" ? "green" : h.badge === "Sample" ? "warn" : "neutral"}>{h.badge}</Badge>}
        </div>
        {h.subtitle && <div className="truncate text-[12.5px] text-muted">{h.subtitle}</div>}
      </div>
      {ext ? <ExternalLink size={14} className="text-faint" /> : <ArrowRight size={14} className="text-faint" />}
    </Link>
  );
}

/** Results from the whole web; those about Solana first. */
function WebResults({ q, empty }: { q: string; empty?: React.ReactNode }) {
  const { data, loading } = useApi<WebSearchResponse>(`/api/search/web?q=${encodeURIComponent(q)}`, { staleMs: 5 * 60_000 });
  const results = data?.results ?? [];
  if (!loading && !results.length) return <>{empty ?? null}</>;
  return (
    <Card className="mt-4 p-3 sm:p-4">
      <div className="mb-1 px-2 text-[12px] font-medium uppercase tracking-wider text-faint">From the web</div>
      {loading && !results.length && (
        <div className="space-y-2 p-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {results.slice(0, 20).map((r) => (
        <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
          <Monogram name={new URL(r.url).hostname.replace(/^www\./, "")} size={36} color="#9ba1ab" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium">{r.title}</span>
              {r.solana && <Badge tone="green">Solana</Badge>}
            </div>
            <div className="truncate text-[12px] text-faint">{new URL(r.url).hostname.replace(/^www\./, "")}</div>
            {r.snippet && <div className="line-clamp-2 text-[12.5px] text-muted">{r.snippet}</div>}
          </div>
          <ExternalLink size={14} className="mt-1 text-faint" />
        </a>
      ))}
    </Card>
  );
}

function Results() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const library = useLibrary();
  useEffect(() => {
    // The desktop address bar records its own searches.
    if (q.trim() && !inDesktopApp()) library.record("search", q.trim(), window.location.href).catch(() => {});
  }, [q, library]);
  const router = useRouter();
  // A web address typed into search goes to the site (after a safety check).
  useEffect(() => {
    const site = asWebUrl(q);
    if (site) router.replace(goHref(site));
  }, [q, router]);
  const { data, error, loading, reload } = useApi<SearchResponse>(q ? `/api/search?q=${encodeURIComponent(q)}` : null, { staleMs: 30_000 });
  const recent = useStore((s) => s.recentSearches);

  return (
    <Page>
      <div className="mb-6">
        <SearchBox initial={q} size="md" key={q} autoFocus={!q} />
      </div>
      {!q && (
        <div className="py-8">
          <h1 className="mb-2 text-center text-[24px] font-semibold tracking-[-0.02em]">Search everything</h1>
          <p className="mb-6 text-center text-[14px] text-muted">Solana tokens, wallets, transactions, apps and news first — and the rest of the web.</p>
          <SuggestionChips />
          {recent.length > 0 && (
            <div className="mx-auto mt-10 max-w-md">
              <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-faint">Recent</div>
              {recent.map((r) => (
                <Link key={r} href={`/search?q=${encodeURIComponent(r)}`} className="block rounded-lg px-2 py-1.5 text-[14px] text-muted hover:bg-surface-2 hover:text-fg">
                  {r}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {q && data && data.intent.href && data.intent.type !== "question" && data.intent.type !== "lookup" && (
        <Link href={data.intent.href} className="card card-hover mb-4 flex items-center gap-3 p-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sol-green/10 text-sol-green">
            <ArrowRight size={16} />
          </span>
          <div className="flex-1">
            <div className="text-[14px] font-medium">{data.intent.label}</div>
            <div className="text-[12.5px] text-muted">Open the dedicated view</div>
          </div>
        </Link>
      )}

      {q && data && AI_INTENTS.has(data.intent.type) && <InlineAnswer question={q} />}

      {q && loading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-4 h-4 w-24" />
              <Skeleton className="mb-2 h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      )}
      {q && error && <ErrorState message={error} onRetry={reload} />}

      {q && data && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-faint">
            <span>{data.groups.reduce((s, g) => s + g.hits.length, 0)} results</span>
            {data.meta.some((m) => m.mode === "demo") && <DataBadge meta={data.meta.find((m) => m.mode === "demo")} />}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.groups.map((g) => (
              <Card key={g.kind} className="p-3 sm:p-4">
                <div className="mb-1 px-2 text-[12px] font-medium uppercase tracking-wider text-faint">{g.label}</div>
                {g.hits.map((h) => (
                  <HitRow key={`${h.kind}:${h.id}`} h={h} />
                ))}
              </Card>
            ))}
          </div>
          <WebResults
            q={q}
            empty={
              data.groups.length === 0 && !AI_INTENTS.has(data.intent.type) ? (
                <Card>
                  <EmptyState
                    title={`No results for “${q}”`}
                    body="Try a token symbol, an app name, a wallet address or a transaction signature — or ask STRATA AI."
                    action={
                      <Link href={`/ai?q=${encodeURIComponent(q)}`} className="btn btn-primary btn-sm">
                        <Sparkles size={14} /> Ask STRATA AI
                      </Link>
                    }
                  />
                </Card>
              ) : null
            }
          />
        </>
      )}
    </Page>
  );
}

export default function SearchPage() {
  const mode = useMode();
  // Wait for the real mode before rendering results, so the hidden mode never starts requests.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <Suspense>{mode === "pro" ? <Results /> : <LiteSearch />}</Suspense>;
}
