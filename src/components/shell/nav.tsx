"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, Command, Compass, Home, Menu, Search, Sparkles, Wallet, X } from "lucide-react";
import { PAGES } from "@/lib/catalog/pages";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import { Icon } from "../icon";
import { cn } from "../ui";
import { Wordmark, LogoMark } from "./logo";
import { shortAddr } from "@/lib/format";
import { openCommandBar } from "./command-bar";
import { openAiPanel } from "../ai/side-panel";

const SIDEBAR = ["/", "/search", "/discover", "/apps", "/extensions", "/ai", "/tokens", "/wallets", "/defi", "/rwa", "/payments", "/news", "/security", "/portfolio", "/bookmarks", "/history", "/notifications", "/settings"];
const LABEL: Record<string, string> = { "/ai": "AI" };

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`) || (href === "/wallets" && path.startsWith("/tx"));
}

function WalletButton({ compact }: { compact?: boolean }) {
  const s = useSession();
  const label = s.wallet ? shortAddr(s.wallet.address) : s.address ? (s.address === "demo" ? "Demo wallet" : `Watching ${shortAddr(s.address)}`) : "Connect wallet";
  return (
    <button
      onClick={() => s.setWalletModal(true)}
      className={cn("flex w-full items-center gap-2.5 rounded-2xl border border-line p-2.5 text-left transition-colors hover:bg-surface-2", compact && "w-auto rounded-full px-3 py-1.5")}
    >
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", s.wallet ? "bg-sol-green/10 text-sol-green" : "bg-surface-2 text-muted", compact && "h-6 w-6 rounded-full")}>
        {s.wallet?.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.wallet.icon} alt="" className="h-full w-full rounded-[inherit]" />
        ) : (
          <Wallet size={compact ? 13 : 16} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {!compact && <span className="block text-[11px] text-faint">{s.wallet ? s.wallet.name : s.address ? "Read-only" : "Wallet"}</span>}
        <span className={cn("block truncate font-medium", compact ? "text-[12px]" : "text-[13px]")}>{label}</span>
      </span>
      {s.wallet && !compact && <span className="h-2 w-2 rounded-full bg-sol-green" />}
    </button>
  );
}

export function Sidebar() {
  const path = usePathname();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const items = SIDEBAR.map((h) => PAGES.find((p) => p.href === h)!).filter(Boolean);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-line bg-bg/80 backdrop-blur-xl md:flex">
      <Link href="/" className="flex h-16 items-center px-5">
        <Wordmark />
      </Link>
      <button onClick={openCommandBar} className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted">
        <Search size={14} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="flex items-center gap-0.5 rounded-md border border-line px-1.5 text-[10.5px]">
          <Command size={10} />K
        </kbd>
      </button>
      <button onClick={() => openAiPanel()} className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--green)_30%,var(--border))] bg-[color-mix(in_srgb,var(--green)_8%,transparent)] px-3 py-2 text-[13px] text-fg transition-colors hover:bg-[color-mix(in_srgb,var(--green)_14%,transparent)]">
        <Sparkles size={14} className="text-sol-green" />
        <span className="flex-1 text-left">Ask STRATA AI</span>
        <kbd className="flex items-center gap-0.5 rounded-md border border-line px-1.5 text-[10.5px] text-faint">
          <Command size={10} />J
        </kbd>
      </button>
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-1">
        {items.map((p) => {
          const active = isActive(path, p.href);
          return (
            <Link
              key={p.href}
              href={p.href}
              prefetch
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13.5px] transition-colors",
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <Icon name={p.icon} size={17} className={active ? "text-sol-green" : "text-faint group-hover:text-muted"} />
              <span className="flex-1">{LABEL[p.href] ?? p.title}</span>
              {p.href === "/notifications" && unread > 0 && <span className="rounded-full bg-sol-green px-1.5 text-[10.5px] font-semibold text-black">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <WalletButton />
      </div>
    </aside>
  );
}

export function TopBar() {
  const path = usePathname();
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  if (path.startsWith("/ai")) return null; // STRATA AI has its own full-screen header
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/80 px-4 backdrop-blur-xl md:hidden">
      <Link href="/" aria-label="STRATA home">
        <LogoMark size={26} />
      </Link>
      <button onClick={openCommandBar} className="flex h-9 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] text-faint">
        <Search size={14} /> Search Solana…
      </button>
      <button onClick={() => openAiPanel()} className="grid h-9 w-9 place-items-center rounded-full text-sol-green" aria-label="Ask STRATA AI">
        <Sparkles size={18} />
      </button>
      <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-full text-muted" aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sol-green" />}
      </Link>
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
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden">
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
