"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Database, FlaskConical, Loader2, XCircle } from "lucide-react";
import type { AiCard, AiSource } from "@/lib/ai/tools";
import type { AppEntry, DataMeta, NewsItem, Portfolio, RiskReport, Token, TxExplanation, YieldPool, ActivityItem } from "@/lib/types";
import { fmtUsd, shortAddr } from "@/lib/format";
import { renderHeadline } from "@/lib/solana/explain";
import { ActivityList, AppCard, HoldingsTable, Markdown, NewsRow, RiskList, TokenRow } from "../domain";
import { Change, DataBadge, cn } from "../ui";

export interface ToolState {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  error?: string;
}

export interface AssistantMsg {
  role: "assistant";
  text: string;
  tools: ToolState[];
  cards: AiCard[];
  sources: AiSource[];
  engine?: "groq" | "offline";
  error?: string;
  actions?: import("@/lib/ai/protocol").AiAction[];
  done: boolean;
}

export function ToolChips({ tools }: { tools: ToolState[] }) {
  if (!tools.length) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {tools.map((t) => (
        <span key={t.id} title={t.error} className={cn("inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px]", t.status === "error" ? "text-down" : "text-muted")}>
          {t.status === "running" ? <Loader2 size={11} className="animate-spin" /> : t.status === "done" ? <CheckCircle2 size={11} className="text-sol-green" /> : <XCircle size={11} />}
          {t.label}
        </span>
      ))}
    </div>
  );
}

function CardShell({ title, meta, children, href }: { title: string; meta?: DataMeta; children: React.ReactNode; href?: string }) {
  return (
    <div className="card overflow-hidden p-3.5 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
          <Database size={12} /> {title}
        </div>
        <div className="flex items-center gap-2">
          <DataBadge meta={meta} />
          {href && (
            <Link href={href} className="text-[12px] text-muted hover:text-fg">
              Open →
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function DataCard({ card, viewer }: { card: AiCard; viewer?: string | null }) {
  switch (card.kind) {
    case "portfolio": {
      const { portfolio: p, meta } = card.data as { portfolio: Portfolio; meta: DataMeta };
      return (
        <CardShell title="Portfolio · verified on-chain data" meta={meta} href={viewer === p.address ? "/portfolio" : `/wallets/${p.address}`}>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[26px] font-semibold tabular">{fmtUsd(p.totalUsd)}</div>
              <div className="text-[12.5px]">
                <Change value={p.change24hPct} /> <span className="text-muted">24h</span>
              </div>
            </div>
            <div className="text-right text-[12px] text-muted">
              {p.holdings.length} assets{p.nfts.length ? ` · ${p.nfts.length} NFTs` : ""}
            </div>
          </div>
          <div className="mt-2">
            <HoldingsTable p={p} limit={5} />
          </div>
          {!p.pnl.available && <div className="mt-2 text-[11.5px] text-faint">PnL: {p.pnl.reason}</div>}
        </CardShell>
      );
    }
    case "token": {
      const { token: t, meta } = card.data as { token: Token; meta: DataMeta };
      return (
        <CardShell title="Token · market data" meta={meta} href={`/tokens/${t.mint}`}>
          <div className="-mx-2">
            <TokenRow t={t} right="mcap" />
          </div>
        </CardShell>
      );
    }
    case "tokens": {
      const { tokens, meta } = card.data as { tokens: Token[]; meta: DataMeta };
      return (
        <CardShell title={card.title} meta={meta} href="/tokens">
          <div className="-mx-2">
            {tokens.slice(0, 8).map((t, i) => (
              <TokenRow key={t.mint} t={t} rank={i + 1} right="volume" />
            ))}
          </div>
        </CardShell>
      );
    }
    case "tx": {
      const { tx, meta } = card.data as { tx: TxExplanation; meta: DataMeta };
      return (
        <CardShell title="Transaction · decoded on-chain" meta={meta} href={`/tx/${tx.signature}`}>
          <div className="text-[14.5px] font-medium leading-snug">{renderHeadline(tx.headline, tx.feePayer, viewer)}</div>
          <div className="mt-1.5 text-[12px] text-muted">
            {tx.status === "success" ? "Succeeded" : "Failed"} · fee {tx.feeSol} SOL · {tx.programs.filter((p) => p.known).map((p) => p.name).slice(0, 3).join(", ")}
          </div>
        </CardShell>
      );
    }
    case "risk": {
      const r = card.data as RiskReport;
      return (
        <CardShell title={`Risk indicators · ${r.subjectType}`} meta={r.meta} href={`/security?q=${encodeURIComponent(r.subject)}`}>
          <RiskList report={r} />
        </CardShell>
      );
    }
    case "apps": {
      const apps = card.data as AppEntry[];
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {apps.slice(0, 6).map((a) => (
            <AppCard key={a.slug} app={a} compact />
          ))}
        </div>
      );
    }
    case "news": {
      const { items, meta } = card.data as { items: NewsItem[]; meta: DataMeta };
      return (
        <CardShell title="News" meta={meta} href="/news">
          <div className="-mx-2 divide-y divide-line">
            {items.slice(0, 5).map((n) => (
              <NewsRow key={n.id} n={n} compact />
            ))}
          </div>
        </CardShell>
      );
    }
    case "yields": {
      const { pools, meta } = card.data as { pools: YieldPool[]; meta: DataMeta };
      return (
        <CardShell title="Yields · DefiLlama" meta={meta} href="/defi">
          <div className="divide-y divide-line text-[13px]">
            {pools.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{p.symbol}</div>
                  <div className="text-[11.5px] text-muted">
                    {p.project} · {p.category}
                  </div>
                </div>
                <div className="text-right tabular">
                  <div className="text-up">{p.apy !== undefined ? `${p.apy.toFixed(2)}%` : "—"}</div>
                  <div className="text-[11.5px] text-muted">TVL {fmtUsd(p.tvlUsd, { compact: true })}</div>
                </div>
              </div>
            ))}
          </div>
        </CardShell>
      );
    }
    case "activity": {
      const { items, meta } = card.data as { items: ActivityItem[]; meta: DataMeta };
      return (
        <CardShell title={`Activity · ${shortAddr(card.address)}`} meta={meta} href={`/wallets/${card.address}`}>
          <ActivityList items={items.slice(0, 5)} />
        </CardShell>
      );
    }
  }
}

export function Sources({ sources }: { sources: AiSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.slice(0, 8).map((s) => {
        const ext = /^https?:/.test(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            target={ext ? "_blank" : undefined}
            rel={ext ? "noopener noreferrer" : undefined}
            title={`${s.provider}${s.mode === "demo" ? " (demo data)" : ""}`}
            className={cn("inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors hover:text-fg", s.mode === "demo" ? "border-warn/30 text-warn" : "border-line text-muted")}
          >
            {s.mode === "demo" ? <FlaskConical size={11} /> : <Circle size={6} className="fill-sol-green text-sol-green" />}
            <span className="truncate">{s.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function AssistantBubble({ m, viewer }: { m: AssistantMsg; viewer?: string | null }) {
  return (
    <div className="min-w-0">
      <ToolChips tools={m.tools} />
      {m.cards.length > 0 && (
        <div className="mb-3 space-y-2">
          {m.cards.map((c, i) => (
            <DataCard key={i} card={c} viewer={viewer} />
          ))}
        </div>
      )}
      {m.text ? <Markdown text={m.text} /> : !m.done && !m.tools.length ? <ThinkingDots /> : null}
      {m.error && <div className="mt-2 rounded-xl border border-down/20 bg-down/5 p-3 text-[13px] text-down">{m.error}</div>}
      {m.actions?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.actions.map((a, i) => (
            <Link key={i} href={a.href} className="btn btn-soft btn-sm">
              {a.label} →
            </Link>
          ))}
        </div>
      ) : null}
      {m.done && <Sources sources={m.sources} />}
    </div>
  );
}

export function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-2" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot-pulse h-1.5 w-1.5 rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

export function reduceEvent(m: AssistantMsg, e: import("@/lib/ai/protocol").AiEvent): AssistantMsg {
  switch (e.type) {
    case "meta":
      return { ...m, engine: e.engine };
    case "text":
      return { ...m, text: m.text + e.delta };
    case "tool": {
      const exists = m.tools.some((t) => t.id === e.id);
      const t = { id: e.id, label: e.label, status: e.status, error: e.error };
      return { ...m, tools: exists ? m.tools.map((x) => (x.id === e.id ? t : x)) : [...m.tools, t] };
    }
    case "card":
      return { ...m, cards: [...m.cards, e.card] };
    case "sources":
      return { ...m, sources: [...m.sources, ...e.sources] };
    case "action":
      return { ...m, actions: [...(m.actions ?? []), e.action] };
    case "error":
      return { ...m, error: e.message };
    case "done":
      return { ...m, done: true };
  }
}
