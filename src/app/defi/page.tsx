"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Card, Change, DataBadge, DemoNotice, EmptyState, InfoNote, Monogram, Page, PageHeader, Section, SkeletonRows, Tabs, cn } from "@/components/ui";
import { AppCard } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { APPS } from "@/lib/catalog/apps";
import { DEFI_CATEGORIES, type DefiCategory, type Protocol, type Sourced, type YieldPool } from "@/lib/types";
import { fmtUsd } from "@/lib/format";

const LLAMA_TO_DEFI: [RegExp, DefiCategory[]][] = [
  [/^dexs?$|dex aggregator/i, ["Swapping", "Liquidity providing"]],
  [/lending/i, ["Lending", "Borrowing"]],
  [/liquid staking/i, ["Liquid staking", "Staking"]],
  [/staking pool|staking/i, ["Staking"]],
  [/derivatives|perps|options/i, ["Perpetuals"]],
  [/yield/i, ["Yield"]],
  [/restaking/i, ["Restaking"]],
  [/cdp|stablecoin|algo-stables|basis trading/i, ["Stablecoins"]],
];

function defiCats(p: Protocol): DefiCategory[] {
  for (const [re, cats] of LLAMA_TO_DEFI) if (re.test(p.category)) return cats;
  return [];
}

const APP_SUB: Partial<Record<DefiCategory, string[]>> = {
  Swapping: ["Swapping", "Aggregator"],
  Lending: ["Lending"],
  Borrowing: ["Borrowing", "Lending"],
  Staking: ["Staking", "Liquid staking"],
  "Liquid staking": ["Liquid staking"],
  "Liquidity providing": ["Liquidity providing"],
  Perpetuals: ["Perpetuals"],
  Yield: ["Yield"],
  Restaking: ["Restaking"],
  Stablecoins: ["Stablecoins"],
};

function DefiInner() {
  const params = useSearchParams();
  const [cat, setCat] = useState<DefiCategory | "All">("All");
  const [asset, setAsset] = useState(params.get("asset") ?? "");
  const [compare, setCompare] = useState<string[]>([]);
  const { data, loading, error } = useApi<{ protocols: Sourced<Protocol[]>; yields: Sourced<YieldPool[]>; dexVolume: Sourced<{ total24h?: number }> }>("/api/defi");

  const protocols = useMemo(() => (data?.protocols.data ?? []).filter((p) => cat === "All" ? defiCats(p).length : defiCats(p).includes(cat)).slice(0, 25), [data, cat]);
  const pools = useMemo(() => {
    const a = asset.trim().toUpperCase();
    return (data?.yields.data ?? [])
      .filter((p) => (cat === "All" || p.category === cat || (cat === "Borrowing" && p.category === "Lending") || (cat === "Staking" && p.category === "Liquid staking") || (cat === "Swapping" && p.category === "Liquidity providing")) && (!a || p.symbol.toUpperCase().includes(a)))
      .slice(0, 30);
  }, [data, cat, asset]);
  const apps = APPS.filter((a) => a.category === "DeFi" || a.category === "Trading").filter((a) => cat === "All" || a.subcategories?.some((s) => APP_SUB[cat]?.includes(s)));
  const compared = (data?.protocols.data ?? []).filter((p) => compare.includes(p.slug));
  const totalTvl = (data?.protocols.data ?? []).reduce((s, p) => s + (defiCats(p).length ? p.tvlUsd ?? 0 : 0), 0);

  return (
    <Page wide>
      <PageHeader title="DeFi" subtitle="Swap, lend, borrow, stake and earn across Solana. Compare protocols and discover opportunities. Information, not financial advice." actions={<DataBadge meta={data?.protocols.meta} />} />
      <DemoNotice meta={data?.protocols.meta} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[12px] text-muted">DeFi TVL on Solana (tracked)</div>
          <div className="mt-1 text-[22px] font-semibold tabular">{fmtUsd(totalTvl || undefined, { compact: true })}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12px] text-muted">DEX volume (24h)</div>
          <div className="mt-1 text-[22px] font-semibold tabular">{fmtUsd(data?.dexVolume.data.total24h, { compact: true })}</div>
        </Card>
        <Card className="col-span-2 p-4 sm:col-span-1">
          <div className="text-[12px] text-muted">Yield pools tracked</div>
          <div className="mt-1 text-[22px] font-semibold tabular">{data?.yields.data.length ?? "—"}</div>
        </Card>
      </div>
      <Tabs value={cat} onChange={setCat} options={[{ value: "All" as const, label: "All" }, ...DEFI_CATEGORIES.map((c) => ({ value: c, label: c }))]} className="mb-6" />

      {compared.length > 0 && (
        <Section title="Compare">
          <Card className="overflow-x-auto p-4">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="pb-2 font-medium">Protocol</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">TVL</th>
                  <th className="pb-2 text-right font-medium">1d</th>
                  <th className="pb-2 text-right font-medium">7d</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {compared.map((p) => (
                  <tr key={p.slug} className="border-t border-line">
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="text-muted">{p.category}</td>
                    <td className="text-right tabular">{fmtUsd(p.tvlUsd, { compact: true })}</td>
                    <td className="text-right">
                      <Change value={p.change1d} />
                    </td>
                    <td className="text-right">
                      <Change value={p.change7d} />
                    </td>
                    <td className="text-right">
                      <button onClick={() => setCompare((c) => c.filter((x) => x !== p.slug))} aria-label="Remove" className="text-faint hover:text-fg">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Protocols" subtitle="By TVL on Solana · tap to compare (up to 4)" className="mt-0">
          <Card className="p-2">
            {loading && <SkeletonRows rows={6} className="p-3" />}
            {error && <p className="p-3 text-[13px] text-muted">{error}</p>}
            {data && !protocols.length && <EmptyState title="No protocols in this category" />}
            {protocols.map((p) => {
              const on = compare.includes(p.slug);
              return (
                <button key={p.slug} onClick={() => setCompare((c) => (on ? c.filter((x) => x !== p.slug) : c.length < 4 ? [...c, p.slug] : c))} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", on && "bg-surface-2")}>
                  <Monogram name={p.name} src={p.logo} size={32} rounded="full" color="#9ba1ab" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{p.name}</div>
                    <div className="text-[12px] text-muted">{p.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13.5px] tabular">{fmtUsd(p.tvlUsd, { compact: true })}</div>
                    <Change value={p.change7d} className="text-[11.5px]" />
                  </div>
                </button>
              );
            })}
          </Card>
        </Section>
        <Section title="Opportunities" subtitle="Yield pools with >$100K TVL, largest first" className="mt-0" action={<DataBadge meta={data?.yields.meta} />}>
          <Card className="p-3 sm:p-4">
            <input value={asset} onChange={(e) => setAsset(e.target.value)} className="input mb-2 h-9 text-[13px]" placeholder="Filter by asset, e.g. USDC, SOL, JitoSOL" />
            {loading && <SkeletonRows rows={6} />}
            {data && !pools.length && <EmptyState title="No pools match" />}
            <div className="divide-y divide-line">
              {pools.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.symbol}</div>
                    <div className="truncate text-[12px] text-muted">
                      {p.project} · {p.category}
                      {p.ilRisk === "yes" && <span className="text-warn"> · IL risk</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular">
                    <div className="text-up">{p.apy !== undefined ? `${p.apy.toFixed(2)}%` : "—"}</div>
                    <div className="text-[11.5px] text-muted">
                      {p.apyReward ? `incl. ${p.apyReward.toFixed(1)}% rewards · ` : ""}TVL {fmtUsd(p.tvlUsd, { compact: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>
      </div>
      <InfoNote className="mt-4">APYs are variable and often include token rewards that can change or end. Every protocol carries smart-contract risk; LP positions can suffer impermanent loss.</InfoNote>

      <Section title="Apps">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <AppCard key={a.slug} app={a} />
          ))}
        </div>
      </Section>
    </Page>
  );
}

export default function DefiPage() {
  return (
    <Suspense>
      <DefiInner />
    </Suspense>
  );
}
