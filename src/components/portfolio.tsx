"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Layers } from "lucide-react";
import type { ActivityItem, Portfolio, PricePoint, RiskIndicator, Sourced } from "@/lib/types";
import type { PnlResult, PnlWindow } from "@/lib/services/pnl-core";
import { useApi } from "@/lib/client/fetch";
import { fmtUsd, fmtNum } from "@/lib/format";
import { APPS } from "@/lib/catalog/apps";
import { AreaChart } from "./charts";
import { ActivityList, AllocationBreakdown, HoldingsTable, TokenAllocation } from "./domain";
import { Card, Change, DataBadge, DemoNotice, EmptyState, InfoNote, RiskPill, Section, Skeleton, SkeletonRows, Stat, Tabs } from "./ui";
import { useState } from "react";

const LST_PROTOCOL: Record<string, string> = { JitoSOL: "jito", mSOL: "marinade", bSOL: "sanctum", INF: "sanctum", JLP: "jupiter" };

/** Current holdings valued at historical prices. Honest proxy when no indexer provides true history. */
function HoldingsHistory({ p }: { p: Portfolio }) {
  const top = p.holdings.filter((h) => h.valueUsd && h.kind !== "stable").sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)).slice(0, 5);
  const stable = p.holdings.filter((h) => h.kind === "stable").reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const h0 = useApi<Sourced<PricePoint[]>>(top[0] ? `/api/tokens/${top[0].mint}/history?range=30D` : null);
  const h1 = useApi<Sourced<PricePoint[]>>(top[1] ? `/api/tokens/${top[1].mint}/history?range=30D` : null);
  const h2 = useApi<Sourced<PricePoint[]>>(top[2] ? `/api/tokens/${top[2].mint}/history?range=30D` : null);
  const h3 = useApi<Sourced<PricePoint[]>>(top[3] ? `/api/tokens/${top[3].mint}/history?range=30D` : null);
  const h4 = useApi<Sourced<PricePoint[]>>(top[4] ? `/api/tokens/${top[4].mint}/history?range=30D` : null);
  const hs = [h0, h1, h2, h3, h4].slice(0, top.length);
  const loading = hs.some((h) => h.loading);
  const series = useMemo(() => {
    const lists = hs.map((h) => h.data?.data ?? []);
    if (!lists.length || lists.some((l) => l.length < 2)) return [];
    const base = lists[0];
    const others = p.holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0) - stable - top.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    return base.map((pt) => {
      let v = stable + others;
      lists.forEach((l, i) => {
        // nearest point in time for each series
        let best = l[0];
        for (const x of l) if (Math.abs(x.t - pt.t) < Math.abs(best.t - pt.t)) best = x;
        v += top[i].amount * best.v;
      });
      return { t: pt.t, v };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hs.map((h) => h.data).join("|"), p]);
  if (!top.length) return null;
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Value of current holdings · 30 days</h3>
        <DataBadge meta={h0.data?.meta} />
      </div>
      {loading ? <Skeleton className="h-[220px] w-full rounded-xl" /> : <AreaChart data={series} height={220} label="Holdings value" />}
      <p className="mt-2 text-[11.5px] leading-relaxed text-faint">Your current balances priced at each point in time. It ignores past trades and transfers, so it is not a record of realized performance.</p>
    </Card>
  );
}

function portfolioRisks(p: Portfolio): RiskIndicator[] {
  const total = p.totalUsd ?? 0;
  const out: RiskIndicator[] = [];
  if (!total) return out;
  const top = [...p.holdings].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))[0];
  const topPct = ((top?.valueUsd ?? 0) / total) * 100;
  out.push({ id: "conc", label: "Largest position", level: topPct > 70 && top?.kind !== "stable" && top?.kind !== "sol" ? "high" : topPct > 50 ? "medium" : "low", value: `${top?.symbol} ${topPct.toFixed(0)}%`, explanation: "Share of the portfolio in a single asset." });
  const stable = p.holdings.filter((h) => h.kind === "stable").reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  out.push({ id: "stable", label: "Stablecoin share", level: "low", value: `${((stable / total) * 100).toFixed(0)}%`, explanation: "Portion held in dollar stablecoins, which carry issuer and depeg risk rather than price volatility." });
  const small = p.holdings.filter((h) => h.kind === "token" && (h.valueUsd ?? 0) > 0 && !["JUP", "JTO", "PYTH", "RAY", "ORCA", "RENDER", "HNT", "W", "KMNO", "DRIFT", "JLP"].includes(h.symbol ?? "")).reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  out.push({ id: "spec", label: "Long-tail tokens", level: small / total > 0.4 ? "high" : small / total > 0.15 ? "medium" : "low", value: `${((small / total) * 100).toFixed(0)}%`, explanation: "Share in tokens outside SOL, stablecoins, staked SOL and major ecosystem tokens. These tend to be more volatile and less liquid." });
  if (p.unpricedCount) out.push({ id: "unpriced", label: "Unpriced tokens", level: "medium", value: `${p.unpricedCount}`, explanation: "Tokens with no market price. Unknown tokens sent to your wallet can be scams; don't interact with them." });
  return out;
}

function PnlStat({ label, w, loading, failed }: { label: string; w?: PnlWindow; loading: boolean; failed: boolean }) {
  if (!w) return <Stat label={label} value={<span className="text-faint">{loading ? "…" : "—"}</span>} sub={<span className="text-faint">{loading ? "Calculating" : failed ? "Unavailable" : ""}</span>} />;
  const tone = w.total > 0 ? "text-up" : w.total < 0 ? "text-down" : "";
  return (
    <Stat
      label={label}
      value={<span className={tone}>{`${w.total > 0 ? "+" : w.total < 0 ? "−" : ""}${fmtUsd(Math.abs(w.total))}`}</span>}
      sub={<span className="text-faint">{`${fmtUsd(w.realized)} realized · ${fmtUsd(w.unrealized)} open`}</span>}
    />
  );
}

export function PortfolioView({ address, own }: { address: string; own?: boolean }) {
  const { data, error, loading, reload } = useApi<Sourced<Portfolio>>(`/api/wallets/${address}`, { refreshMs: 60_000 });
  const act = useApi<Sourced<ActivityItem[]>>(`/api/wallets/${address}/activity?limit=25`);
  const pnl = useApi<PnlResult>(address === "demo" ? null : `/api/wallets/${address}/pnl`);
  const [allocBy, setAllocBy] = useState<"type" | "token">("type");

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  if (error)
    return (
      <Card className="p-5">
        <div className="text-[14px] text-down">{error}</div>
        <button onClick={reload} className="btn btn-ghost btn-sm mt-3">
          Retry
        </button>
      </Card>
    );
  if (!data) return null;
  const p = data.data;
  const lsts = p.holdings.filter((h) => h.kind === "lst" || LST_PROTOCOL[h.symbol ?? ""]);
  const exposure = new Map<string, number>();
  for (const h of p.holdings) {
    const slug = LST_PROTOCOL[h.symbol ?? ""] ?? APPS.find((a) => a.token?.mint === h.mint)?.slug;
    if (slug && h.valueUsd) exposure.set(slug, (exposure.get(slug) ?? 0) + h.valueUsd);
  }
  const risks = portfolioRisks(p);
  const groups: [string, typeof p.holdings][] = [
    ["SOL", p.holdings.filter((h) => h.kind === "sol")],
    ["Stablecoins", p.holdings.filter((h) => h.kind === "stable")],
    ["Staked SOL", p.holdings.filter((h) => h.kind === "lst")],
    ["Tokens", p.holdings.filter((h) => h.kind === "token")],
    ["RWAs", p.holdings.filter((h) => h.kind === "rwa")],
  ];

  return (
    <div>
      <DemoNotice meta={data.meta} />
      <Card className="glow-bg p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
          <span>{own ? "Total portfolio value" : "Portfolio value"}</span>
          <DataBadge meta={data.meta} />
        </div>
        <div className="mt-2 text-[38px] font-semibold tabular leading-none tracking-[-0.03em] sm:text-[46px]">{p.totalUsd !== undefined ? fmtUsd(p.totalUsd) : "—"}</div>
        <div className="mt-2 text-[14px]">
          <Change value={p.change24hPct} /> <span className="text-muted">today</span>
          {p.totalUsd !== undefined && p.change24hPct !== undefined && <span className="ml-2 text-muted tabular">({fmtUsd((p.totalUsd * p.change24hPct) / (100 + p.change24hPct))})</span>}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="24h change (price)" value={<Change value={p.change24hPct} />} />
          <PnlStat label="7d PnL" w={pnl.data?.d7} loading={pnl.loading} failed={!!pnl.error} />
          <PnlStat label="30d PnL" w={pnl.data?.d30} loading={pnl.loading} failed={!!pnl.error} />
          <PnlStat label={pnl.data && !pnl.data.complete && pnl.data.historyFrom ? `PnL since ${new Date(pnl.data.historyFrom).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "All-time PnL"} w={pnl.data?.all} loading={pnl.loading} failed={!!pnl.error} />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          {pnl.data
            ? `Profit and loss from ${pnl.data.trades} ${pnl.data.trades === 1 ? "trade" : "trades"}${pnl.data.complete ? "" : " (most recent)"}. "Realized" is from what you sold; "open" is on what you still hold. Transfers and airdrops don't count.`
            : pnl.error
              ? "Couldn't load profit and loss right now. Try again in a minute."
              : "Working out profit and loss from your trades…"}
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <HoldingsHistory p={p} />
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Allocation</h3>
            <Tabs value={allocBy} onChange={setAllocBy} options={[{ value: "type", label: "Type" }, { value: "token", label: "Token" }]} />
          </div>
          {p.totalUsd ? allocBy === "type" ? <AllocationBreakdown p={p} /> : <TokenAllocation p={p} /> : <EmptyState title="No priced assets" />}
        </Card>
      </div>

      <Section title="Assets" subtitle={`${p.holdings.length} tokens${p.nfts.length ? ` · ${p.nfts.length} NFTs` : ""}${p.unpricedCount ? ` · ${p.unpricedCount} without a price` : ""}`}>
        <div className="grid gap-4 lg:grid-cols-2">
          {groups
            .filter(([, list]) => list.length)
            .map(([label, list]) => (
              <Card key={label} className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold">{label}</h3>
                  <span className="text-[13px] tabular text-muted">{fmtUsd(list.reduce((s, h) => s + (h.valueUsd ?? 0), 0))}</span>
                </div>
                <HoldingsTable p={{ ...p, holdings: list }} />
              </Card>
            ))}
          {p.nfts.length > 0 && (
            <Card className="p-4 sm:p-5">
              <h3 className="text-[14px] font-semibold">NFTs</h3>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {p.nfts.slice(0, 24).map((n) => (
                  <Link key={n.mint} href={`/tokens/${n.mint}`} className="grid aspect-square place-items-center rounded-xl bg-surface-2 text-[10px] text-faint" title={n.mint}>
                    NFT
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </Section>

      <Section title="Positions">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold">
              <Layers size={15} /> Staking
            </h3>
            {lsts.length ? (
              <HoldingsTable p={{ ...p, holdings: lsts }} />
            ) : (
              <p className="mt-2 text-[13px] text-muted">No liquid staking tokens found.</p>
            )}
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="text-[14px] font-semibold">Lending, liquidity & perps positions</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Positions you hold inside apps like Kamino, marginfi, Drift, Orca or Raydium aren&apos;t shown here yet. Open the app to see them.
            </p>
          </Card>
        </div>
      </Section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Section title="Protocol exposure" subtitle="Through tokens you hold" className="mt-0">
          <Card className="p-4 sm:p-5">
            {exposure.size ? (
              <div className="divide-y divide-line">
                {[...exposure]
                  .sort((a, b) => b[1] - a[1])
                  .map(([slug, v]) => {
                    const app = APPS.find((a) => a.slug === slug)!;
                    return (
                      <Link key={slug} href={`/apps/${slug}`} className="flex items-center justify-between py-2.5 text-[13.5px] hover:text-sol-green">
                        <span>{app?.name ?? slug}</span>
                        <span className="tabular text-muted">
                          {fmtUsd(v)} · {p.totalUsd ? ((v / p.totalUsd) * 100).toFixed(1) : "0"}%
                        </span>
                      </Link>
                    );
                  })}
              </div>
            ) : (
              <p className="text-[13px] text-muted">No protocol tokens held.</p>
            )}
          </Card>
        </Section>
        <Section title="Risk indicators" className="mt-0">
          <Card className="p-4 sm:p-5">
            {risks.length ? (
              <div className="divide-y divide-line">
                {risks.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 py-2.5">
                    <div className="w-[76px] shrink-0">
                      <RiskPill level={r.level} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-[13.5px] font-medium">
                        {r.label} <span className="font-mono text-[12px] text-muted">{r.value}</span>
                      </div>
                      <p className="text-[12.5px] text-muted">{r.explanation}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">Not enough priced assets to assess.</p>
            )}
          </Card>
        </Section>
      </div>

      <Section title="Activity" action={<DataBadge meta={act.data?.meta} />}>
        <Card className="p-4 sm:p-5">
          {act.loading && <SkeletonRows rows={5} />}
          {act.error && (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <AlertTriangle size={14} /> {act.error}
            </p>
          )}
          {act.data && <ActivityList items={act.data.data} />}
          {act.data && act.data.data.length > 0 && <p className="mt-2 text-[11.5px] text-faint">Most recent {fmtNum(act.data.data.length)} transactions. Swaps, transfers, deposits and withdrawals are decoded from on-chain balance changes.</p>}
        </Card>
      </Section>
      <InfoNote className="mt-6">Only public on-chain data is shown. Solana OS never reveals anything that isn&apos;t already visible on the blockchain.</InfoNote>
    </div>
  );
}
