"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck, FileWarning } from "lucide-react";
import { Card, DataBadge, ErrorState, InfoNote, Page, PageHeader, RiskPill, Section, Tabs, Address } from "@/components/ui";
import { RiskList } from "@/components/domain";
import { apiGet, apiPost } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import type { RiskIndicator, RiskReport } from "@/lib/types";
import { isAddress, isSignature } from "@/lib/solana/address";

interface PreSign {
  decoded: {
    version: "legacy" | 0;
    signers: string[];
    writable: string[];
    instructions: { programId: string; programName: string; knownProgram: boolean; description?: string; type?: string }[];
    hasUnresolvedAccounts: boolean;
  };
  indicators: RiskIndicator[];
  simulation?: { ok: boolean; error?: string; logs: string[]; unitsConsumed?: number; available: boolean; note?: string };
}

function Checker({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (value: string) => {
    const v = value.trim();
    if (!v) return;
    if (isSignature(v)) return (location.href = `/tx/${v}`);
    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      setReport(await apiGet<RiskReport>(`/api/security?q=${encodeURIComponent(v)}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initial) run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input h-12 rounded-full px-5" placeholder="Token mint, wallet, program address or website" aria-label="What to check" />
        <button className="btn btn-primary h-12 px-6" disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Check
        </button>
      </form>
      {err && <div className="mt-4"><ErrorState message={err} /></div>}
      {report && (
        <Card className="mt-4 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12px] uppercase tracking-wider text-faint">{report.subjectType}</div>
              {isAddress(report.subject) ? <Address value={report.subject} chars={8} href={report.subjectType === "token" ? `/tokens/${report.subject}` : `/wallets/${report.subject}`} className="text-[14px]" /> : <div className="text-[15px] font-medium">{report.subject}</div>}
            </div>
            <DataBadge meta={report.meta} />
          </div>
          <RiskList report={report} />
        </Card>
      )}
    </>
  );
}

function PreSignCheck() {
  const s = useSession();
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<PreSign | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          setRes(null);
          try {
            setRes(await apiPost<PreSign>("/api/security/tx", { tx: tx.trim(), signer: s.wallet?.address ?? undefined }));
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <textarea value={tx} onChange={(e) => setTx(e.target.value)} rows={4} className="input h-auto py-3 font-mono text-[12px]" placeholder="Paste a serialized transaction (base64 or base58) that an app asked you to sign" />
        <button className="btn btn-primary mt-2" disabled={busy || !tx.trim()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileWarning size={15} />} Show me what I&apos;m signing
        </button>
      </form>
      {err && <div className="mt-3"><ErrorState message={err} /></div>}
      {res && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <h3 className="text-[15px] font-semibold">What you&apos;re signing</h3>
            <ol className="mt-3 space-y-2.5">
              {res.decoded.instructions.map((ix, i) => (
                <li key={i} className="flex gap-3 text-[13.5px]">
                  <span className="w-5 shrink-0 text-right text-faint tabular">{i + 1}.</span>
                  <div>
                    <div>{ix.description}</div>
                    <div className={ix.knownProgram ? "text-[12px] text-faint" : "text-[12px] text-warn"}>{ix.programName}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 space-y-1 text-[12.5px] text-muted">
              <div>Signers: {res.decoded.signers.length} · Writable accounts: {res.decoded.writable.length} · Version: {String(res.decoded.version)}</div>
              {res.simulation && (res.simulation.available ? <div className={res.simulation.ok ? "text-up" : "text-down"}>Simulation: {res.simulation.ok ? `succeeded (${res.simulation.unitsConsumed?.toLocaleString() ?? "?"} CU)` : `failed ${res.simulation.error}`}</div> : <div>{res.simulation.note}</div>)}
            </div>
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-3 text-[15px] font-semibold">Permissions & risks</h3>
            <div className="divide-y divide-line">
              {res.indicators.map((i) => (
                <div key={i.id} className="flex items-start gap-3 py-2.5">
                  <div className="w-[76px] shrink-0">
                    <RiskPill level={i.level} />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-medium">
                      {i.label} {i.value && <span className="font-mono text-[12px] text-muted">{i.value}</span>}
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-muted">{i.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SecurityInner() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [tab, setTab] = useState<"check" | "tx">("check");
  return (
    <Page>
      <PageHeader title="Security Center" subtitle="Check tokens, wallets, programs, apps and transactions before you interact. Transparent indicators with explanations. Never a blanket “safe”." />
      <Tabs value={tab} onChange={setTab} options={[{ value: "check", label: "Tokens, wallets, programs & sites" }, { value: "tx", label: "Transaction pre-sign check" }]} className="mb-5" />
      {tab === "check" ? <Checker initial={initial} /> : <PreSignCheck />}
      <Section title="How to read the results" id="tx">
        <div className="grid gap-3 sm:grid-cols-3">
          {(["high", "medium", "low"] as const).map((l) => (
            <Card key={l} className="p-4">
              <RiskPill level={l} />
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {l === "high" ? "A specific, known pattern that can cost you funds (active mint authority, spending approvals, lookalike domains)." : l === "medium" ? "Something that deserves a second look but is common in legitimate projects (upgradeable programs, new tokens)." : "The check passed. That lowers one specific risk; it doesn't make something safe."}
              </p>
            </Card>
          ))}
        </div>
      </Section>
      <InfoNote className="mt-6">
        Explaining a confirmed transaction instead? Use the <Link href="/tx" className="underline">Transaction Explainer</Link>. Solana OS will never ask for your seed phrase. Anyone who does is trying to steal your funds.
      </InfoNote>
    </Page>
  );
}

export default function SecurityPage() {
  return (
    <Suspense>
      <SecurityInner />
    </Suspense>
  );
}
