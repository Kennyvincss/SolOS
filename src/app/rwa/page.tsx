"use client";

import { useState } from "react";
import { Card, Change, DataBadge, EmptyState, InfoNote, Monogram, Page, PageHeader, Section, SkeletonRows, Tabs } from "@/components/ui";
import { AppCard } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { APPS } from "@/lib/catalog/apps";
import type { Protocol, Sourced } from "@/lib/types";
import { fmtUsd } from "@/lib/format";

const CATS = ["All", "Tokenized stocks", "Treasury products", "Funds", "Commodities", "Credit", "Real-world assets"] as const;

export default function RwaPage() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const { data, loading } = useApi<{ protocols: Sourced<Protocol[]> }>("/api/defi");
  const rwaProtocols = (data?.protocols.data ?? []).filter((p) => /rwa/i.test(p.category));
  const apps = APPS.filter((a) => a.category === "RWA" && (cat === "All" || a.subcategories?.includes(cat)));
  return (
    <Page wide>
      <PageHeader title="Real-world assets" subtitle="Tokenized stocks, treasuries, funds, commodities and credit on Solana." />
      <Tabs value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c }))} className="mb-6" />
      <Section title="Products & issuers" className="mt-0">
        {apps.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <AppCard key={a.slug} app={a} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title={`No ${cat.toLowerCase()} products in the registry yet`} body="Issuers can submit products from the Developer Platform." />
          </Card>
        )}
      </Section>
      <Section title="RWA protocols by TVL on Solana" action={<DataBadge meta={data?.protocols.meta} />}>
        <Card className="p-2">
          {loading && <SkeletonRows rows={5} className="p-3" />}
          {data && !rwaProtocols.length && <EmptyState title="No RWA protocols returned" />}
          {rwaProtocols.slice(0, 20).map((p) => (
            <a key={p.slug} href={p.url ?? `https://defillama.com/protocol/${p.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
              <Monogram name={p.name} src={p.logo} size={32} rounded="full" color="#9ba1ab" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{p.name}</div>
                <div className="text-[12px] text-muted">{p.category}</div>
              </div>
              <div className="text-right">
                <div className="text-[13.5px] tabular">{fmtUsd(p.tvlUsd, { compact: true })}</div>
                <Change value={p.change7d} className="text-[11.5px]" />
              </div>
            </a>
          ))}
        </Card>
      </Section>
      <InfoNote className="mt-6">Tokenized assets carry issuer, custody and legal risks in addition to smart-contract risk, and many are only available to non-US or accredited investors. Check each issuer&apos;s eligibility rules.</InfoNote>
    </Page>
  );
}
