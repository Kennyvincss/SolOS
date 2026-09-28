"use client";


import { use, useState } from "react";
import Link from "next/link";
import { BellPlus, CheckCircle2, ExternalLink, Globe, Share2, Star } from "lucide-react";
import { AreaChart } from "@/components/charts";
import { Address, Badge, Card, Change, DataBadge, DemoNotice, EmptyState, ErrorState, InfoNote, Modal, friendlyError, Monogram, Page, Section, Segmented, Skeleton, SkeletonRows, Stat, cn, share } from "@/components/ui";
import { AppCard, NewsRow, RiskList } from "@/components/domain";
import { AskAIPanel } from "@/components/ai/inline";
import { useApi } from "@/lib/client/fetch";
import { useActions, useStore } from "@/lib/client/store";
import { appForToken } from "@/lib/catalog/apps";
import type { NewsItem, PricePoint, RiskReport, Sourced, Token, TokenHolder, YieldPool } from "@/lib/types";
import { fmtDate, fmtNum, fmtUsd, shortAddr, timeAgo } from "@/lib/format";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Jupiter's swap page with this token already selected to buy (paying with SOL; SOL itself is bought with USDC). */
function jupiterSwapUrl(mint: string): string {
  const sell = mint === SOL ? USDC : SOL;
  return `https://jup.ag/swap?sell=${sell}&buy=${mint}`;
}

type Range = "1D" | "7D" | "30D" | "90D" | "1Y";

function PriceAlertModal({ t, open, onClose }: { t: Token; open: boolean; onClose: () => void }) {
  const { addPriceAlert } = useActions();
  const [dir, setDir] = useState<"above" | "below">("above");
  const [price, setPrice] = useState(t.priceUsd ? String(Number((t.priceUsd * 1.1).toPrecision(4))) : "");
  return (
    <Modal open={open} onClose={onClose} title={`Price alert for ${t.symbol}`}>
      <div className="space-y-3">
        <Segmented value={dir} onChange={setDir} options={["above", "below"]} />
        <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price in USD" />
        <p className="text-[12px] text-muted">Current price {fmtUsd(t.priceUsd)}. Alerts are checked while STRATA is open.</p>
        <button
          className="btn btn-primary w-full"
          disabled={!Number(price)}
          onClick={() => {
            addPriceAlert({ mint: t.mint, symbol: t.symbol, direction: dir, price: Number(price) });
            onClose();
          }}
        >
          Create alert
        </button>
      </div>
    </Modal>
  );
}

function Holders({ mint }: { mint: string }) {
  const { data, loading, error } = useApi<Sourced<TokenHolder[]>>(`/api/tokens/${mint}/holders`);
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Top holders</h3>
        <DataBadge meta={data?.meta} />
      </div>
      {loading && <SkeletonRows rows={5} />}
      {error && <p className="py-4 text-[13px] text-muted">{error}</p>}
      {data && (
        <div className="divide-y divide-line">
          {data.data.slice(0, 10).map((h, i) => (
            <div key={`${h.address}-${i}`} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="w-5 text-right text-faint tabular">{i + 1}</span>
              <Address value={h.address} href={`/wallets/${h.address}`} className="flex-1" />
              <span className="tabular text-muted">{fmtNum(h.amount, { compact: true })}</span>
              <span className="w-14 text-right tabular">{h.percentage !== undefined ? `${h.percentage.toFixed(2)}%` : "—"}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-faint">Largest token accounts, resolved to their owners. Pools, exchanges and vesting contracts appear here too.</p>
    </Card>
  );
}

export default function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [range, setRange] = useState<Range>("7D");
  const [alertOpen, setAlertOpen] = useState(false);
  const { data, error, loading, reload } = useApi<Sourced<Token>>(`/api/tokens/${id}`, { refreshMs: 30_000 });
  const t = data?.data;
  const mint = t?.mint;
  const hist = useApi<Sourced<PricePoint[]>>(mint ? `/api/tokens/${mint}/history?range=${range}` : null);
  const risk = useApi<RiskReport>(mint && data?.meta.mode === "live" ? `/api/security?q=${mint}` : null);
  const news = useApi<Sourced<NewsItem[]>>("/api/news");
  const defi = useApi<{ yields: Sourced<YieldPool[]> }>("/api/defi");
  const watch = useStore((s) => (mint ? s.watchlist.includes(mint) : false));
  const { toggleWatch } = useActions();

  if (error) {
    return (
      <Page>
        <ErrorState message={error} onRetry={reload} />
      </Page>
    );
  }
  if (loading || !t) {
    return (
      <Page>
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="mt-8 h-72 w-full rounded-2xl" />
      </Page>
    );
  }

  const app = appForToken(t.mint);
  const relatedNews = news.data?.data.filter((n) => new RegExp(`\\b(${t.symbol.replace(/[^a-z0-9]/gi, "")}|${t.name.split(" ")[0].replace(/[^a-z0-9]/gi, "")})\\b`, "i").test(`${n.title} ${n.summary ?? ""}`)).slice(0, 5) ?? [];
  const pools = defi.data?.yields.data.filter((p) => p.symbol.toUpperCase().split(/[-/ ]/).includes(t.symbol.toUpperCase())).slice(0, 6) ?? [];

  return (
    <Page>
      <DemoNotice meta={data.meta} />
      <div className="animate-fade-up flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Monogram name={t.symbol} src={t.icon} size={56} rounded="full" color="#9ba1ab" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[26px] font-semibold tracking-[-0.02em]">{t.name}</h1>
              {t.verified && <CheckCircle2 size={17} className="text-sol-green" aria-label="Verified" />}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span className="font-medium">{t.symbol}</span>
              <Address value={t.mint} />
              {t.launchpad && <Badge>{t.launchpad}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toggleWatch(t.mint)} className={cn("btn btn-ghost btn-sm", watch && "text-warn")} aria-pressed={watch}>
            <Star size={14} className={watch ? "fill-current" : ""} /> {watch ? "Watching" : "Watch"}
          </button>
          <button onClick={() => setAlertOpen(true)} className="btn btn-ghost btn-sm">
            <BellPlus size={14} /> Alert
          </button>
          <button onClick={() => share(t.symbol)} className="btn btn-ghost btn-sm" aria-label="Share">
            <Share2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[34px] font-semibold tabular leading-none tracking-[-0.02em]">{fmtUsd(t.priceUsd)}</div>
              <div className="mt-1.5 flex gap-3 text-[13px]">
                <span>
                  <Change value={t.change24h} /> <span className="text-faint">24h</span>
                </span>
                <span>
                  <Change value={t.change7d} /> <span className="text-faint">7d</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DataBadge meta={hist.data?.meta} />
              <Segmented value={range} onChange={setRange} options={["1D", "7D", "30D", "90D", "1Y"]} />
            </div>
          </div>
          <div className="mt-5">{hist.loading ? <Skeleton className="h-[260px] w-full rounded-xl" /> : hist.error ? <div className="grid h-[260px] place-items-center text-[13px] text-muted">{hist.error}</div> : <AreaChart data={hist.data?.data ?? []} label={`${t.symbol} price`} />}</div>
        </Card>
        <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 content-start">
          <Stat label="Market cap" value={fmtUsd(t.marketCap, { compact: true })} />
          <Stat label="FDV" value={fmtUsd(t.fdv, { compact: true })} />
          <Stat label="24h volume" value={fmtUsd(t.volume24h, { compact: true })} />
          <Stat label="Liquidity" value={fmtUsd(t.liquidity, { compact: true })} />
          <Stat label="Holders" value={fmtNum(t.holders, { compact: true })} />
          <Stat label="Circulating" value={fmtNum(t.circulatingSupply, { compact: true })} />
          <Stat label="1h" value={<Change value={t.change1h} />} />
          <Stat label="30d" value={<Change value={t.change30d} />} />
          {t.createdAt && <Stat label="First pool" value={timeAgo(t.createdAt)} sub={<span className="text-faint">{fmtDate(t.createdAt)}</span>} className="col-span-2" />}
          <div className="col-span-2 flex flex-wrap gap-2">
            {t.website && (
              <a href={t.website} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                <Globe size={13} /> Website
              </a>
            )}
            {t.twitter && (
              <a href={t.twitter} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                X <ExternalLink size={12} />
              </a>
            )}
            <a href={jupiterSwapUrl(t.mint)} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
              Trade on Jupiter <ExternalLink size={12} />
            </a>
          </div>
        </Card>
      </div>

      <Section>
        <AskAIPanel
          label="Why is this moving?"
          description="STRATA AI summarises the token's market data and related news. Analysis, not advice."
          prompt={`Why is ${t.symbol} (mint ${t.mint}) moving? Use the token data and recent news. Clearly separate verified data from your analysis, and say what is uncertain. Keep it under 150 words.`}
        />
      </Section>

      <Section title="Risk & security" subtitle="Transparent indicators, never a blanket verdict">
        <Card className="p-4 sm:p-5">
          {data.meta.mode === "demo" ? (
            <InfoNote>Risk checks are temporarily unavailable. Try again in a minute.</InfoNote>
          ) : risk.loading ? (
            <SkeletonRows rows={4} />
          ) : risk.error ? (
            <p className="text-[13px] text-muted">{friendlyError(risk.error)}</p>
          ) : risk.data ? (
            <RiskList report={risk.data} />
          ) : null}
        </Card>
      </Section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {data.meta.mode === "live" ? <Holders mint={t.mint} /> : <Card className="p-5"><EmptyState title="Holders are temporarily unavailable" /></Card>}
        <Card className="p-4 sm:p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">News</h3>
            <DataBadge meta={news.data?.meta} />
          </div>
          {news.loading && <SkeletonRows rows={3} />}
          {news.data && !relatedNews.length && <EmptyState title={`No recent headlines mention ${t.symbol}`} />}
          <div className="-mx-2 divide-y divide-line">
            {relatedNews.map((n) => (
              <NewsRow key={n.id} n={n} compact />
            ))}
          </div>
        </Card>
      </div>

      <Section title={`Protocols using ${t.symbol}`} subtitle="Ways to earn with this token">
        <Card className="p-4 sm:p-5">
          {defi.loading && <SkeletonRows rows={3} />}
          {defi.data && !pools.length && <EmptyState title="No tracked pools include this token" />}
          <div className="divide-y divide-line">
            {pools.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-[13.5px]">
                <div>
                  <div className="font-medium">{p.symbol}</div>
                  <div className="text-[12px] text-muted">
                    {p.project} · {p.category}
                  </div>
                </div>
                <div className="text-right tabular">
                  <div className="text-up">{p.apy !== undefined ? `${p.apy.toFixed(2)}% APY` : "—"}</div>
                  <div className="text-[12px] text-muted">TVL {fmtUsd(p.tvlUsd, { compact: true })}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {app && (
          <div>
            <h3 className="mb-3 text-[15px] font-semibold">Project</h3>
            <AppCard app={app} />
            <Link href={`/projects/${app.slug}`} className="mt-2 inline-block text-[12.5px] text-muted hover:text-fg">
              View project profile →
            </Link>
          </div>
        )}
        {t.twitter && (
          <Card className="p-4 sm:p-5">
            <h3 className="text-[15px] font-semibold">Community</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Follow {t.symbol} on <a className="underline" href={t.twitter} target="_blank" rel="noopener noreferrer">X</a> for news from the team.
            </p>
          </Card>
        )}
      </div>

      <PriceAlertModal t={t} open={alertOpen} onClose={() => setAlertOpen(false)} />
    </Page>
  );
}
