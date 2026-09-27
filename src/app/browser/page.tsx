"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ExternalLink, Lock, RotateCw, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { Card, Monogram, RiskPill, cn } from "@/components/ui";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import { APPS, domainOf, appLogo } from "@/lib/catalog/apps";
import type { RiskReport } from "@/lib/types";
import { shortAddr } from "@/lib/format";

const QUICK = ["jupiter", "kamino", "drift", "marinade", "orca", "tensor", "realms", "solana-docs"];

function normalize(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function BrowserInner() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useSession();
  const url = params.get("url") ? normalize(params.get("url")!) : null;
  const [input, setInput] = useState(url ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const risk = useApi<RiskReport>(url ? `/api/security?q=${encodeURIComponent(url)}` : null);
  const app = url ? APPS.find((a) => [a.website, a.appUrl].some((u) => u && domainOf(u) === domainOf(url))) : undefined;
  const worst = risk.data?.indicators.some((i) => i.level === "high") ? "high" : risk.data?.indicators.some((i) => i.level === "medium") ? "medium" : "low";
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setInput(url ?? "");
    setAcknowledged(false);
  }, [url]);

  const go = (v: string) => {
    const n = normalize(v);
    if (n) router.push(`/browser?url=${encodeURIComponent(n)}`);
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] flex-col md:h-dvh">
      <div className="flex items-center gap-2 border-b border-line bg-bg/80 px-3 py-2 backdrop-blur-xl">
        <button onClick={() => setReloadKey((k) => k + 1)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Reload" disabled={!url}>
          <RotateCw size={15} />
        </button>
        <form
          className="flex h-9 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3"
          onSubmit={(e) => {
            e.preventDefault();
            go(input);
          }}
        >
          {url ? url.startsWith("https:") ? <Lock size={13} className="text-up" /> : <Unlock size={13} className="text-down" /> : null}
          <input value={input} onChange={(e) => setInput(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" placeholder="Enter a Solana app URL, e.g. jup.ag" aria-label="Address" />
          {risk.data && <RiskPill level={worst} />}
        </form>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm hidden sm:inline-flex">
            Open in tab <ExternalLink size={12} />
          </a>
        )}
      </div>

      {!url ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Solana Browser</h1>
            <p className="mt-1 text-[14px] text-muted">Open Solana apps inside Solana OS, with a security check on every site and a pre-sign explanation for transactions.</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK.map((slug) => {
                const a = APPS.find((x) => x.slug === slug)!;
                return (
                  <button key={slug} onClick={() => go(a.appUrl ?? a.website)} className="card card-hover flex flex-col items-center gap-2 p-4 text-center">
                    <Monogram name={a.name} color={a.color} src={appLogo(a.slug)} size={44} />
                    <span className="text-[13px] font-medium">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="relative min-h-0 flex-1 bg-white">
            {worst === "high" && !acknowledged ? (
              <div className="absolute inset-0 grid place-items-center bg-bg p-6">
                <Card className="max-w-md p-6 text-center">
                  <ShieldAlert size={28} className="mx-auto text-down" />
                  <h2 className="mt-3 text-[18px] font-semibold">This site shows high-risk signals</h2>
                  <ul className="mt-3 space-y-1.5 text-left text-[13px] text-muted">
                    {risk.data?.indicators.filter((i) => i.level === "high").map((i) => <li key={i.id}>• {i.explanation}</li>)}
                  </ul>
                  <div className="mt-5 flex justify-center gap-2">
                    <button onClick={() => router.push("/browser")} className="btn btn-primary">
                      Go back
                    </button>
                    <button onClick={() => setAcknowledged(true)} className="btn btn-ghost">
                      Continue anyway
                    </button>
                  </div>
                </Card>
              </div>
            ) : (
              <iframe key={`${url}-${reloadKey}`} src={url} title="Solana app" className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="strict-origin-when-cross-origin" />
            )}
          </div>
          <aside className="max-h-[40vh] shrink-0 overflow-y-auto border-t border-line bg-bg p-4 lg:max-h-none lg:w-[300px] lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <ShieldCheck size={15} /> Site check
            </div>
            {risk.data && (
              <div className="mt-3 space-y-2.5">
                {risk.data.indicators.map((i) => (
                  <div key={i.id} className="text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{i.label}</span>
                      <RiskPill level={i.level} />
                    </div>
                    <p className="mt-0.5 text-muted">{i.explanation}</p>
                  </div>
                ))}
              </div>
            )}
            {app && (
              <Link href={`/apps/${app.slug}`} className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 p-2.5 text-[13px]">
                <Monogram name={app.name} color={app.color} src={appLogo(app.slug)} size={28} /> {app.name} <ArrowRight size={13} className="ml-auto text-faint" />
              </Link>
            )}
            <div className="mt-5 text-[13px] font-semibold">Wallet</div>
            <p className="mt-1 text-[12.5px] text-muted">{s.wallet ? `${s.wallet.name} (${shortAddr(s.wallet.address)}) is connected to Solana OS. The app will ask your wallet to connect separately.` : "Connect your wallet inside the app. Solana OS never sees your keys."}</p>
            <div className="mt-5 text-[13px] font-semibold">Before you sign</div>
            <p className="mt-1 text-[12.5px] text-muted">Your wallet shows the transaction before you approve. To see it explained (programs, assets, amounts, permissions, risks) paste it into the pre-sign check.</p>
            <Link href="/security" className="btn btn-soft btn-sm mt-2 w-full">
              Open pre-sign check
            </Link>
            <p className="mt-4 text-[11.5px] leading-relaxed text-faint">Some apps block being embedded. If the page stays blank, use “Open in tab”; the security check above still applies.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className={cn("btn btn-ghost btn-sm mt-2 w-full sm:hidden")}>
              Open in tab <ExternalLink size={12} />
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function BrowserPage() {
  return (
    <Suspense>
      <BrowserInner />
    </Suspense>
  );
}
