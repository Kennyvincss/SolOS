"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Compass, Sparkles } from "lucide-react";
import { LogoMark, WordmarkText, Wordmark } from "../shell/logo";
import { ModeSwitch } from "../mode-switch";
import { LiteSearchInput, liteSearchHref, type LiteSearchHandle } from "./search-input";
import { useRouter } from "next/navigation";

/** Category shortcuts under the search box. */
export const LITE_CATEGORIES = [
  { label: "Apps", href: "/apps" },
  { label: "Tokens", href: "/tokens" },
  { label: "Wallets", href: "/search?q=Wallets" },
  { label: "NFTs", href: "/search?q=NFTs" },
  { label: "DeFi", href: "/search?q=DeFi" },
  { label: "AI", href: "/search?q=AI" },
  { label: "Developers", href: "/developers" },
];

const EXPLORE = [
  { label: "Trending", href: "/tokens?tab=trending" },
  { label: "Popular Apps", href: "/apps" },
  { label: "New Projects", href: "/discover#new" },
  { label: "Top Tokens", href: "/tokens?tab=top_traded" },
  { label: "Latest", href: "/news" },
];

/** STRATA Lite: the search-first home page. */
export function LiteHome() {
  const [ask, setAsk] = useState(false);
  const search = useRef<LiteSearchHandle>(null);
  const router = useRouter();

  // "/" focuses the search box, like a browser start page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const askStrata = () => {
    const q = search.current?.value().trim();
    if (q) return router.push(liteSearchHref(q, true));
    setAsk(true);
    requestAnimationFrame(() => search.current?.focus());
  };

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="STRATA home" className="opacity-90 transition-opacity hover:opacity-100">
          <Wordmark />
        </Link>
        <ModeSwitch compact />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[8vh] pt-6 sm:pb-[12vh]">
        <div className="animate-fade-up flex w-full max-w-[640px] flex-col items-center text-center">
          <LogoMark size={64} />
          <h1 className="mt-5">
            <span className="text-fg sm:hidden">
              <WordmarkText height={30} />
            </span>
            <span className="hidden text-fg sm:inline">
              <WordmarkText height={38} />
            </span>
          </h1>
          <p className="mt-3 text-[15px] text-muted sm:text-[16px]">Explore everything on Solana</p>

          <LiteSearchInput ref={search} ask={ask} onAskChange={setAsk} className="mt-8" />

          <nav aria-label="Categories" className="mt-5 flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[13.5px] text-muted sm:gap-x-1">
            {LITE_CATEGORIES.map((c, i) => (
              <span key={c.label} className="flex items-center">
                {i > 0 && <span className="hidden px-1 text-faint sm:inline" aria-hidden>·</span>}
                <Link href={c.href} className="rounded-md px-1 py-0.5 transition-colors hover:text-fg">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>

          <div className="mt-7 flex items-center gap-2">
            <Link href="/discover" className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-medium text-fg shadow-[var(--shadow)] transition-colors hover:border-line-strong">
              <Compass size={14} className="text-muted" /> Explore Solana
            </Link>
            <button onClick={askStrata} className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-medium text-fg shadow-[var(--shadow)] transition-colors hover:border-line-strong">
              <Sparkles size={14} className="text-sol-green" /> Ask STRATA
            </button>
          </div>
        </div>
      </div>

      <section aria-label="Explore Solana" className="border-t border-line px-4 py-6">
        <div className="mx-auto flex max-w-[640px] flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
          <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint">Explore Solana</span>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px]">
            {EXPLORE.map((e) => (
              <Link key={e.label} href={e.href} className="text-muted transition-colors hover:text-fg">
                {e.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </div>
  );
}
