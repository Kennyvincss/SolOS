"use client";

import { useState } from "react";
import { Card, DataBadge, DemoNotice, EmptyState, Page, PageHeader, SkeletonRows, Tabs } from "@/components/ui";
import { NewsRow } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { NEWS_CATEGORIES, type NewsItem, type Sourced } from "@/lib/types";

export default function NewsPage() {
  const [cat, setCat] = useState<string>("All");
  const [source, setSource] = useState<string>("All");
  const { data, loading, error } = useApi<Sourced<NewsItem[]>>("/api/news", { refreshMs: 5 * 60_000 });
  const sources = [...new Set(data?.data.map((n) => n.source) ?? [])];
  const list = (data?.data ?? []).filter((n) => (cat === "All" || n.categories.includes(cat as never)) && (source === "All" || n.source === source));
  return (
    <Page>
      <PageHeader title="News" subtitle="Solana ecosystem news aggregated from its sources. Every story links to the original publisher." actions={<DataBadge meta={data?.meta} />} />
      <DemoNotice meta={data?.meta} />
      <Tabs value={cat} onChange={setCat} options={[{ value: "All", label: "All" }, ...NEWS_CATEGORIES.filter((c) => c !== "Solana").map((c) => ({ value: c, label: c }))]} className="mb-3" />
      {sources.length > 1 && <Tabs value={source} onChange={setSource} options={[{ value: "All", label: "All sources" }, ...sources.map((s) => ({ value: s, label: s }))]} className="mb-5" />}
      <Card className="p-4 sm:p-5">
        {loading && <SkeletonRows rows={8} />}
        {error && <p className="text-[13px] text-muted">{error}</p>}
        {data && !list.length && <EmptyState title="No stories in this category right now" />}
        <div className="-mx-2 divide-y divide-line">
          {list.map((n) => (
            <NewsRow key={n.id} n={n} />
          ))}
        </div>
      </Card>
    </Page>
  );
}
