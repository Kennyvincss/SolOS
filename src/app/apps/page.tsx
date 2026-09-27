"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { AppCard } from "@/components/domain";
import { Card, DataBadge, EmptyState, Page, PageHeader, Section, Tabs } from "@/components/ui";
import { APPS } from "@/lib/catalog/apps";
import { APP_CATEGORIES, type AppCategory, type AppMetrics, type DataMeta } from "@/lib/types";
import { useApi } from "@/lib/client/fetch";
import { useStore } from "@/lib/client/store";
import { scoreDoc } from "@/lib/search/fuzzy";

type Sort = "featured" | "tvl" | "az";

function Store() {
  const params = useSearchParams();
  const [cat, setCat] = useState<AppCategory | "All">((params.get("category") as AppCategory) || "All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("featured");
  const { data } = useApi<{ metrics: Record<string, AppMetrics>; meta: DataMeta }>("/api/apps");
  const added = useStore((s) => s.addedApps);
  const favorites = useStore((s) => s.favorites);
  const metrics = data?.metrics ?? {};

  const list = useMemo(() => {
    let l = APPS.filter((a) => cat === "All" || a.category === cat || a.subcategories?.includes(cat));
    if (q.trim()) l = l.map((a) => ({ a, s: scoreDoc(q, a.name, [a.tagline, a.description, a.category, a.developer], a.keywords) })).filter((x) => x.s > 0.3).sort((x, y) => y.s - x.s).map((x) => x.a);
    else if (sort === "tvl") l = [...l].sort((a, b) => (metrics[b.slug]?.tvlUsd ?? -1) - (metrics[a.slug]?.tvlUsd ?? -1));
    else if (sort === "az") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    else l = [...l].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    return l;
  }, [cat, q, sort, metrics]);

  const mine = APPS.filter((a) => added.includes(a.slug) || favorites.includes(a.slug));

  return (
    <Page wide>
      <PageHeader title="App Store" subtitle="Discover the applications of the Solana ecosystem. Descriptions are curated; usage metrics come live from DefiLlama." actions={<DataBadge meta={data?.meta} />} />
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input h-12 rounded-full pl-11" placeholder={`Search ${APPS.length} apps`} aria-label="Search apps" />
      </div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={cat} onChange={setCat} options={[{ value: "All" as const, label: "All" }, ...APP_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
        <Tabs value={sort} onChange={setSort} options={[{ value: "featured", label: "Featured" }, { value: "tvl", label: "Most used (TVL)" }, { value: "az", label: "A–Z" }]} className="shrink-0" />
      </div>

      {mine.length > 0 && cat === "All" && !q && (
        <Section title="In your Solana OS" subtitle="Apps you added or favorited">
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {mine.map((a) => (
              <div key={a.slug} className="w-[280px] shrink-0">
                <AppCard app={a} metrics={metrics[a.slug]} compact />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={cat === "All" ? "All apps" : cat} subtitle={`${list.length} apps`}>
        {list.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => (
              <AppCard key={a.slug} app={a} metrics={metrics[a.slug]} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="No apps match" body="Try another category or search term. Missing an app? Developers can submit it from the Developer Platform." />
          </Card>
        )}
      </Section>
    </Page>
  );
}

export default function AppsPage() {
  return (
    <Suspense>
      <Store />
    </Suspense>
  );
}
