"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Sparkles, X } from "lucide-react";
import { useActions } from "@/lib/client/store";
import { asWebUrl, goHref } from "@/lib/web-url";
import { cn } from "../ui";

export type LiteSearchHandle = { focus: () => void; value: () => string };

/** Where a Lite search goes: a website, a question for Ask STRATA, or results. */
export function liteSearchHref(q: string, ask: boolean) {
  const site = asWebUrl(q);
  if (site && !ask) return goHref(site);
  return `/search?q=${encodeURIComponent(q)}${ask ? "&ask=1" : ""}`;
}

/**
 * The Lite search field. "Ask" mode sends the question to Ask STRATA
 * (an answer on top of the results) instead of a plain search.
 */
export const LiteSearchInput = forwardRef<
  LiteSearchHandle,
  { initial?: string; ask?: boolean; onAskChange?: (ask: boolean) => void; size?: "hero" | "bar" | "sm"; autoFocus?: boolean; className?: string }
>(function LiteSearchInput({ initial = "", ask = false, onAskChange, size = "hero", autoFocus, className }, ref) {
  const [q, setQ] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { pushRecentSearch } = useActions();
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus(), value: () => q }), [q]);
  const submit = () => {
    const t = q.trim();
    if (!t) return input.current?.focus();
    pushRecentSearch(t);
    router.push(liteSearchHref(t, ask));
  };
  const hero = size === "hero";
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "group flex w-full items-center rounded-full border bg-surface transition-[border-color,box-shadow]",
        ask ? "border-[color-mix(in_srgb,var(--green)_45%,var(--border))]" : "border-line-strong",
        hero
          ? "h-14 pl-5 pr-2 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_12px_40px_-18px_rgba(16,24,40,0.22)] focus-within:shadow-[0_0_0_4px_var(--ring),0_12px_40px_-18px_rgba(16,24,40,0.25)] sm:h-[60px]"
          : size === "bar"
            ? "h-12 pl-4 pr-1.5 shadow-[var(--shadow)] focus-within:shadow-[0_0_0_3px_var(--ring)]"
            : "h-9 pl-3 pr-1 focus-within:shadow-[0_0_0_3px_var(--ring)]",
        className,
      )}
    >
      {ask ? <Sparkles size={hero ? 19 : 16} className="shrink-0 text-sol-green" /> : <Search size={hero ? 19 : size === "sm" ? 15 : 17} className="shrink-0 text-muted" />}
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && ask) onAskChange?.(false);
        }}
        autoFocus={autoFocus}
        enterKeyHint="search"
        placeholder={ask ? "Ask STRATA anything about Solana…" : "Search Solana..."}
        aria-label={ask ? "Ask STRATA" : "Search Solana"}
        className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint", hero ? "px-3 text-[16px] sm:text-[17px]" : size === "bar" ? "px-3 text-[15px]" : "px-2 text-[13.5px]")}
      />
      {ask && size !== "sm" && (
        <button type="button" onClick={() => onAskChange?.(false)} className="mr-1 flex h-7 items-center gap-1 rounded-full bg-sol-green/10 pl-2.5 pr-1.5 text-[12px] font-medium text-sol-green" title="Back to search">
          Ask <X size={12} />
        </button>
      )}
      {q && size !== "sm" && (
        <button type="submit" className={cn("grid shrink-0 place-items-center rounded-full bg-fg text-bg transition-opacity hover:opacity-90", hero ? "h-10 w-10 sm:h-11 sm:w-11" : "h-9 w-9")} aria-label={ask ? "Ask" : "Search"}>
          <ArrowRight size={17} />
        </button>
      )}
    </form>
  );
});
