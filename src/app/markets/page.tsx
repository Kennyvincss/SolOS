"use client";

import { useState } from "react";
import { Card, DataBadge, DemoNotice, EmptyState, InfoNote, Page, PageHeader, Skeleton, Tabs } from "@/components/ui";
import { MarketCard } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { MARKET_CATEGORIES, type PredictionMarket, type Sourced } from "@/lib/types";
import { APPS } from "@/lib/catalog/apps";
import { AppCard } from "@/components/domain";

export default function MarketsPage() {
  const [cat, setCat] = useState<string>("All");
  const [sort, setSort] = useState<"volume" | "closing" | "liquidity">("volume");
  const { data, loading, error } = useApi<Sourced<PredictionMarket[]>>("/api/markets", { refreshMs: 60_000 });
  const list = (data?.data ?? [])
    .filter((m) => cat === "All" || m.category === cat)
    .sort((a, b) => (sort === "closing" ? new Date(a.closesAt ?? 0).getTime() - new Date(b.closesAt ?? 0).getTime() : sort === "liquidity" ? (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0) : (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0)));
  const platforms = APPS.filter((a) => a.category === "Prediction" || a.subcategories?.includes("Prediction"));
  return (
    <Page wide>
      <PageHeader title="Prediction markets" subtitle="Discover markets on Solana. Probabilities are market prices, not forecasts." actions={<DataBadge meta={data?.meta} />} />
      <DemoNotice meta={data?.meta} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={cat} onChange={setCat} options={[{ value: "All", label: "All" }, ...MARKET_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
        <Tabs value={sort} onChange={setSort} options={[{ value: "volume", label: "Volume" }, { value: "liquidity", label: "Liquidity" }, { value: "closing", label: "Closing soon" }]} />
      </div>
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      )}
      {error && <p className="text-[13px] text-muted">{error}</p>}
      {data && !list.length && (
        <Card>
          <EmptyState title="No markets in this category" />
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => (
          <MarketCard key={m.id} m={m} />
        ))}
      </div>
      <h2 className="mb-3 mt-10 text-[17px] font-semibold">Platforms</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {platforms.map((a) => (
          <AppCard key={a.slug} app={a} />
        ))}
      </div>
      <InfoNote className="mt-6">Operators can connect a live source by pointing PREDICTION_MARKETS_URL at an adapter that returns markets in the documented shape (question, probability, volume, liquidity, closing time, platform, url).</InfoNote>
    </Page>
  );
}
