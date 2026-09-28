"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Globe, CornerDownLeft, Search, ShieldCheck, Sparkles, Wallet, ReceiptText, Coins } from "lucide-react";
import { PAGES } from "@/lib/catalog/pages";
import { APPS, appLogo } from "@/lib/catalog/apps";
import { BROWSER_EXTENSIONS } from "@/lib/extensions/browser";
import { scoreDoc } from "@/lib/search/fuzzy";
import { detectIntent } from "@/lib/search/intent";
import { asWebUrl, goHref } from "@/lib/web-url";
import { useActions, useStore } from "@/lib/client/store";
import type { SearchResponse } from "@/lib/types";
import { shortAddr } from "@/lib/format";
import { Icon } from "../icon";
import { Monogram, cn } from "../ui";

export function openCommandBar() {
  window.dispatchEvent(new Event("sos:command"));
}

interface Item {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ReactNode;
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [remote, setRemote] = useState<SearchResponse | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recent = useStore((s) => s.recentSearches);
  const { pushRecentSearch } = useActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sos:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sos:command", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setRemote(null);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Debounced remote search for tokens and live sources.
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return setRemote(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => r && setRemote(r))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const t = q.trim();
    const out: Item[] = [];
    if (!t) {
      recent.slice(0, 4).forEach((r) => out.push({ id: `r:${r}`, group: "Recent", title: r, href: `/search?q=${encodeURIComponent(r)}`, icon: <Clock size={16} /> }));
      PAGES.filter((p) => p.nav).forEach((p) => out.push({ id: p.href, group: "Go to", title: p.title, subtitle: p.description, href: p.href, icon: <Icon name={p.icon} size={16} /> }));
      return out;
    }
    const site = asWebUrl(t);
    if (site) out.push({ id: "site", group: "Website", title: `Go to ${new URL(site).hostname}`, subtitle: "Opens the site after a quick safety check", href: goHref(site), icon: <Globe size={16} /> });
    const intent = detectIntent(t);
    if (intent.type === "analyze_wallet" && intent.entity) {
      out.push({ id: "wallet", group: "Actions", title: `Analyze ${shortAddr(intent.entity, 6)}`, subtitle: "Wallet, token or program", href: `/wallets/${intent.entity}`, icon: <Wallet size={16} /> });
      out.push({ id: "sec", group: "Actions", title: `Security check ${shortAddr(intent.entity, 6)}`, href: `/security?q=${intent.entity}`, icon: <ShieldCheck size={16} /> });
      out.push({ id: "tok", group: "Actions", title: `Open as token`, href: `/tokens/${intent.entity}`, icon: <Coins size={16} /> });
    } else if (intent.type === "explain_tx" && intent.entity) {
      out.push({ id: "tx", group: "Actions", title: `Explain transaction ${shortAddr(intent.entity, 6)}`, href: `/tx/${intent.entity}`, icon: <ReceiptText size={16} /> });
    } else if (intent.type === "security" && intent.entity) {
      out.push({ id: "sec", group: "Actions", title: `Security check ${shortAddr(intent.entity, 6)}`, href: intent.href!, icon: <ShieldCheck size={16} /> });
    } else if (intent.href && intent.type !== "lookup") {
      out.push({ id: "intent", group: "Actions", title: intent.label, subtitle: t, href: intent.href, icon: <ArrowRight size={16} /> });
    }
    const tokenGroup = remote?.groups.find((g) => g.kind === "token");
    tokenGroup?.hits.slice(0, 4).forEach((h) => out.push({ id: `t:${h.id}`, group: "Tokens", title: h.title, subtitle: h.subtitle, href: h.href, icon: <Monogram name={String(h.meta?.symbol ?? h.title)} src={h.icon} size={22} rounded="full" /> }));
    APPS.map((a) => ({ a, s: scoreDoc(t, a.name, [a.tagline, a.category], a.keywords) }))
      .filter((x) => x.s > 0.45)
      .sort((x, y) => y.s - x.s)
      .slice(0, 4)
      .forEach(({ a }) => out.push({ id: `a:${a.slug}`, group: "Apps", title: a.name, subtitle: a.tagline, href: `/apps/${a.slug}`, icon: <Monogram name={a.name} color={a.color} src={appLogo(a.slug)} size={22} /> }));
    BROWSER_EXTENSIONS.map((e) => ({ e, s: scoreDoc(t, e.name, [e.description]) }))
      .filter((x) => x.s > 0.55)
      .slice(0, 2)
      .forEach(({ e }) => out.push({ id: `e:${e.id}`, group: "Extensions", title: e.name, subtitle: e.description, href: "/extensions", icon: <Icon name="Puzzle" size={16} /> }));
    PAGES.map((p) => ({ p, s: scoreDoc(t, p.title, [p.description], p.keywords) }))
      .filter((x) => x.s > 0.55)
      .slice(0, 3)
      .forEach(({ p }) => out.push({ id: p.href, group: "Go to", title: p.title, subtitle: p.description, href: p.href, icon: <Icon name={p.icon} size={16} /> }));
    remote?.groups
      .filter((g) => g.kind === "news")
      .flatMap((g) => g.hits.slice(0, 2).map((h) => ({ ...h, group: g.label })))
      .forEach((h) => out.push({ id: `${h.kind}:${h.id}`, group: h.group, title: h.title, subtitle: h.subtitle, href: h.href, icon: <Icon name="Newspaper" size={16} /> }));
    out.push({ id: "ai", group: "Solana AI", title: `Ask Solana AI: “${t}”`, href: `/ai?q=${encodeURIComponent(t)}`, icon: <Sparkles size={16} className="text-sol-green" /> });
    out.push({ id: "all", group: "Search", title: `Search everything for “${t}”`, href: `/search?q=${encodeURIComponent(t)}`, icon: <Search size={16} /> });
    return out;
  }, [q, remote, recent]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const go = (it: Item) => {
    if (q.trim()) pushRecentSearch(q.trim());
    setOpen(false);
    if (/^https?:/.test(it.href)) window.open(it.href, "_blank", "noopener,noreferrer");
    else router.push(it.href);
  };

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[8vh] sm:pt-[14vh]" role="dialog" aria-modal="true" aria-label="Command bar">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="animate-scale-in relative w-full max-w-[640px] overflow-hidden rounded-3xl border border-line-strong bg-elev shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter" && items[sel]) {
                e.preventDefault();
                go(items[sel]);
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search tokens, wallets, apps, transactions… or ask anything"
            className="h-14 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-faint"
            aria-label="Search"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint sm:block">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-faint">{header}</div>}
                <button
                  data-idx={i}
                  onMouseMove={() => setSel(i)}
                  onClick={() => go(it)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === sel ? "bg-surface-2" : "")}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center text-muted">{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{it.title}</span>
                    {it.subtitle && <span className="block truncate text-[12px] text-faint">{it.subtitle}</span>}
                  </span>
                  {i === sel && <CornerDownLeft size={14} className="text-faint" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-faint">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>Paste any address or signature</span>
        </div>
      </div>
    </div>
  );
}
