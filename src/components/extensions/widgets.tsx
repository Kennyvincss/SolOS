"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Plug } from "lucide-react";
import { createHost, type ExtensionHost, type ExtensionManifest } from "@/lib/extensions/sdk";
import { apiGet } from "@/lib/client/fetch";
import { useActions, useStore } from "@/lib/client/store";
import { useSession } from "@/lib/client/session";
import type { NewsItem, Portfolio, PredictionMarket, Protocol, RiskReport, Sourced, YieldPool } from "@/lib/types";
import type { NetworkStatus } from "@/lib/services/ecosystem";
import { fmtNum, fmtUsd, shortAddr } from "@/lib/format";
import { isAddress } from "@/lib/solana/address";
import { Change, DataBadge, Monogram, Skeleton, SkeletonRows } from "../ui";
import { Markdown, NewsRow, RiskList } from "../domain";
import { FollowingFeed } from "../wallet-tools";
import { Meter } from "../charts";

/** Build the permission-checked SDK host for one extension. */
export function useHost(manifest: ExtensionManifest): ExtensionHost {
  const session = useSession();
  const prefs = useStore((s) => s.extPrefs);
  const { setExtPref, notify } = useActions();
  return useMemo(
    () =>
      createHost(manifest, {
        fetchJson: async (path, init) => {
          if (init?.method === "POST") {
            const r = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
            const body = await r.json();
            if (!r.ok) throw new Error(body.error ?? "Request failed");
            return body;
          }
          return apiGet(path);
        },
        getConnectedWallet: () => session.address,
        getPref: (id, key) => prefs[id]?.[key],
        setPref: (id, key, value) => setExtPref(id, key, value),
        notify: (id, n) => notify({ ...n, source: manifest.name, category: n.category }),
      }),
    [manifest, session.address, prefs, setExtPref, notify],
  );
}

/** Run a host call and keep its result in state. */
function useHostCall<T>(fn: () => Promise<unknown>, deps: unknown[], refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => {
    fn()
      .then((d) => {
        setData(d as T);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
    if (!refreshMs) return;
    const t = setInterval(run, refreshMs);
    return () => clearInterval(t);
  }, [run, refreshMs]);
  return { data, error };
}

function NeedsProvider({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-surface-2/60 p-3 text-[12.5px] leading-relaxed text-muted">
      <Plug size={14} className="mt-0.5 shrink-0" />
      <span>
        Requires {text}. Nothing is shown until it&apos;s connected, so there are no made-up numbers. Configure providers in <Link href="/settings" className="underline">Settings</Link>.
      </span>
    </div>
  );
}

function ConnectPrompt() {
  const s = useSession();
  return (
    <button onClick={() => s.setWalletModal(true)} className="btn btn-soft btn-sm">
      Connect wallet
    </button>
  );
}

type WidgetProps = { host: ExtensionHost; manifest: ExtensionManifest };

function PortfolioWidget({ host }: WidgetProps) {
  const session = useSession();
  const { data, error } = useHostCall<Sourced<Portfolio> | null>(() => host.portfolio.mine(), [session.address], 60_000);
  if (!session.address) return <ConnectPrompt />;
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!data) return <Skeleton className="h-20 w-full" />;
  const p = data.data;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-[26px] font-semibold tabular">{fmtUsd(p.totalUsd)}</div>
        <Change value={p.change24hPct} className="text-[13px]" />
      </div>
      <div className="mt-3 space-y-1.5">
        {p.holdings.slice(0, 4).map((h) => (
          <div key={h.mint} className="flex items-center justify-between text-[13px]">
            <span>{h.symbol ?? shortAddr(h.mint)}</span>
            <span className="tabular text-muted">{fmtUsd(h.valueUsd)}</span>
          </div>
        ))}
      </div>
      <DataBadge meta={data.meta} className="mt-3" />
    </div>
  );
}

function NetworkWidget({ host }: WidgetProps) {
  const { data, error } = useHostCall<Sourced<NetworkStatus>>(() => host.network.status(), [], 15_000);
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!data) return <Skeleton className="h-16 w-full" />;
  const n = data.data;
  const level = n.priorityFee.p75 > 100_000 ? "High" : n.priorityFee.p75 > 10_000 ? "Elevated" : "Normal";
  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex justify-between">
        <span className="text-muted">Slot</span>
        <span className="tabular">{n.slot.toLocaleString()}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Throughput</span>
        <span className="tabular">{n.tps ? `${fmtNum(Math.round(n.tps))} TPS` : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Priority fees</span>
        <span className={level === "Normal" ? "text-up" : "text-warn"}>{level}</span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11.5px] text-faint">
          <span>Epoch {n.epoch}</span>
          <span>{Math.round(n.epochProgress * 100)}%</span>
        </div>
        <Meter value={n.epochProgress} />
      </div>
    </div>
  );
}

function ScannerWidget({ host, kind }: WidgetProps & { kind: "token" | "any" }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (kind === "token" && !isAddress(q.trim())) return setErr("Paste a token mint address");
          setBusy(true);
          setErr(null);
          try {
            setReport((await host.programs.account(q.trim())) as RiskReport);
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input h-9 text-[13px]" placeholder={kind === "token" ? "Token mint address" : "Website, wallet or program"} />
        <button className="btn btn-soft btn-sm h-9">{busy ? <Loader2 size={14} className="animate-spin" /> : "Scan"}</button>
      </form>
      {err && <p className="mt-2 text-[12px] text-down">{err}</p>}
      {report && (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <RiskList report={report} />
        </div>
      )}
    </div>
  );
}

function MarketsWidget({ host }: WidgetProps) {
  const { data, error } = useHostCall<Sourced<PredictionMarket[]>>(() => host.markets.list(), [], 60_000);
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!data) return <SkeletonRows rows={3} />;
  return (
    <div className="space-y-3">
      <DataBadge meta={data.meta} />
      {data.data.slice(0, 4).map((m) => (
        <div key={m.id}>
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="line-clamp-1">{m.question}</span>
            <span className="tabular font-medium">{Math.round(m.probability * 100)}%</span>
          </div>
          <Meter value={m.probability} className="mt-1" />
        </div>
      ))}
    </div>
  );
}

function NftWidget({ host }: WidgetProps) {
  const session = useSession();
  const { data } = useHostCall<Sourced<Portfolio> | null>(() => host.portfolio.mine(), [session.address]);
  if (!session.address) return <ConnectPrompt />;
  if (!data) return <Skeleton className="h-12 w-full" />;
  return (
    <div>
      <div className="text-[26px] font-semibold tabular">{data.data.nfts.length}</div>
      <div className="text-[12.5px] text-muted">NFTs detected in your wallet</div>
      <div className="mt-3">
        <NeedsProvider text="a DAS-compatible provider for images and floor prices" />
      </div>
    </div>
  );
}

function DefiWidget({ host }: WidgetProps) {
  const { data, error } = useHostCall<{ protocols: Sourced<Protocol[]>; yields: Sourced<YieldPool[]> }>(() => host.defi.overview(), [], 10 * 60_000);
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!data) return <SkeletonRows rows={4} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center justify-between text-[12px] font-medium text-muted">
          Top protocols <DataBadge meta={data.protocols.meta} />
        </div>
        {data.protocols.data.slice(0, 5).map((p) => (
          <div key={p.slug} className="flex justify-between py-1 text-[13px]">
            <span>{p.name}</span>
            <span className="tabular text-muted">{fmtUsd(p.tvlUsd, { compact: true })}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-2 text-[12px] font-medium text-muted">Largest yield pools</div>
        {data.yields.data.slice(0, 5).map((p) => (
          <div key={p.id} className="flex justify-between py-1 text-[13px]">
            <span className="truncate">
              {p.symbol} <span className="text-faint">· {p.project}</span>
            </span>
            <span className="tabular text-up">{p.apy !== undefined ? `${p.apy.toFixed(1)}%` : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsWidget({ host }: WidgetProps) {
  const { data, error } = useHostCall<Sourced<NewsItem[]>>(() => host.news.latest(), [], 10 * 60_000);
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!data) return <SkeletonRows rows={3} />;
  return (
    <div className="-mx-2 divide-y divide-line">
      {data.data.slice(0, 4).map((n) => (
        <NewsRow key={n.id} n={n} compact />
      ))}
    </div>
  );
}

function AiResearchWidget({ host }: WidgetProps) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setBusy(true);
          setOut(null);
          try {
            setOut(await host.ai.ask(`Write a short research brief on ${q.trim()} for Solana users: what it is, key live data, and risks. Separate verified data from analysis. Under 180 words.`));
          } catch (x) {
            setOut(`_${(x as Error).message}_`);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input h-9 text-[13px]" placeholder="Token or protocol, e.g. JUP or Kamino" />
        <button className="btn btn-soft btn-sm h-9">{busy ? <Loader2 size={14} className="animate-spin" /> : "Research"}</button>
      </form>
      {out && (
        <div className="mt-3 max-h-80 overflow-y-auto text-[13px]">
          <Markdown text={out} />
        </div>
      )}
    </div>
  );
}

function PriceAlertsWidget() {
  const alerts = useStore((s) => s.priceAlerts);
  const { removePriceAlert } = useActions();
  if (!alerts.length) return <p className="text-[13px] text-muted">No price alerts yet. Open a token and tap “Alert”.</p>;
  return (
    <div className="divide-y divide-line">
      {alerts.map((a) => (
        <div key={a.id} className="flex items-center justify-between py-2 text-[13px]">
          <Link href={`/tokens/${a.mint}`}>
            {a.symbol} {a.direction} {fmtUsd(a.price)}
          </Link>
          <span className="flex items-center gap-2">
            {a.triggered && <span className="text-[11px] text-sol-green">Triggered</span>}
            <button onClick={() => removePriceAlert(a.id)} className="text-[12px] text-faint hover:text-down">
              Remove
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function WhaleWidget({ host, manifest }: WidgetProps) {
  const followed = useStore((s) => s.followed);
  const alerts = useStore((s) => s.walletAlerts);
  const [threshold, setThreshold] = useState<number>(50_000);
  useEffect(() => {
    host.prefs.get<number>("thresholdUsd").then((v) => v && setThreshold(v));
  }, [host]);
  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex items-center justify-between">
        <span className="text-muted">Threshold</span>
        <input
          type="number"
          className="input h-8 w-28 text-right text-[13px]"
          value={threshold}
          onChange={(e) => {
            const v = Number(e.target.value);
            setThreshold(v);
            host.prefs.set("thresholdUsd", v);
          }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Watched wallets</span>
        <span>{followed.length}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">With alerts</span>
        <span>{alerts.length}</span>
      </div>
      <Link href="/wallets" className="inline-block text-[12.5px] text-sol-green">
        Manage wallets →
      </Link>
      <p className="text-[11.5px] text-faint">{manifest.name} notifies you about followed wallets while Solana OS is open.</p>
    </div>
  );
}

const WIDGETS: Record<string, (p: WidgetProps) => ReactNode> = {
  "solanaos.wallet-tracker": () => <FollowingFeed limit={5} />,
  "solanaos.whale-alerts": (p) => <WhaleWidget {...p} />,
  "solanaos.token-scanner": (p) => <ScannerWidget {...p} kind="token" />,
  "solanaos.portfolio-tracker": (p) => <PortfolioWidget {...p} />,
  "solanaos.pnl-tracker": () => <NeedsProvider text="an indexer with historical cost basis (e.g. Helius or Birdeye)" />,
  "solanaos.prediction-tracker": (p) => <MarketsWidget {...p} />,
  "solanaos.nft-tracker": (p) => <NftWidget {...p} />,
  "solanaos.defi-dashboard": (p) => <DefiWidget {...p} />,
  "solanaos.network-monitor": (p) => <NetworkWidget {...p} />,
  "solanaos.security-scanner": (p) => <ScannerWidget {...p} kind="any" />,
  "solanaos.price-alerts": () => <PriceAlertsWidget />,
  "solanaos.social-sentiment": () => <NeedsProvider text="a social data provider (e.g. the X API)" />,
  "solanaos.news-monitor": (p) => <NewsWidget {...p} />,
  "solanaos.ai-research": (p) => <AiResearchWidget {...p} />,
};

export function ExtensionWidget({ manifest }: { manifest: ExtensionManifest }) {
  const host = useHost(manifest);
  const render = WIDGETS[manifest.id];
  return (
    <div className="card flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <Monogram name={manifest.name} color={manifest.color} size={26} />
        <Link href={`/extensions/${manifest.id}`} className="flex-1 truncate text-[14px] font-semibold hover:text-sol-green">
          {manifest.name}
        </Link>
        <span className="text-[11px] text-faint">v{manifest.version}</span>
      </div>
      <div className="min-h-0 flex-1">{render ? render({ host, manifest }) : <p className="text-[13px] text-muted">This extension has no widget.</p>}</div>
    </div>
  );
}

