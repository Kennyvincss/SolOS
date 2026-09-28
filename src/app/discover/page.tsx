"use client";

import Link from "next/link";
import { Card, DataBadge, DemoNotice, EmptyState, Page, PageHeader, Section, SkeletonRows } from "@/components/ui";
import { AppCard, NewsRow, TokenRow } from "@/components/domain";
import { FollowingFeed } from "@/components/wallet-tools";
import { AskAIPanel } from "@/components/ai/inline";
import { useApi } from "@/lib/client/fetch";
import { APPS } from "@/lib/catalog/apps";
import type { AppMetrics, DataMeta, NewsItem, Sourced, Token } from "@/lib/types";

function TokenList({ url, right, limit = 8, empty }: { url: string; right?: "volume" | "mcap" | "liquidity"; limit?: number; empty?: string }) {
  const { data, loading, error } = useApi<Sourced<Token[]>>(url, { refreshMs: 60_000 });
  return (
    <>
      {loading && <SkeletonRows rows={5} />}
      {error && <p className="py-4 text-[13px] text-muted">{error}</p>}
      {data && !data.data.length && <EmptyState title={empty ?? "Nothing right now"} />}
      <div className="-mx-2">
        {data?.data.slice(0, limit).map((t, i) => (
          <TokenRow key={t.mint} t={t} rank={i + 1} right={right} />
        ))}
      </div>
      <div className="mt-2 flex justify-end">
        <DataBadge meta={data?.meta} />
      </div>
    </>
  );
}

export default function DiscoverPage() {
  const movers = useApi<Sourced<{ gainers: Token[]; losers: Token[] }>>("/api/tokens?list=movers", { refreshMs: 60_000 });
  const apps = useApi<{ metrics: Record<string, AppMetrics>; meta: DataMeta }>("/api/apps");
  const news = useApi<Sourced<NewsItem[]>>("/api/news");
  const mostUsed = apps.data ? [...APPS].filter((a) => apps.data!.metrics[a.slug]?.tvlUsd).sort((a, b) => (apps.data!.metrics[b.slug].tvlUsd ?? 0) - (apps.data!.metrics[a.slug].tvlUsd ?? 0)).slice(0, 6) : [];

  return (
    <Page wide>
      <PageHeader title="Discover" subtitle="What's trending, new and moving across Solana right now." />
      <DemoNotice meta={movers.data?.meta} />
      <nav className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4">
        {[
          ["#trending", "🔥 Trending"],
          ["#smart-wallets", "🐋 Smart wallets"],
          ["#new", "🚀 New"],
          ["#movers", "📈 Biggest movers"],
          ["#volume", "💰 Volume"],
          ["#most-used", "👥 Most used"],
          ["#ai-picks", "🧠 AI picks"],
          ["#news", "📰 News"],
        ].map(([h, l]) => (
          <a key={h} href={h} className="chip">
            {l}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="trending" title="🔥 Trending" subtitle="Tokens drawing the most attention (24h)">
          <Card className="p-4 sm:p-5">
            <TokenList url="/api/tokens?list=trending&limit=10" right="mcap" />
          </Card>
        </Section>
        <Section id="smart-wallets" title="🐋 Smart wallet activity" subtitle="Moves from wallets you follow">
          <Card className="p-4 sm:p-5">
            <FollowingFeed limit={8} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">STRATA doesn&apos;t label wallets as “smart money” without verifiable criteria. Follow public wallets you trust (funds, builders, well-known traders) to build your own list.</p>
          </Card>
        </Section>
        <Section id="new" title="🚀 New" subtitle="Newly launched tokens (high risk)">
          <Card className="p-4 sm:p-5">
            <TokenList url="/api/tokens?list=new&limit=8" right="liquidity" empty="No new tokens returned" />
          </Card>
        </Section>
        <Section id="movers" title="📈 Biggest movers" subtitle="24h, liquid tokens only">
          <Card className="p-4 sm:p-5">
            {movers.loading && <SkeletonRows rows={6} />}
            {movers.data && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[12px] font-medium text-up">Gainers</div>
                  <div className="-mx-2">
                    {movers.data.data.gainers.slice(0, 5).map((t) => (
                      <TokenRow key={t.mint} t={t} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[12px] font-medium text-down">Losers</div>
                  <div className="-mx-2">
                    {movers.data.data.losers.slice(0, 5).map((t) => (
                      <TokenRow key={t.mint} t={t} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </Section>
        <Section id="volume" title="💰 Volume" subtitle="Highest 24h trading volume">
          <Card className="p-4 sm:p-5">
            <TokenList url="/api/tokens?list=top_traded&limit=10" right="volume" />
          </Card>
        </Section>
        <Section id="most-used" title="👥 Most used" subtitle="The apps people trust with the most money">
          <Card className="p-3 sm:p-4">
            {apps.loading && <SkeletonRows rows={5} />}
            {apps.data && !mostUsed.length && <EmptyState title="Rankings are temporarily unavailable" body="Check back in a minute." />}
            <div className="grid gap-2">
              {mostUsed.map((a) => (
                <AppCard key={a.slug} app={a} metrics={apps.data?.metrics[a.slug]} compact />
              ))}
            </div>
          </Card>
        </Section>
      </div>

      <Section id="new-apps" title="New & notable apps" action={<Link href="/apps" className="text-[13px] text-muted hover:text-fg">App Store →</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {APPS.filter((a) => (a.launched ?? 0) >= 2023 || a.featured)
            .slice(0, 6)
            .map((a) => (
              <AppCard key={a.slug} app={a} metrics={apps.data?.metrics[a.slug]} />
            ))}
        </div>
      </Section>

      <Section id="ai-picks" title="🧠 AI picks" subtitle="AI-generated research themes. Analysis, not financial advice.">
        <div className="grid gap-3 lg:grid-cols-2">
          <AskAIPanel label="Themes gaining attention" prompt="Using the trending and most-traded token lists, group what is gaining attention on Solana today into 3-4 themes (e.g. memecoins, AI, DeFi, RWAs). For each theme list the tokens and the verified data behind it. Label your interpretation as analysis. No buy/sell recommendations." />
          <AskAIPanel label="DeFi opportunities to research" prompt="From Solana yield data, pick 4 notable opportunities across different categories (lending, liquid staking, LP, stablecoins). Give APY and TVL as verified data, then explain the main risk of each as analysis. No recommendations." />
        </div>
      </Section>

      <Section id="news" title="📰 News" action={<Link href="/news" className="text-[13px] text-muted hover:text-fg">All news →</Link>}>
        <Card className="p-4 sm:p-5">
          {news.loading && <SkeletonRows rows={4} />}
          <div className="-mx-2 grid divide-y divide-line lg:grid-cols-2 lg:gap-x-6 lg:divide-y-0">
            {news.data?.data.slice(0, 8).map((n) => (
              <NewsRow key={n.id} n={n} compact />
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <DataBadge meta={news.data?.meta} />
          </div>
        </Card>
      </Section>
    </Page>
  );
}
