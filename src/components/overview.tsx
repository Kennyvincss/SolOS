"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, Bell, Download, Flame, LayoutGrid, Newspaper, Sparkles, Star, TrendingUp, Wallet } from "lucide-react";
import { openAiPanel } from "./ai/side-panel";
import { AreaChart, Meter } from "./charts";
import { SearchBox, SuggestionChips } from "./search-box";
import { LogoMark } from "./shell/logo";
import { AppCard, NewsRow } from "./domain";
import { Card, CardHeader, DataBadge, Monogram, Select, Skeleton, SkeletonRows, StatCard, Tabs, Change, cn } from "./ui";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import { APPS } from "@/lib/catalog/apps";
import type { AppMetrics, NewsItem, Portfolio, PricePoint, Sourced, Token } from "@/lib/types";
import { fmtNum, fmtUsd } from "@/lib/format";

const SOL = "So11111111111111111111111111111111111111112";
type Range = "1D" | "7D" | "30D" | "90D";
const RANGE_LABEL: Record<Range, string> = { "1D": "24 hours", "7D": "7 days", "30D": "30 days", "90D": "90 days" };
type Focus = "all" | "market" | "portfolio" | "apps" | "news";

const priceFmt = (v: number) => fmtUsd(v);
const axisFmt = (v: number) => (Math.abs(v) >= 1000 ? fmtUsd(v, { compact: true }) : fmtUsd(v));

function downloadCsv(name: string, rows: PricePoint[]) {
  const csv = ["time,price_usd", ...rows.map((r) => `${new Date(r.t).toISOString()},${r.v}`)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ KPIs */

function Kpis({ tokens, loadingTokens }: { tokens: Token[]; loadingTokens: boolean }) {
  const s = useSession();
  const watch = useStore((st) => st.watchlist);
  const followed = useStore((st) => st.followed.length);
  const alerts = useStore((st) => st.notifications.filter((n) => !n.read && n.category === "wallet").length);
  const port = useApi<Sourced<Portfolio>>(s.address ? `/api/wallets/${s.address}` : null, { refreshMs: 60_000 });
  const net = useApi<Sourced<{ tps?: number; epoch: number; epochProgress: number }>>("/api/network", { refreshMs: 30_000 });
  const sol = tokens.find((t) => t.mint === SOL);
  const watched = tokens.filter((t) => watch.includes(t.mint) && t.change24h !== undefined);
  const avg = watched.length ? watched.reduce((a, t) => a + (t.change24h ?? 0), 0) / watched.length : undefined;

  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5 [&>*]:min-w-[210px] [&>*]:snap-start sm:[&>*]:min-w-0">
      {s.address ? (
        <StatCard
          icon={<Wallet size={17} />}
          tone="blue"
          label="Portfolio value"
          href="/portfolio"
          loading={port.loading}
          value={port.data?.data.totalUsd !== undefined ? fmtUsd(port.data.data.totalUsd, { compact: (port.data.data.totalUsd ?? 0) >= 1e6 }) : "—"}
          change={port.data?.data.change24hPct}
          changeLabel="today"
        />
      ) : (
        <Card className="p-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#2f6bff]/10 text-[#2f6bff]">
            <Wallet size={17} />
          </span>
          <div className="mt-3 text-[13px] text-muted">Portfolio value</div>
          <button onClick={() => s.setWalletModal(true)} className="mt-1 text-[15px] font-semibold text-sol-green hover:underline">
            Connect a wallet →
          </button>
        </Card>
      )}
      <StatCard icon={<Flame size={17} />} tone="red" label="SOL price" href={`/tokens/${SOL}`} loading={loadingTokens} value={fmtUsd(sol?.priceUsd)} change={sol?.change24h} changeLabel="24h" />
      <StatCard
        icon={<Activity size={17} />}
        tone="green"
        label="Network speed"
        href="/discover"
        loading={net.loading}
        value={net.data?.data.tps !== undefined ? `${fmtNum(Math.round(net.data.data.tps))} TPS` : "—"}
        sub={net.data ? `Epoch ${net.data.data.epoch} · ${Math.round(net.data.data.epochProgress * 100)}%` : undefined}
      />
      <StatCard icon={<Star size={17} />} tone="pink" label="Watchlist" href="/tokens?tab=watchlist" loading={loadingTokens} value={`${watch.length} ${watch.length === 1 ? "token" : "tokens"}`} change={avg} changeLabel="avg 24h" />
      <StatCard icon={<Bell size={17} />} tone="amber" label="Wallet alerts" href="/notifications" value={String(alerts)} sub={`from ${followed} followed ${followed === 1 ? "wallet" : "wallets"}`} />
    </div>
  );
}

/* --------------------------------------------------------- market chart */

function MarketChart({ tokens }: { tokens: Token[] }) {
  const options = tokens.slice(0, 5);
  const [mint, setMint] = useState<string>(SOL);
  const [range, setRange] = useState<Range>("7D");
  const current = options.find((t) => t.mint === mint) ?? options[0];
  const hist = useApi<Sourced<PricePoint[]>>(current ? `/api/tokens/${current.mint}/history?range=${range}` : null);
  const data = hist.data?.data ?? [];
  const change = data.length > 1 ? ((data[data.length - 1].v - data[0].v) / data[0].v) * 100 : undefined;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        icon={<TrendingUp size={17} />}
        tone="red"
        title="Market performance"
        subtitle={`Price over the last ${RANGE_LABEL[range]}`}
        action={
          <button onClick={() => current && data.length && downloadCsv(`${current.symbol}-${range}.csv`, data)} disabled={!data.length} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40">
            <Download size={14} /> <span className="hidden sm:inline">Export CSV</span>
          </button>
        }
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {options.length ? (
          <Tabs value={current?.mint ?? SOL} onChange={setMint} options={options.map((t) => ({ value: t.mint, label: t.symbol }))} className="min-w-0 flex-1" />
        ) : (
          <Skeleton className="h-9 w-64" />
        )}
        <div className="flex items-center gap-2">
          <DataBadge meta={hist.data?.meta} />
          <Select label="Range" value={range} onChange={setRange} options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ value: r, label: r === "1D" ? "24 Hours" : `${r.slice(0, -1)} Days` }))} />
        </div>
      </div>
      {current && (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tabular tracking-[-0.02em]">{fmtUsd(current.priceUsd)}</span>
          <Change value={change} className="text-[13px] font-medium" />
          <span className="text-[12.5px] text-muted">over {RANGE_LABEL[range]}</span>
        </div>
      )}
      <div className="mt-3">
        {hist.loading || !current ? (
          <Skeleton className="h-[260px] w-full rounded-xl" />
        ) : hist.error ? (
          <div className="grid h-[260px] place-items-center text-[13px] text-muted">{hist.error}</div>
        ) : (
          <AreaChart data={data} label={current.symbol} format={priceFmt} axisFormat={axisFmt} />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ top movers */

function Movers() {
  const { data, loading } = useApi<Sourced<Token[]>>("/api/tokens?list=gainers&limit=6", { refreshMs: 60_000 });
  const list = data?.data.slice(0, 5) ?? [];
  const top = Math.max(1, ...list.map((t) => Math.abs(t.change24h ?? 0)));
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <CardHeader icon={<Flame size={17} />} tone="violet" title="Top movers" subtitle="Biggest gainers in the last 24h" action={<DataBadge meta={data?.meta} />} />
      <div className="mt-4 flex-1 space-y-2.5">
        {loading && <SkeletonRows rows={5} />}
        {!loading && !list.length && <div className="grid h-full min-h-40 place-items-center text-center text-[13px] text-muted">No big movers right now.</div>}
        {list.map((t) => (
          <Link key={t.mint} href={`/tokens/${t.mint}`} className="block rounded-xl border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-2/40">
            <div className="flex items-center gap-2.5">
              <Monogram name={t.symbol} src={t.icon} size={28} rounded="full" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">{t.symbol}</div>
                <div className="truncate text-[11.5px] text-muted">{fmtUsd(t.priceUsd)} · Vol {fmtUsd(t.volume24h, { compact: true })}</div>
              </div>
              <Change value={t.change24h} className="text-[12.5px] font-medium" />
            </div>
            <Meter value={Math.abs(t.change24h ?? 0) / top} className="mt-2.5" />
          </Link>
        ))}
      </div>
      <Link href="/discover" className="mt-3 flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        See all movers <ArrowRight size={13} />
      </Link>
    </Card>
  );
}

/* --------------------------------------------------------------- top apps */

function TopApps() {
  const favorites = useStore((s) => s.favorites);
  const added = useStore((s) => s.addedApps);
  const { data } = useApi<{ metrics: Record<string, AppMetrics> }>("/api/apps");
  const apps = useMemo(() => {
    const mine = new Set([...favorites, ...added]);
    const ranked = [...APPS].sort((a, b) => (data?.metrics[b.slug]?.tvlUsd ?? 0) - (data?.metrics[a.slug]?.tvlUsd ?? 0));
    return [...ranked.filter((a) => mine.has(a.slug)), ...ranked.filter((a) => !mine.has(a.slug) && (a.featured || data))].slice(0, 6);
  }, [favorites, added, data]);
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        icon={<LayoutGrid size={17} />}
        tone="green"
        title="Top apps"
        subtitle="Your apps first, then the most used on Solana"
        action={
          <Link href="/apps" className="flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            App Store <ArrowRight size={13} />
          </Link>
        }
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((a) => (
          <AppCard key={a.slug} app={a} metrics={data?.metrics[a.slug]} />
        ))}
      </div>
    </Card>
  );
}

function News() {
  const { data, loading } = useApi<Sourced<NewsItem[]>>("/api/news");
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader icon={<Newspaper size={17} />} tone="blue" title="Latest news" subtitle="Headlines from across the Solana ecosystem" action={<DataBadge meta={data?.meta} />} />
      {loading && <SkeletonRows rows={4} className="mt-4" />}
      <div className="-mx-2 mt-2 divide-y divide-line">
        {data?.data.slice(0, 6).map((n) => (
          <NewsRow key={n.id} n={n} compact />
        ))}
      </div>
    </Card>
  );
}

/** First-visit welcome: what STRATA is, the universal search box and how to start. */
function Welcome() {
  const s = useSession();
  return (
    <Card className="glow-bg mb-5 overflow-hidden p-5 sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="lg:w-[46%]">
          <LogoMark size={40} />
          <h2 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[30px]">The browser for the onchain world.</h2>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">Search any token, wallet or app, research with STRATA AI, and use every onchain app with your wallet built in.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => s.setWalletModal(true)} className="btn btn-primary btn-sm">
              <Wallet size={14} /> Connect wallet
            </button>
            <button onClick={() => openAiPanel()} className="btn btn-ghost btn-sm">
              <Sparkles size={14} className="text-sol-green" /> Ask STRATA AI
            </button>
            <Link href="/login" className="btn btn-ghost btn-sm">
              Sign in
            </Link>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <SearchBox />
          <div className="mt-3 hidden sm:block">
            <SuggestionChips />
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- page */

export function Overview() {
  const s = useSession();
  const watch = useStore((st) => st.watchlist);
  const [focus, setFocus] = useState<Focus>("all");
  const mints = [SOL, ...watch.filter((m) => m !== SOL)].slice(0, 12);
  const toks = useApi<Sourced<Token[]>>(`/api/tokens?list=mints&mints=${mints.join(",")}`, { refreshMs: 60_000 });
  const tokens = useMemo(() => {
    const list = toks.data?.data ?? [];
    return [...list].sort((a, b) => mints.indexOf(a.mint) - mints.indexOf(b.mint));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toks.data, mints.join(",")]);
  const show = (f: Focus) => focus === "all" || focus === f;
  const name = s.user?.name?.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 md:pb-16 lg:px-8 lg:pt-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12.5px] text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{name ? `Welcome back, ${name}` : "Overview"}</h1>
        </div>
        <Tabs
          value={focus}
          onChange={setFocus}
          options={[
            { value: "all", label: "All" },
            { value: "market", label: "Market" },
            { value: "portfolio", label: "Portfolio" },
            { value: "apps", label: "Apps" },
            { value: "news", label: "News" },
          ]}
        />
      </div>

      {!s.user && !s.wallet && s.ready && <Welcome />}

      {(show("market") || show("portfolio")) && <Kpis tokens={tokens} loadingTokens={toks.loading} />}

      {show("market") && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <MarketChart tokens={tokens} />
          <Movers />
        </div>
      )}

      {show("portfolio") && s.address && focus === "portfolio" && (
        <Card href="/portfolio" className={cn("mt-4 flex items-center justify-between p-5")}>
          <div>
            <div className="text-[15px] font-semibold">Open your full portfolio</div>
            <div className="text-[13px] text-muted">Holdings, allocation, PnL and activity for your wallet.</div>
          </div>
          <ArrowRight size={16} className="text-muted" />
        </Card>
      )}

      {show("apps") && (
        <div className="mt-4">
          <TopApps />
        </div>
      )}
      {show("news") && (
        <div className="mt-4">
          <News />
        </div>
      )}
    </div>
  );
}
