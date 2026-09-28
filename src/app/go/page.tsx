"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, Page } from "@/components/ui";
import type { RiskReport } from "@/lib/types";
import { asWebUrl } from "@/lib/web-url";

/** Safety-checks a website with the Security Center, then sends the user there. */
function Go() {
  const params = useSearchParams();
  const router = useRouter();
  const url = asWebUrl(params.get("url") ?? "");
  const [report, setReport] = useState<RiskReport | null>(null);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    fetch(`/api/security?q=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<RiskReport>) : null))
      .catch(() => null)
      .then((r) => {
        clearTimeout(timer);
        if (r?.indicators.some((i) => i.level === "high")) setReport(r);
        else window.location.replace(url);
      });
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [url]);

  if (!url) {
    return (
      <Card className="p-6 text-center text-[14px] text-muted">
        That isn&apos;t a valid web address.
      </Card>
    );
  }
  const host = new URL(url).hostname;
  if (!report) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <Loader2 size={22} className="animate-spin text-muted" />
        <div className="mt-4 text-[15px]">Opening {host}…</div>
        <div className="mt-1 text-[12.5px] text-faint">Checking the site with the Security Center</div>
      </div>
    );
  }
  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <ShieldAlert size={30} className="mx-auto text-down" />
      <h1 className="mt-3 text-[19px] font-semibold">{host} looks risky</h1>
      <ul className="mt-4 space-y-2 text-left text-[13.5px] text-muted">
        {report.indicators
          .filter((i) => i.level === "high")
          .map((i) => (
            <li key={i.id}>
              <span className="font-medium text-down">{i.label}:</span> {i.explanation}
            </li>
          ))}
      </ul>
      <p className="mt-4 text-[12.5px] text-faint">Never connect your wallet or sign anything on a site you don&apos;t trust.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => router.back()} className="btn btn-primary">
          Go back
        </button>
        <button onClick={() => window.location.assign(url)} className="btn btn-ghost">
          Continue anyway
        </button>
      </div>
    </Card>
  );
}

export default function GoPage() {
  return (
    <Page>
      <Suspense>
        <Go />
      </Suspense>
    </Page>
  );
}
