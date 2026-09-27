"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { useActions } from "@/lib/client/store";
import { cn } from "./ui";

export const SUGGESTIONS = [
  "What's trending on Solana?",
  "Show me new Solana apps",
  "What are whales buying?",
  "Analyze this wallet",
  "What can I do with my USDC?",
  "What's happening on Solana today?",
];

export function SearchBox({ initial = "", size = "lg", autoFocus, className }: { initial?: string; size?: "lg" | "md"; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  const { pushRecentSearch } = useActions();
  const submit = (value: string) => {
    const t = value.trim();
    if (!t) return;
    pushRecentSearch(t);
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(q);
      }}
      className={cn(
        "group relative flex items-center rounded-full border border-line-strong bg-surface shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_20px_60px_-30px_rgba(0,0,0,0.6)] transition-colors focus-within:border-[color-mix(in_srgb,var(--green)_45%,var(--border-strong))]",
        size === "lg" ? "h-[60px] pl-5 pr-2 sm:h-16" : "h-12 pl-4 pr-1.5",
        className,
      )}
      role="search"
    >
      <Search size={size === "lg" ? 20 : 17} className="shrink-0 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search anything on Solana…"
        aria-label="Search anything on Solana"
        className={cn("min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-faint", size === "lg" ? "text-[16px] sm:text-[17px]" : "text-[15px]")}
      />
      <button
        type="button"
        onClick={() => q.trim() && router.push(`/ai?q=${encodeURIComponent(q.trim())}`)}
        className="mr-1 hidden h-10 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:flex"
        title="Ask Solana AI"
      >
        <Sparkles size={15} className="text-sol-green" /> Ask AI
      </button>
      <button type="submit" className={cn("grid shrink-0 place-items-center rounded-full bg-fg text-bg transition-opacity hover:opacity-90", size === "lg" ? "h-11 w-11 sm:h-12 sm:w-12" : "h-9 w-9")} aria-label="Search">
        <ArrowRight size={18} />
      </button>
    </form>
  );
}

export function SuggestionChips({ onPick }: { onPick?: (s: string) => void }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => {
            if (onPick) return onPick(s);
            if (s === "Analyze this wallet") return router.push("/wallets");
            router.push(`/search?q=${encodeURIComponent(s)}`);
          }}
          className="chip h-8 bg-surface/60 text-[13px]"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
