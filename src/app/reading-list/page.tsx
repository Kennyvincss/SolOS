"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Circle, Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, Page, PageHeader, cn } from "@/components/ui";
import { SiteIcon } from "@/components/library";
import { useLibraryData } from "@/lib/client/library";
import { TYPE_LABEL } from "@/lib/library/types";
import { timeAgo } from "@/lib/format";

type Filter = "unread" | "read" | "all";

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ReadingListPage() {
  const { data, api, reload } = useLibraryData((a) => a.readingList());
  const [filter, setFilter] = useState<Filter>("unread");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [q, setQ] = useState("");
  const [url, setUrl] = useState("");

  const items = useMemo(() => {
    let list = data ?? [];
    if (filter !== "all") list = list.filter((r) => (filter === "read" ? r.read : !r.read));
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => `${r.title} ${r.url}`.toLowerCase().includes(needle));
    return [...list].sort((a, b) => (sort === "newest" ? b.addedAt - a.addedAt : a.addedAt - b.addedAt));
  }, [data, filter, q, sort]);

  const counts = { unread: (data ?? []).filter((r) => !r.read).length, read: (data ?? []).filter((r) => r.read).length, all: data?.length ?? 0 };

  return (
    <Page>
      <PageHeader title="Reading list" subtitle="Articles, research, project docs, news and whitepapers saved for later." />

      <Card className="mb-5 p-3">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const u = url.trim();
            if (!u) return;
            const full = /^https?:\/\//.test(u) ? u : `https://${u}`;
            await api.addToReadingList(full, full);
            setUrl("");
            reload();
          }}
          className="flex gap-2"
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link to read later (article, docs, whitepaper…)" className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-line-strong" />
          <button type="submit" disabled={!url.trim()} className="btn btn-primary btn-sm h-9 disabled:opacity-40">
            <Plus size={14} /> Add
          </button>
        </form>
        <p className="mt-2 px-1 text-[12px] text-faint">{api.kind === "desktop" ? "Tip: right-click any tab or page and choose “Add to reading list”, or use the book icon in the address bar." : "Tip: use “Read later” on news and research pages."}</p>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(["unread", "read", "all"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full border px-3 py-1 text-[12.5px] capitalize transition-colors", filter === f ? "border-transparent bg-fg text-bg" : "border-line text-muted hover:text-fg")}>
              {f} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "oldest")} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] outline-none" aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <label className="ml-auto flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 sm:w-56">
          <Search size={13} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        </label>
      </div>

      {!data ? null : items.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen size={20} />} title={filter === "unread" && counts.all ? "All caught up" : "Nothing saved yet"} body={filter === "unread" && counts.all ? "You've read everything on your list." : "Save articles, research and docs to read later."} />
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((r) => (
            <div key={r.url} className="group flex items-center gap-3 px-3 py-3 hover:bg-surface-2">
              <SiteIcon url={r.url} type={r.type ?? "website"} />
              <a href={r.url} onClick={() => api.setRead(r.url, true)} className="min-w-0 flex-1">
                <div className={cn("truncate text-[14px]", r.read ? "text-muted" : "font-medium")}>{r.title}</div>
                <div className="truncate text-[12px] text-faint">
                  {TYPE_LABEL[r.type ?? "website"]} · {host(r.url)} · added {timeAgo(r.addedAt)}
                </div>
              </a>
              <button onClick={async () => (await api.setRead(r.url, !r.read), reload())} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted hover:bg-surface-3 hover:text-fg" title={r.read ? "Mark as unread" : "Mark as read"}>
                {r.read ? <Circle size={14} /> : <Check size={14} />} <span className="hidden sm:inline">{r.read ? "Mark unread" : "Mark read"}</span>
              </button>
              <button onClick={async () => (await api.removeFromReadingList(r.url), reload())} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-surface-3 hover:text-down" aria-label="Remove" title="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
