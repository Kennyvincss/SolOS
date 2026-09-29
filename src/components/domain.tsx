"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Boxes, CheckCircle2, Coins, ExternalLink, Layers, Repeat, XCircle } from "lucide-react";
import { appLogo } from "@/lib/catalog/apps";
import type { ActivityItem, AppEntry, AppMetrics, NewsItem, Portfolio, RiskReport, Token } from "@/lib/types";
import { fmtNum, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { Badge, Change, Monogram, RISK_STYLE, RiskPill, cn } from "./ui";
import { Donut, Meter } from "./charts";
import { ReadLaterIcon } from "./library";

/* ------------------------------------------------------------------ tokens */

export function TokenIcon({ token, size = 36 }: { token: Pick<Token, "symbol" | "icon">; size?: number }) {
  return <Monogram name={token.symbol} src={token.icon} size={size} rounded="full" color="#9ba1ab" />;
}

export function TokenRow({ t, rank, right }: { t: Token; rank?: number; right?: "volume" | "mcap" | "liquidity" }) {
  const metric = right === "volume" ? t.volume24h : right === "liquidity" ? t.liquidity : t.marketCap;
  const metricLabel = right === "volume" ? "Vol" : right === "liquidity" ? "Liq" : "MC";
  return (
    <Link href={`/tokens/${t.mint}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
      {rank !== undefined && <span className="w-5 text-right text-[12px] tabular text-faint">{rank}</span>}
      <TokenIcon token={t} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium">{t.symbol}</span>
          {t.verified && <CheckCircle2 size={12} className="shrink-0 text-sol-green" aria-label="Verified" />}
        </div>
        <div className="truncate text-[12px] text-muted">
          {t.name}
          {metric !== undefined && <span className="text-faint"> · {metricLabel} {fmtUsd(metric, { compact: true })}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[14px] font-medium tabular">{fmtUsd(t.priceUsd)}</div>
        <Change value={t.change24h} className="text-[12px]" />
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------- apps */

export function AppCard({ app, metrics, compact }: { app: AppEntry; metrics?: AppMetrics; compact?: boolean }) {
  return (
    <Link href={`/apps/${app.slug}`} className={cn("card card-hover group flex gap-3.5 p-4", compact && "p-3.5")}>
      <Monogram name={app.name} color={app.color} src={appLogo(app.slug)} size={compact ? 40 : 48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{app.name}</span>
          {app.token && <span className="text-[11px] text-faint">${app.token.symbol}</span>}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{app.tagline}</div>
        {!compact && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge>{app.category}</Badge>
            {metrics?.tvlUsd !== undefined && <Badge tone="green">TVL {fmtUsd(metrics.tvlUsd, { compact: true })}</Badge>}
          </div>
        )}
      </div>
    </Link>
  );
}

/* --------------------------------------------------------------- portfolio */

const KIND_LABEL: Record<string, string> = { sol: "SOL", stable: "Stablecoins", lst: "Staked SOL", token: "Tokens", rwa: "RWAs", nft: "NFTs" };

export function HoldingsTable({ p, limit }: { p: Portfolio; limit?: number }) {
  const rows = limit ? p.holdings.slice(0, limit) : p.holdings;
  return (
    <div className="divide-y divide-line">
      {rows.map((h) => (
        <Link key={h.mint} href={`/tokens/${h.mint === "native-stake" ? "So11111111111111111111111111111111111111112" : h.mint}`} className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-2/40 sm:px-2">
          <Monogram name={h.symbol ?? "?"} src={h.icon} size={34} rounded="full" color="#9ba1ab" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[14px] font-medium">
              {h.symbol ?? shortAddr(h.mint)}
              <Badge className="hidden sm:inline-flex">{KIND_LABEL[h.kind]}</Badge>
            </div>
            <div className="truncate text-[12px] text-muted tabular">
              {fmtNum(h.amount)} {h.symbol ?? ""}
              {h.priceUsd !== undefined && <span className="text-faint"> · {fmtUsd(h.priceUsd)}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[14px] font-medium tabular">{h.valueUsd !== undefined ? fmtUsd(h.valueUsd) : <span className="text-faint">No price</span>}</div>
            <Change value={h.change24h} className="text-[12px]" />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function AllocationBreakdown({ p }: { p: Portfolio }) {
  const byKind = new Map<string, number>();
  for (const h of p.holdings) if (h.valueUsd) byKind.set(KIND_LABEL[h.kind], (byKind.get(KIND_LABEL[h.kind]) ?? 0) + h.valueUsd);
  return (
    <Donut
      slices={[...byKind].map(([label, value]) => ({ label, value }))}
      center={
        <div>
          <div className="text-[11px] text-muted">Total</div>
          <div className="text-[15px] font-semibold tabular">{fmtUsd(p.totalUsd, { compact: true })}</div>
        </div>
      }
    />
  );
}

export function TokenAllocation({ p }: { p: Portfolio }) {
  return <Donut slices={p.holdings.filter((h) => h.valueUsd).map((h) => ({ label: h.symbol ?? shortAddr(h.mint), value: h.valueUsd! }))} />;
}

/* ---------------------------------------------------------------- activity */

const ACT_ICON = {
  swap: Repeat,
  transfer_in: ArrowDownLeft,
  transfer_out: ArrowUpRight,
  stake: Layers,
  nft: Boxes,
  program: Boxes,
  failed: XCircle,
  unknown: Coins,
};

export function ActivityList({ items, empty = "No recent transactions." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <div className="py-8 text-center text-[13px] text-muted">{empty}</div>;
  return (
    <div className="divide-y divide-line">
      {items.map((a) => {
        const I = ACT_ICON[a.kind] ?? Coins;
        const demo = a.signature.startsWith("demo-");
        const Inner = (
          <>
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", a.status === "failed" ? "bg-down/10 text-down" : a.kind === "transfer_in" ? "bg-up/10 text-up" : "bg-surface-2 text-muted")}>
              <I size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[13.5px] leading-snug">{a.summary}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
                <span>{timeAgo(a.blockTime)}</span>
                {a.programs.slice(0, 2).map((p) => (
                  <span key={p.id}>· {p.name}</span>
                ))}
                {a.status === "failed" && <span className="text-down">· Failed</span>}
              </div>
            </div>
          </>
        );
        return demo ? (
          <div key={a.signature} className="flex items-start gap-3 py-3">
            {Inner}
          </div>
        ) : (
          <Link key={a.signature} href={`/tx/${a.signature}`} className="flex items-start gap-3 py-3 transition-colors hover:bg-surface-2/40 sm:px-2">
            {Inner}
          </Link>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- news */

export function NewsRow({ n, compact }: { n: NewsItem; compact?: boolean }) {
  return (
    <div className="group relative">
      <a href={n.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl py-3 pr-9 transition-colors sm:px-2 sm:pr-10 sm:hover:bg-surface-2/50">
        <div className="flex items-center gap-2 text-[11.5px] text-faint">
          <span className="font-medium text-muted">{n.source}</span>
          <span>·</span>
          <span>{timeAgo(n.publishedAt)}</span>
          <ExternalLink size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className={cn("mt-1 font-medium leading-snug group-hover:text-fg", compact ? "line-clamp-2 text-[13.5px]" : "text-[15px]")}>{n.title}</div>
        {!compact && n.summary && <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{n.summary}</div>}
      </a>
      <ReadLaterIcon url={n.url} title={n.title} className="absolute right-1 top-3 opacity-0 group-hover:opacity-100 focus:opacity-100" />
    </div>
  );
}

/* --------------------------------------------------------------------- risk */

export function RiskList({ report }: { report: RiskReport }) {
  const order = { high: 0, medium: 1, unknown: 2, low: 3 };
  const sorted = [...report.indicators].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["high", "medium", "low", "unknown"] as const).map((l) =>
          report.counts[l] ? (
            <span key={l} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", RISK_STYLE[l].cls)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", RISK_STYLE[l].dot)} /> {report.counts[l]} {RISK_STYLE[l].label.toLowerCase()}
            </span>
          ) : null,
        )}
      </div>
      <div className="divide-y divide-line">
        {sorted.map((i) => (
          <div key={i.id} className="flex items-start gap-3 py-3">
            <div className="w-[76px] shrink-0 pt-0.5">
              <RiskPill level={i.level} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[14px] font-medium">{i.label}</span>
                {i.value && <span className="font-mono text-[12px] text-muted">{i.value}</span>}
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.explanation}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-faint">
        <span className="font-medium text-muted">Methodology:</span> {report.methodology} STRATA never labels anything as simply “safe”.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- markdown */

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)|(_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) {
      const href = m[3];
      const safe = /^(https?:\/\/|\/)/.test(href) ? href : "#";
      out.push(
        safe.startsWith("/") ? (
          <Link key={k} href={safe}>
            {m[2]}
          </Link>
        ) : (
          <a key={k} href={safe} target="_blank" rel="noopener noreferrer">
            {m[2]}
          </a>
        ),
      );
    } else if (m[4]) out.push(<strong key={k}>{m[5]}</strong>);
    else if (m[6]) out.push(<code key={k}>{m[7]}</code>);
    else if (m[8]) out.push(<em key={k}>{m[9]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal, safe markdown renderer for AI answers (no raw HTML). */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      blocks.push(<h3 key={key++}>{inline(line.replace(/^#+\s/, ""), `h${key}`)}</h3>);
      i++;
    } else if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s/, ""));
      blocks.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `u${key}-${j}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s/, ""));
      blocks.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `o${key}-${j}`)}</li>
          ))}
        </ol>,
      );
    } else if (/^\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        if (!/^\|[\s:-|]+\|$/.test(lines[i].trim())) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key++} className="overflow-x-auto">
          <table>
            <thead>
              <tr>{head?.map((c, j) => <th key={j}>{inline(c, `th${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>{inline(c, `td${j}-${k}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key++}>{inline(q.join(" "), `q${key}`)}</blockquote>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s|\s*\d+\.\s|\||>)/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={key++}>{inline(para.join(" "), `p${key}`)}</p>);
    }
  }
  return <div className="prose-ai">{blocks}</div>;
}
