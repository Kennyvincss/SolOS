"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BellRing, Pencil, Trash2 } from "lucide-react";
import { Address, Card, EmptyState, Page, PageHeader, Section } from "@/components/ui";
import { FollowingFeed } from "@/components/wallet-tools";
import { useActions, useStore } from "@/lib/client/store";
import { isAddress, isSignature } from "@/lib/solana/address";
import { timeAgo } from "@/lib/format";

export default function WalletsPage() {
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const followed = useStore((s) => s.followed);
  const alerts = useStore((s) => s.walletAlerts);
  const { unfollow, renameFollowed } = useActions();

  return (
    <Page>
      <PageHeader title="Explore Wallets" subtitle="Look up any public Solana wallet, follow the ones you care about and get alerts on their moves." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          if (isSignature(v)) return router.push(`/tx/${v}`);
          if (!isAddress(v)) return setErr("Enter a valid Solana address (base58, 32–44 characters).");
          router.push(`/wallets/${v}`);
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => (setQ(e.target.value), setErr(null))} className="input h-12 rounded-full px-5" placeholder="Paste a wallet address, e.g. 7xKX…" aria-label="Wallet address" />
        <button className="btn btn-primary h-12 px-5">
          Analyze <ArrowRight size={15} />
        </button>
      </form>
      {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
      <p className="mt-2 text-[12px] text-faint">
        Try the <Link href="/wallets/demo" className="underline decoration-dotted underline-offset-2 hover:text-fg">demo wallet</Link> to see the layout with placeholder data.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title="Following" subtitle="Latest activity from wallets you follow" className="mt-0">
          <Card className="p-4 sm:p-5">
            <FollowingFeed />
          </Card>
        </Section>
        <Section title="Followed wallets" className="mt-0">
          <Card className="p-2">
            {!followed.length && <EmptyState title="None yet" body="Follow a wallet from its page." />}
            {followed.map((f) => {
              const a = alerts.find((x) => x.address === f.address);
              return (
                <div key={f.address} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
                  <Link href={`/wallets/${f.address}`} className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{f.label}</div>
                    <div className="flex items-center gap-2 text-[12px] text-faint">
                      <Address value={f.address} />
                      {a && (
                        <span className="flex items-center gap-1 text-sol-green">
                          <BellRing size={11} /> {a.kinds.length}
                        </span>
                      )}
                    </div>
                  </Link>
                  <span className="hidden text-[11px] text-faint sm:block">{timeAgo(f.addedAt)}</span>
                  <button
                    onClick={() => {
                      const name = prompt("Label for this wallet", f.label);
                      if (name) renameFollowed(f.address, name.slice(0, 40));
                    }}
                    className="text-faint opacity-0 hover:text-fg group-hover:opacity-100"
                    aria-label="Rename"
                  >
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => unfollow(f.address)} className="text-faint opacity-0 hover:text-down group-hover:opacity-100" aria-label="Unfollow">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </Card>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">Only public on-chain data is shown. Labels you give wallets are private to you.</p>
        </Section>
      </div>
    </Page>
  );
}
