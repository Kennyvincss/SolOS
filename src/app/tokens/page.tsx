"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Card, DataBadge, DemoNotice, EmptyState, ErrorState, Page, PageHeader, SkeletonRows, Tabs } from "@/components/ui";
import { TokenRow } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { useStore } from "@/lib/client/store";
import type { SearchResponse, Sourced, Token } from "@/lib/types";

type Tab = "trending" | "top_traded" | "gainers" | "losers" | "new" | "watchlist";

function List({ tab, interval }: { tab: Tab; interval: string }) {
  const watch = useStore((s) => s.watchlist);
  const url =
    tab === "watchlist"
      ? watch.length
        ? `/api/tokens?list=mints&mints=${watch.join(",")}`
        : null
      : tab === "gainers" || tab === "losers"
        ? "/api/tokens?list=movers"
        : `/api/tokens?list=${tab}&interval=${interval}&limit=50`;
  const { data, error, loading, reload } = useApi<Sourced<Token[] | { gainers: Token[]; losers: Token[] }>>(url, { refreshMs: 60_000 });
  const tokens: Token[] = !data ? [] : Array.isArray(data.data) ? data.data : tab === "losers" ? data.data.losers : data.data.gainers;
  if (tab === "watchlist" && !watch.length) return <EmptyState title="Your watchlist is empty" body="Open any token and tap the star to add it here." />;
  return (
    <>
      <DemoNotice meta={data?.meta} />
      <div className="mb-2 flex justify-end">
        <DataBadge meta={data?.meta} />
      </div>
      {loading && <SkeletonRows rows={10} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && !tokens.length && <EmptyState title="No tokens right now" />}
      <div className="-mx-2">
        {tokens.map((t, i) => (
          <TokenRow key={t.mint} t={t} rank={i + 1} right={tab === "top_traded" ? "volume" : tab === "new" ? "liquidity" : "mcap"} />
        ))}
      </div>
      {(tab === "gainers" || tab === "losers") && <p className="mt-3 text-[12px] text-faint">Only tokens with more than $250K liquidity among the 100 most traded are included, to filter out illiquid noise.</p>}
      {tab === "new" && <p className="mt-3 text-[12px] text-faint">Newly launched tokens are extremely risky. Always check the risk indicators on the token page.</p>}
    </>
  );
}

function TokensInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "trending");
  const [interval, setInterval] = useState("24h");
  const [q, setQ] = useState("");
  const search = useApi<SearchResponse>(q.trim().length >= 2 ? `/api/search?q=${encodeURIComponent(q.trim())}` : null);
  const hits = search.data?.groups.find((g) => g.kind === "token");
  const mints = hits?.hits.map((h) => h.id).join(",");
  const found = useApi<Sourced<Token[]>>(mints ? `/api/tokens?list=mints&mints=${mints}` : null);

  return (
    <Page>
      <PageHeader title="Tokens" subtitle="Live prices, charts, holders and risk indicators for every Solana token." />
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input h-11 rounded-full pl-10" placeholder="Search by name, symbol or mint address" aria-label="Search tokens" />
      </div>
      {q.trim().length >= 2 ? (
        <Card className="p-3 sm:p-4">
          {(search.loading || found.loading) && <SkeletonRows rows={5} />}
          {found.data && !found.data.data.length && <EmptyState title="No tokens found" />}
          <div className="-mx-1">{found.data?.data.map((t) => <TokenRow key={t.mint} t={t} right="mcap" />)}</div>
        </Card>
      ) : (
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "trending", label: "🔥 Trending" },
                { value: "top_traded", label: "Most traded" },
                { value: "gainers", label: "Gainers" },
                { value: "losers", label: "Losers" },
                { value: "new", label: "New" },
                { value: "watchlist", label: "★ Watchlist" },
              ]}
            />
            {(tab === "trending" || tab === "top_traded") && (
              <Tabs value={interval} onChange={setInterval} options={["1h", "6h", "24h"].map((v) => ({ value: v, label: v }))} />
            )}
          </div>
          <List tab={tab} interval={interval} />
        </Card>
      )}
    </Page>
  );
}

export default function TokensPage() {
  return (
    <Suspense>
      <TokensInner />
    </Suspense>
  );
}
