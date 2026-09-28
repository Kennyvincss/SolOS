"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { History as HistoryIcon, Search, Trash2, X } from "lucide-react";
import { Card, EmptyState, Page, PageHeader, Section, cn } from "@/components/ui";
import { SiteIcon } from "@/components/library";
import { ActivityList } from "@/components/domain";
import { useLibraryData } from "@/lib/client/library";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import type { HistoryEntry } from "@/lib/library/types";
import { TYPE_LABEL } from "@/lib/library/types";
import type { ActivityItem, Sourced } from "@/lib/types";

const FILTERS: { id: string; label: string }[] = [
  { id: "", label: "All" },
  { id: "website", label: "Websites" },
  { id: "app", label: "Apps" },
  { id: "token", label: "Tokens" },
  { id: "wallet", label: "Wallets" },
  { id: "transaction", label: "Transactions" },
  { id: "market", label: "Markets" },
  { id: "search", label: "Searches" },
  { id: "ai", label: "AI" },
  { id: "wallet-activity", label: "Wallet activity" },
];

const DAY = 86_400_000;
function bucket(at: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (at >= today) return "Today";
  if (at >= today - DAY) return "Yesterday";
  if (at >= today - 6 * DAY) return "Last 7 days";
  return "Older";
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Where a history entry reopens: searches and AI questions rerun, pages open. */
function hrefOf(e: HistoryEntry) {
  if (e.type === "search" && e.query) return `/search?q=${encodeURIComponent(e.query)}`;
  if (e.type === "ai" && e.query) return `/ai?q=${encodeURIComponent(e.query)}`;
  return e.url;
}

function HistoryPage() {
  const params = useSearchParams();
  const [type, setType] = useState(params.get("type") ?? "");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(200);
  const [clearing, setClearing] = useState(false);
  const { data, api, reload } = useLibraryData((a) => a.history({ query: q, type, limit }), [q, type, limit]);
  const session = useSession();
  const walletActivity = useApi<Sourced<ActivityItem[]>>(type === "wallet-activity" && session.address && session.address !== "demo" ? `/api/wallets/${session.address}/activity?limit=10` : null);

  useEffect(() => setLimit(200), [q, type]);

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const e of data ?? []) {
      const label = bucket(e.at);
      const g = out.find((x) => x.label === label);
      if (g) g.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [data]);

  const clear = async (since?: number) => {
    await api.clearHistory(since);
    setClearing(false);
    reload();
  };

  return (
    <Page wide>
      <PageHeader
        title="History"
        subtitle="Sites, apps, tokens, wallets, transactions and markets you viewed, plus your searches and AI questions."
        actions={
          <div className="relative">
            <button onClick={() => setClearing(!clearing)} className="btn btn-ghost btn-sm">
              <Trash2 size={14} /> Clear history
            </button>
            {clearing && (
              <Card className="absolute right-0 top-10 z-20 w-56 p-1.5">
                {[
                  { label: "Last hour", since: Date.now() - 3600e3 },
                  { label: "Today", since: new Date().setHours(0, 0, 0, 0) },
                  { label: "Last 7 days", since: Date.now() - 7 * DAY },
                  { label: "All time", since: undefined },
                ].map((o) => (
                  <button key={o.label} onClick={() => clear(o.since)} className="block w-full rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-surface-2">
                    {o.label}
                  </button>
                ))}
              </Card>
            )}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-line bg-surface px-3">
          <Search size={15} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
          {q && (
            <button onClick={() => setQ("")} className="text-faint hover:text-fg" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
      </div>
      <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f.id || "all"} onClick={() => setType(f.id)} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12.5px] transition-colors", type === f.id ? "border-transparent bg-fg text-bg" : "border-line text-muted hover:text-fg")}>
            {f.label}
          </button>
        ))}
      </div>

      {type === "wallet-activity" && (
        <Section title="Your wallet's onchain activity" className="mt-0">
          {!session.address || session.address === "demo" ? (
            <Card className="p-4 text-[13.5px] text-muted">Connect a wallet to see its latest transactions here. Below: wallets and transactions you viewed.</Card>
          ) : (
            <Card className="p-2">{walletActivity.data ? <ActivityList items={walletActivity.data.data} /> : <p className="p-3 text-[13px] text-muted">{walletActivity.error ? "Couldn't load your activity right now." : "Loading…"}</p>}</Card>
          )}
        </Section>
      )}

      {!data ? null : groups.length === 0 ? (
        <Card>
          <EmptyState icon={<HistoryIcon size={20} />} title={q || type ? "Nothing matches" : "No history yet"} body={q || type ? "Try another search or filter." : "Pages you visit, searches and AI questions show up here."} />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-[13px] font-medium text-muted">{g.label}</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {g.items.map((e) => (
                  <div key={e.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
                    <span className="w-14 shrink-0 text-[12px] tabular-nums text-faint">{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                    <SiteIcon url={e.url} type={e.type} size={16} />
                    <a href={hrefOf(e)} className="min-w-0 flex-1">
                      <div className="truncate text-[14px]">{e.type === "search" ? `Searched “${e.query ?? e.title}”` : e.type === "ai" ? `Asked STRATA AI: ${e.query ?? e.title}` : e.title}</div>
                      <div className="truncate text-[12px] text-faint">
                        {TYPE_LABEL[e.type] ?? "Website"}
                        {e.type !== "search" && e.type !== "ai" && host(e.url) ? ` · ${host(e.url)}` : ""}
                      </div>
                    </a>
                    <button onClick={async () => (await api.removeHistory(e.id), reload())} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint opacity-0 hover:bg-surface-3 hover:text-down group-hover:opacity-100" aria-label="Remove from history" title="Remove from history">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </Card>
            </section>
          ))}
          {(data?.length ?? 0) >= limit && (
            <button onClick={() => setLimit((l) => l + 200)} className="btn btn-ghost btn-sm mx-auto flex">
              Show more
            </button>
          )}
        </div>
      )}
      <p className="mt-4 text-[12px] text-faint">
        {api.kind === "desktop" ? "History of your current STRATA profile. It stays on this computer." : "History stays on this device."} <Link href="/bookmarks" className="underline">Bookmarks</Link> · <Link href="/reading-list" className="underline">Reading list</Link>
      </p>
    </Page>
  );
}

export default function Page_() {
  return (
    <Suspense>
      <HistoryPage />
    </Suspense>
  );
}
