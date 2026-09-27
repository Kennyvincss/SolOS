"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ReceiptText } from "lucide-react";
import { Card, Page, PageHeader, InfoNote } from "@/components/ui";
import { isSignature } from "@/lib/solana/address";

export default function TxIndex() {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <Page>
      <PageHeader title="Transaction Explainer" subtitle="Paste any Solana transaction signature and get a plain-English explanation of what happened." />
      <Card className="p-5 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const s = v.trim();
            if (!isSignature(s)) return setErr("That doesn't look like a transaction signature (base58, ~88 characters).");
            router.push(`/tx/${s}`);
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <ReceiptText size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input value={v} onChange={(e) => (setV(e.target.value), setErr(null))} className="input h-12 rounded-full pl-11 font-mono text-[13px]" placeholder="Transaction signature" aria-label="Transaction signature" />
          </div>
          <button className="btn btn-primary h-12 px-6">
            Explain <ArrowRight size={15} />
          </button>
        </form>
        {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
      </Card>
      <InfoNote className="mt-4">
        About to sign something instead? Use the <a href="/security#tx" className="underline">pre-sign check</a> in the Security Center to decode an unsigned transaction before you approve it.
      </InfoNote>
    </Page>
  );
}
