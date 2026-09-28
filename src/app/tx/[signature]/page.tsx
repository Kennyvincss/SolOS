"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown, ExternalLink, Sparkles, XCircle } from "lucide-react";
import { Address, Badge, Card, DataBadge, ErrorState, Page, Section, Skeleton, Stat, cn } from "@/components/ui";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import { renderHeadline } from "@/lib/solana/explain";
import type { Sourced, TxExplanation } from "@/lib/types";
import { fmtDate, fmtNum, shortAddr, timeAgo } from "@/lib/format";

export default function TxPage({ params }: { params: Promise<{ signature: string }> }) {
  const { signature } = use(params);
  const s = useSession();
  const { data, error, loading, reload } = useApi<Sourced<TxExplanation>>(`/api/tx/${signature}`);
  const [showLogs, setShowLogs] = useState(false);
  const tx = data?.data;

  return (
    <Page>
      <div className="mb-2 text-[13px] text-muted">Transaction</div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Address value={signature} chars={12} className="text-[13px]" />
        <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-faint hover:text-fg">
          Solscan <ExternalLink size={11} />
        </a>
      </div>
      {loading && (
        <Card className="p-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-8 w-3/4" />
          <Skeleton className="mt-6 h-24 w-full" />
        </Card>
      )}
      {error && <ErrorState message={error} onRetry={reload} />}
      {tx && (
        <>
          <Card className="glow-bg animate-fade-up p-5 sm:p-7">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium uppercase tracking-wider text-faint">What happened?</span>
              <DataBadge meta={data.meta} />
            </div>
            <h1 className="mt-3 text-[22px] font-semibold leading-snug tracking-[-0.015em] sm:text-[28px]">{renderHeadline(tx.headline, tx.feePayer, s.address)}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {tx.status === "success" ? (
                <Badge tone="up">
                  <CheckCircle2 size={11} /> Succeeded
                </Badge>
              ) : (
                <Badge tone="down">
                  <XCircle size={11} /> Failed
                </Badge>
              )}
              <Badge>{tx.kind.replace("_", " ")}</Badge>
              {tx.blockTime && <span className="text-[12px] text-muted">{timeAgo(tx.blockTime)}</span>}
            </div>
            {tx.payerChanges.length > 0 && (
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {tx.payerChanges.map((c) => (
                  <div key={c.mint} className="flex items-center gap-3 rounded-2xl bg-surface-2/70 p-3">
                    <span className={cn("grid h-8 w-8 place-items-center rounded-full", c.change > 0 ? "bg-up/10 text-up" : "bg-down/10 text-down")}>{c.change > 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span>
                    <div>
                      <div className={cn("text-[15px] font-semibold tabular", c.change > 0 ? "text-up" : "text-fg")}>
                        {c.change > 0 ? "+" : "−"}
                        {fmtNum(Math.abs(c.change))} {c.symbol}
                      </div>
                      <Link href={`/tokens/${c.mint}`} className="text-[12px] text-muted hover:text-fg">
                        {c.change > 0 ? "Received" : "Paid"} · view token
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/ai?q=${encodeURIComponent(`Explain transaction ${signature}`)}`} className="btn btn-primary btn-sm">
                <Sparkles size={14} /> Explain with STRATA AI
              </Link>
            </div>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <Stat label="Status" value={tx.status === "success" ? "Success" : "Failed"} sub={tx.error && <span className="text-down">{tx.error}</span>} />
            </Card>
            <Card className="p-4">
              <Stat label="Fee" value={`${fmtNum(tx.feeSol)} SOL`} sub={tx.computeUnits ? <span className="text-faint">{tx.computeUnits.toLocaleString()} CU</span> : undefined} />
            </Card>
            <Card className="p-4">
              <Stat label="Time" value={tx.blockTime ? timeAgo(tx.blockTime) : "—"} sub={<span className="text-faint">{tx.blockTime ? fmtDate(tx.blockTime) : ""}</span>} />
            </Card>
            <Card className="p-4">
              <Stat label="Slot" value={tx.slot.toLocaleString()} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 text-[15px] font-semibold">Sender & signers</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted">Fee payer (sender)</span>
                  <Address value={tx.feePayer} href={`/wallets/${tx.feePayer}`} />
                </div>
                {tx.signers
                  .filter((x) => x !== tx.feePayer)
                  .map((x) => (
                    <div key={x} className="flex justify-between">
                      <span className="text-muted">Co-signer</span>
                      <Address value={x} href={`/wallets/${x}`} />
                    </div>
                  ))}
              </div>
              <h3 className="mb-2 mt-5 text-[15px] font-semibold">Programs</h3>
              <div className="flex flex-wrap gap-1.5">
                {tx.programs.map((p) =>
                  p.app ? (
                    <Link key={p.id} href={`/apps/${p.app}`} className="rounded-full border border-sol-green/30 px-2.5 py-1 text-[12px] text-sol-green">
                      {p.name}
                    </Link>
                  ) : (
                    <Link key={p.id} href={`/wallets/${p.id}`} className={cn("rounded-full border border-line px-2.5 py-1 text-[12px]", p.known ? "text-muted" : "text-warn")} title={p.known ? undefined : "Not in the STRATA program registry"}>
                      {p.name}
                    </Link>
                  ),
                )}
              </div>
            </Card>
            <Card className="p-4 sm:p-5">
              <h3 className="mb-2 text-[15px] font-semibold">Tokens involved (all accounts)</h3>
              <div className="divide-y divide-line">
                {tx.balanceChanges.slice(0, 14).map((c, i) => (
                  <div key={`${c.owner}:${c.mint}:${i}`} className="flex items-center justify-between py-2 text-[13px]">
                    <Link href={`/wallets/${c.owner}`} className="font-mono text-[12px] text-muted hover:text-fg">
                      {shortAddr(c.owner)}
                      {c.owner === tx.feePayer && <span className="ml-1 text-sol-green">(sender)</span>}
                    </Link>
                    <span className={cn("tabular", c.change > 0 ? "text-up" : "text-fg")}>
                      {c.change > 0 ? "+" : "−"}
                      {fmtNum(Math.abs(c.change))} {c.symbol}
                    </span>
                  </div>
                ))}
                {!tx.balanceChanges.length && <p className="py-3 text-[13px] text-muted">No balance changes besides the fee.</p>}
              </div>
            </Card>
          </div>

          <Section title="Details">
            <Card className="p-4 sm:p-5">
              <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-muted">
                {tx.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <h4 className="mt-5 text-[13px] font-semibold">Instructions</h4>
              <ol className="mt-2 space-y-1.5 text-[13px]">
                {tx.instructions.map((ix, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-5 text-right text-faint tabular">{i + 1}.</span>
                    <span>
                      {ix.programName}
                      {ix.type && <span className="text-muted"> · {ix.type}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {tx.logs && tx.logs.length > 0 && (
                <>
                  <button onClick={() => setShowLogs((v) => !v)} className="mt-5 flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                    <ChevronDown size={14} className={cn("transition-transform", showLogs && "rotate-180")} /> Program logs
                  </button>
                  {showLogs && <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-muted">{tx.logs.join("\n")}</pre>}
                </>
              )}
            </Card>
          </Section>
        </>
      )}
    </Page>
  );
}
