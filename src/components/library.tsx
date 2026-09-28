"use client";

import { useEffect, useState } from "react";
import { Bookmark as BookmarkIcon, BookOpen, Coins, FileText, Globe, Images, LayoutGrid, LineChart, ReceiptText, Search, Sparkles, Wallet } from "lucide-react";
import type { PageType } from "@/lib/library/types";
import { useLibraryData } from "@/lib/client/library";
import { cn } from "./ui";

const ICON: Record<PageType, typeof Globe> = {
  token: Coins,
  wallet: Wallet,
  transaction: ReceiptText,
  app: LayoutGrid,
  market: LineChart,
  nft: Images,
  research: FileText,
  search: Search,
  ai: Sparkles,
  strata: Globe,
  website: Globe,
};

export function TypeIcon({ type, size = 15, className }: { type: PageType | string; size?: number; className?: string }) {
  const C = ICON[type as PageType] ?? Globe;
  return <C size={size} className={className} />;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Favicon for a site (STRATA pages show the STRATA mark, onchain entities their type icon). */
export function SiteIcon({ url, type, size = 18 }: { url: string; type: PageType | string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  const own = typeof window !== "undefined" && host === window.location.hostname;
  if (["token", "wallet", "transaction", "search", "ai"].includes(type) || own || !host || failed) {
    return (
      <span className="grid shrink-0 place-items-center rounded-md bg-surface-2 text-muted" style={{ width: size + 6, height: size + 6 }}>
        <TypeIcon type={type} size={Math.round(size * 0.8)} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`} alt="" width={size + 6} height={size + 6} className="shrink-0 rounded-md bg-surface-2 p-[3px]" onError={() => setFailed(true)} />
  );
}

/** Star button: bookmark the current page (tokens, wallets, transactions, apps, ...). */
export function BookmarkButton({ title, className }: { title?: string; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(window.location.href.split("#")[0]), []);
  const { data: saved, api, reload } = useLibraryData(async (a) => (url ? (await a.bookmarks()).bookmarks.some((b) => b.url === url) : false), [url]);
  return (
    <button
      onClick={async () => {
        if (!url) return;
        if (saved) await api.removeBookmark(url);
        else await api.addBookmark({ url, title: title || document.title });
        reload();
      }}
      className={cn("btn btn-ghost btn-sm", saved && "text-warn", className)}
      title={saved ? "Remove bookmark" : "Bookmark this page"}
      aria-pressed={Boolean(saved)}
    >
      <BookmarkIcon size={14} className={saved ? "fill-current" : undefined} /> {saved ? "Saved" : "Bookmark"}
    </button>
  );
}

/** Save the current page (or a given URL) to the reading list. */
export function ReadLaterButton({ url: fixed, title, className }: { url?: string; title?: string; className?: string }) {
  const [url, setUrl] = useState(fixed ?? "");
  useEffect(() => setUrl(fixed ?? window.location.href.split("#")[0]), [fixed]);
  const { data: saved, api, reload } = useLibraryData(async (a) => (url ? (await a.readingList()).some((r) => r.url === url) : false), [url]);
  return (
    <button
      onClick={async () => {
        if (!url) return;
        if (saved) await api.removeFromReadingList(url);
        else await api.addToReadingList(url, title || document.title);
        reload();
      }}
      className={cn("btn btn-ghost btn-sm", saved && "text-sol-green", className)}
      title={saved ? "Remove from reading list" : "Read later"}
    >
      <BookOpen size={14} /> {saved ? "In reading list" : "Read later"}
    </button>
  );
}

/** Small "read later" toggle for lists (e.g. news). */
export function ReadLaterIcon({ url, title, className }: { url: string; title: string; className?: string }) {
  const { data: saved, api, reload } = useLibraryData(async (a) => (await a.readingList()).some((r) => r.url === url), [url]);
  return (
    <button
      onClick={async () => {
        if (saved) await api.removeFromReadingList(url);
        else await api.addToReadingList(url, title);
        reload();
      }}
      className={cn("grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-surface-3", saved ? "text-sol-green !opacity-100" : "text-faint hover:text-fg", className)}
      title={saved ? "In your reading list" : "Read later"}
      aria-label={saved ? "Remove from reading list" : "Read later"}
    >
      <BookOpen size={15} />
    </button>
  );
}
