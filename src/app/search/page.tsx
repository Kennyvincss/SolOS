"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { asWebUrl, goHref } from "@/lib/web-url";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { SearchBox, SuggestionChips } from "@/components/search-box";
import { Card, DataBadge, EmptyState, ErrorState, Monogram, Page, Skeleton, Badge } from "@/components/ui";
import { AssistantBubble, reduceEvent, type AssistantMsg } from "@/components/ai/message";
import { Icon } from "@/components/icon";
import { useApi } from "@/lib/client/fetch";
import { streamChat, useAiContext } from "@/lib/client/ai";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import type { SearchHit, SearchResponse } from "@/lib/types";
import { inDesktopApp, useLibrary } from "@/lib/client/library";

const AI_INTENTS = new Set(["question", "trending_tokens", "whales", "today", "compare", "yield", "new_apps", "portfolio"]);

/** Streams a short STRATA AI answer at the top of the results page. */
function InlineAnswer({ question }: { question: string }) {
  const session = useSession();
  const aiContext = useAiContext();
  const ctxRef = useRef(aiContext);
  ctxRef.current = aiContext;
  const [m, setM] = useState<AssistantMsg | null>(null);
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (ran.current === question) return;
    ran.current = question;
    const ctrl = new AbortController();
    setM({ role: "assistant", text: "", tools: [], cards: [], sources: [], done: false });
    streamChat([{ role: "user", content: `${question}\n\n(Answer concisely for a search results page: at most ~120 words plus the key data.)` }], session.address, (e) => setM((cur) => (cur ? reduceEvent(cur, e) : cur)), ctrl.signal, ctxRef.current).catch(() => {});
    return () => ctrl.abort();
  }, [question, session.address]);
  if (!m) return null;
  return (
    <Card className="mb-6 overflow-hidden p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Sparkles size={15} className="text-sol-green" /> STRATA AI
        </div>
        <Link href={`/ai?q=${encodeURIComponent(question)}`} className="flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
          Continue in chat <ArrowRight size={12} />
        </Link>
      </div>
      <AssistantBubble m={m} viewer={session.address} />
    </Card>
  );
}

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
          <h1 className="mb-2 text-center text-[24px] font-semibold tracking-[-0.02em]">Search everything on Solana</h1>
          <p className="mb-6 text-center text-[14px] text-muted">Tokens, wallets, transactions, apps, protocols, NFTs, news and more.</p>
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
          {data.groups.length === 0 && !AI_INTENTS.has(data.intent.type) && (
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
          )}
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
        </>
      )}
    </Page>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <Results />
    </Suspense>
  );
}
