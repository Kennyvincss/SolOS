"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, ChevronRight, Command, Compass, Home, Menu, PanelLeft, Plus, Search, Sparkles, Wallet, X } from "lucide-react";
import { PAGES } from "@/lib/catalog/pages";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import { Icon } from "../icon";
import { cn } from "../ui";
import { Wordmark, LogoMark } from "./logo";
import { shortAddr } from "@/lib/format";
import { openCommandBar } from "./command-bar-host";
import { openAiPanel } from "../ai/side-panel";
import { ModeSwitch } from "../mode-switch";
import { LiteSearchInput } from "../lite/search-input";

type NavItem = { href: string; label?: string; icon?: string };
type NavGroup = { id: string; title?: string; badge?: string; add?: { href: string; label: string }; items: NavItem[] };

/** Pro workspace navigation. Items with a query (e.g. ?tab=trending) point at a view of an existing page. */
const GROUPS: NavGroup[] = [
  { id: "main", items: [{ href: "/", label: "Dashboard", icon: "Home" }, { href: "/search" }, { href: "/notifications" }] },
  { id: "discover", title: "Discover", items: [{ href: "/discover", label: "Explore" }, { href: "/tokens" }, { href: "/apps?category=NFTs", label: "NFTs", icon: "Images" }, { href: "/defi" }, { href: "/rwa" }, { href: "/news" }] },
  { id: "markets", title: "Markets", items: [{ href: "/?view=market", label: "Market Overview", icon: "Activity" }, { href: "/tokens?tab=trending", label: "Trending", icon: "Flame" }, { href: "/tokens?tab=watchlist", label: "Watchlist", icon: "Star" }, { href: "/portfolio" }] },
  { id: "tools", title: "Tools", items: [{ href: "/ai" }, { href: "/wallets", label: "Wallets" }, { href: "/tx", label: "Transactions" }, { href: "/security" }, { href: "/payments" }, { href: "/developers", label: "Developer" }] },
  { id: "store", title: "App Store", badge: "New", add: { href: "/apps", label: "Browse apps" }, items: [{ href: "/apps" }, { href: "/extensions" }] },
  { id: "library", title: "Library", items: [{ href: "/bookmarks" }, { href: "/history" }, { href: "/reading-list" }] },
];
const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

/** The catalog page the current path belongs to (longest matching prefix). */
function pageFor(path: string) {
  return [...PAGES].sort((a, b) => b.href.length - a.href.length).find((p) => isActive(path, p.href));
}

function WalletButton({ compact, rail }: { compact?: boolean; rail?: boolean }) {
  const s = useSession();
  const label = s.wallet ? shortAddr(s.wallet.address) : s.address ? (s.address === "demo" ? "Demo wallet" : `Watching ${shortAddr(s.address)}`) : "Connect wallet";
  const icon = s.wallet?.icon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.wallet.icon} alt="" className="h-full w-full rounded-[inherit]" />
  ) : (
    <Wallet size={compact ? 14 : 16} />
  );
  if (rail)
    return (
      <button onClick={() => s.setWalletModal(true)} title={label} aria-label={label} className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-muted shadow-[var(--shadow)] hover:text-fg">
        <span className="grid h-6 w-6 place-items-center rounded-lg">{icon}</span>
      </button>
    );
  return (
    <button
      onClick={() => s.setWalletModal(true)}
      className={cn(
        "flex items-center gap-2.5 text-left transition-colors",
        compact ? "h-10 shrink-0 rounded-full border border-line bg-surface px-2 shadow-[var(--shadow)] hover:border-line-strong xl:px-2.5 [&>span:nth-child(2)]:hidden xl:[&>span:nth-child(2)]:block" : "w-full rounded-xl border border-line bg-surface p-2.5 shadow-[var(--shadow)] hover:border-line-strong",
      )}
    >
      <span className={cn("grid shrink-0 place-items-center", s.wallet ? "bg-sol-green/10 text-sol-green" : "bg-surface-2 text-muted", compact ? "h-6 w-6 rounded-full" : "h-8 w-8 rounded-lg")}>{icon}</span>
      <span className="min-w-0 flex-1">
        {!compact && <span className="block text-[11px] text-faint">{s.wallet ? s.wallet.name : s.address ? "Read-only" : "Wallet"}</span>}
        <span className={cn("block truncate font-medium", compact ? "text-[12.5px]" : "text-[13px]")}>{label}</span>
      </span>
      {s.wallet && !compact && <span className="h-2 w-2 rounded-full bg-up" />}
    </button>
  );
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

const NARROW = "(min-width: 768px) and (max-width: 1099px)";

/**
 * Sidebar collapsed to an icon rail. Wide screens remember the choice; on
 * narrow ones (e.g. next to the AI panel) it starts as a rail and expands on demand.
 */
export function useSidebarCollapsed() {
  const [, rerender] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(NARROW);
    const on = () => rerender((n) => n + 1);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const html = typeof document !== "undefined" ? document.documentElement : null;
  const narrow = mounted && window.matchMedia(NARROW).matches;
  const collapsed = mounted && html ? (narrow ? !html.classList.contains("sb-expanded") : html.classList.contains("sb-collapsed")) : false;
  const toggle = () => {
    if (!html) return;
    if (narrow) html.classList.toggle("sb-expanded");
    else {
      const next = !html.classList.contains("sb-collapsed");
      html.classList.toggle("sb-collapsed", next);
      try {
        localStorage.setItem("strata:sidebar", next ? "collapsed" : "open");
      } catch {}
    }
    rerender((n) => n + 1);
  };
  return { collapsed, toggle };
}

export function Sidebar() {
  const path = usePathname();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const { collapsed, toggle } = useSidebarCollapsed();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  useEffect(() => setClosed(readJson("strata:nav-sections", {})), []);
  const toggleGroup = (id: string) =>
    setClosed((c) => {
      const next = { ...c, [id]: !c[id] };
      try {
        localStorage.setItem("strata:nav-sections", JSON.stringify(next));
      } catch {}
      return next;
    });
  const params = useSearchParams();
  const byHref = (h: string) => PAGES.find((p) => p.href === h);
  const queryMatches = (qs: string) => [...new URLSearchParams(qs)].every(([k, v]) => params.get(k) === v);
  const isOn = (href: string) => {
    const [base, qs] = href.split("?");
    if (!isActive(path, base)) return false;
    if (qs) return queryMatches(qs);
    // A plain link loses to a sibling view of the same page that matches the query.
    return !ALL_ITEMS.some((o) => o.href !== href && o.href.split("?")[0] === base && o.href.includes("?") && queryMatches(o.href.split("?")[1]));
  };

  const link = (it: NavItem) => {
    const p = byHref(it.href.split("?")[0]);
    if (!p) return null;
    const active = isOn(it.href);
    const label = it.label ?? p.title;
    const badge = p.href === "/notifications" && unread > 0 ? (unread > 99 ? "99+" : String(unread)) : null;
    return (
      <Link
        key={it.href}
        href={it.href}
        prefetch
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-[10px] text-[13.5px] transition-colors",
          collapsed ? "mx-auto h-10 w-10 justify-center" : "px-3 py-[6px]",
          active ? "bg-surface-3/80 font-medium text-fg" : "text-muted hover:bg-surface-3/50 hover:text-fg",
        )}
      >
        <Icon name={it.icon ?? p.icon} size={17} strokeWidth={1.8} className={active ? "text-fg" : "text-muted group-hover:text-fg"} />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {badge && (collapsed ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-down" /> : <span className="rounded-full bg-down px-1.5 text-[10.5px] font-semibold text-white">{badge}</span>)}
      </Link>
    );
  };

  return (
    <aside className="pro-only fixed inset-y-0 left-0 z-40 hidden w-[var(--sb-w)] flex-col border-r border-line bg-sidebar transition-[width] duration-200 md:flex">
      <div className={cn("flex h-[60px] shrink-0 items-center border-b border-line", collapsed ? "justify-center" : "justify-between pl-5 pr-3")}>
        {!collapsed && (
          <Link href="/" aria-label="STRATA home">
            <Wordmark />
          </Link>
        )}
        <button onClick={toggle} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-3/60 hover:text-fg" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <LogoMark size={22} /> : <PanelLeft size={17} />}
        </button>
      </div>
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {GROUPS.map((g) => (
          <div key={g.id} className={cn(g.title && (collapsed ? "mt-3 border-t border-line pt-3" : "mt-4"))}>
            {g.title && !collapsed && (
              <div className="mb-1 flex items-center gap-1 px-1.5">
                <button onClick={() => toggleGroup(g.id)} className="flex flex-1 items-center gap-1.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-faint hover:text-muted" aria-expanded={!closed[g.id]}>
                  <ChevronDown size={13} className={cn("transition-transform", closed[g.id] && "-rotate-90")} />
                  {g.title}
                  {g.badge && <span className="ml-1 rounded-full bg-sol-green/12 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-sol-green">{g.badge}</span>}
                </button>
                {g.add && (
                  <Link href={g.add.href} className="grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface-3/60 hover:text-fg" aria-label={g.add.label} title={g.add.label}>
                    <Plus size={14} />
                  </Link>
                )}
              </div>
            )}
            {(collapsed || !closed[g.id]) && <div className="space-y-0.5">{g.items.map(link)}</div>}
          </div>
        ))}
      </nav>
      <div className={cn("space-y-2 border-t border-line p-3", collapsed && "px-2")}>
        {link({ href: "/settings" })}
        <WalletButton rail={collapsed} />
      </div>
    </aside>
  );
}

/** Desktop top bar: where you are, search, STRATA AI, notifications and wallet. */
export function DesktopHeader() {
  const path = usePathname();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  if (path.startsWith("/ai")) return null; // STRATA AI has its own full-screen header
  const page = pageFor(path);
  const deeper = page && page.href !== "/" && path !== page.href;
  return (
    <header id="app-header" className="pro-only sticky top-0 z-30 hidden h-[60px] items-center gap-3 border-b border-line bg-bg/85 px-6 backdrop-blur-xl md:flex">
      <nav aria-label="Breadcrumb" className="flex min-w-[96px] flex-1 items-center gap-2 text-[14px]">
        <Icon name={page?.icon ?? "Home"} size={17} className="shrink-0 text-muted" />
        {deeper ? (
          <>
            <Link href={page.href} className="truncate text-muted hover:text-fg">
              {page.title}
            </Link>
            <ChevronRight size={14} className="shrink-0 text-faint" />
            <span className="truncate font-medium">Details</span>
          </>
        ) : (
          <span className="truncate font-medium">{page?.href === "/" ? "Dashboard" : page?.title ?? "STRATA"}</span>
        )}
      </nav>
      <ModeSwitch compact />
      <button onClick={openCommandBar} className="flex h-10 min-w-0 flex-[2] max-w-[420px] items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-[13px] text-faint shadow-[var(--shadow)] transition-colors hover:border-line-strong">
        <Search size={15} className="text-muted" />
        <span className="flex-1 truncate text-left">Search (tokens, wallets, apps, transactions)</span>
        <kbd className="flex items-center gap-0.5 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
          <Command size={11} />K
        </kbd>
      </button>
      <button onClick={() => openAiPanel()} className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-[13px] font-medium shadow-[var(--shadow)] hover:border-line-strong" title="Ask STRATA AI (⌘J)" aria-label="Ask STRATA AI">
        <Sparkles size={15} className="text-sol-green" /> <span className="hidden xl:inline">Ask AI</span>
      </button>
      <Link href="/notifications" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted shadow-[var(--shadow)] hover:text-fg" aria-label="Notifications">
        <Bell size={16} />
        {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-down ring-2 ring-surface" />}
      </Link>
      <WalletButton compact />
    </header>
  );
}

export function TopBar() {
  const path = usePathname();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  if (path.startsWith("/ai")) return null; // STRATA AI has its own full-screen header
  return (
    <header className="pro-only sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur-xl md:hidden">
      <Link href="/" aria-label="STRATA home">
        <LogoMark size={26} />
      </Link>
      <button onClick={openCommandBar} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] text-faint shadow-[var(--shadow)]">
        <Search size={14} className="shrink-0" /> <span className="truncate">Search…</span>
      </button>
      <ModeSwitch compact />
      <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-full text-muted" aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-down" />}
      </Link>
    </header>
  );
}

/** Lite mode top bar on content pages: logo, search, Lite/Pro. (Home and search have their own.) */
export function LiteTopBar() {
  const path = usePathname();
  if (path === "/" || path === "/search" || path.startsWith("/ai")) return null;
  return (
    <header className="lite-only sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:h-[60px] sm:gap-5 sm:px-6">
        <Link href="/" aria-label="STRATA home" className="shrink-0">
          <span className="hidden sm:inline">
            <Wordmark />
          </span>
          <span className="sm:hidden">
            <LogoMark size={28} />
          </span>
        </Link>
        <LiteSearchInput size="sm" className="max-w-[440px] flex-1" />
        <ModeSwitch compact className="ml-auto" />
      </div>
    </header>
  );
}

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/ai", label: "AI", icon: Sparkles },
  { href: "/portfolio", label: "Wallet", icon: Wallet },
];

export function MobileNav() {
  const path = usePathname();
  const [more, setMore] = useState(false);
  if (path.startsWith("/ai")) return null; // the chat composer owns the bottom of the screen
  return (
    <>
      <nav className="pro-only pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-6">
          {TABS.map((t) => {
            const active = isActive(path, t.href);
            return (
              <Link key={t.href} href={t.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px]", active ? "text-fg" : "text-faint")}>
                <t.icon size={20} strokeWidth={active ? 2.1 : 1.7} className={active && t.href === "/ai" ? "text-sol-green" : undefined} />
                {t.label}
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] text-faint">
            <Menu size={20} strokeWidth={1.7} />
            More
          </button>
        </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMore(false)} />
          <div className="animate-scale-in pb-safe absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-line bg-elev p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold">Everything</span>
              <button onClick={() => setMore(false)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2" aria-label="Close">
                <X size={15} />
              </button>
            </div>
            <div className="mb-4">
              <WalletButton />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAGES.filter((p) => !TABS.some((t) => t.href === p.href)).map((p) => (
                <Link key={p.href} href={p.href} onClick={() => setMore(false)} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface p-3 text-center text-[12px]">
                  <Icon name={p.icon} size={19} className="text-muted" />
                  {p.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
