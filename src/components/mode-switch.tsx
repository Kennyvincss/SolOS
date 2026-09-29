"use client";

import { useMode, type Mode } from "@/lib/client/mode";
import { switchModeAnimated } from "./mode-transition";
import { cn } from "./ui";

/** Lite / Pro switch, shown in both modes. Switching plays the mode transition and opens that mode's home. */
export function ModeSwitch({ compact, className }: { compact?: boolean; className?: string }) {
  const mode = useMode();
  const pick = (m: Mode) => {
    if (m !== mode) switchModeAnimated(m);
  };
  return (
    <div role="radiogroup" aria-label="Interface mode" className={cn("inline-flex shrink-0 items-center rounded-full border border-line bg-surface p-[3px] shadow-[var(--shadow)]", className)}>
      {(["lite", "pro"] as const).map((m) => {
        const on = m === mode;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={on}
            onClick={() => pick(m)}
            title={m === "lite" ? "Lite: search and discover" : "Pro: the full STRATA dashboard"}
            className={cn(
              "flex items-center gap-1.5 rounded-full font-medium transition-colors",
              compact ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
              on ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            <span className={cn("grid h-3 w-3 place-items-center rounded-full border-[1.5px]", on ? "border-fg" : "border-faint")}>{on && <span className="h-1.5 w-1.5 rounded-full bg-fg" />}</span>
            {m === "lite" ? "Lite" : "Pro"}
          </button>
        );
      })}
    </div>
  );
}
