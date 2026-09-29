"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setMode, type Mode } from "@/lib/client/mode";
import { WordmarkText } from "./shell/logo";

const EVENT = "strata:mode-transition";
const TOTAL_MS = 3000;
const SWITCH_AT_MS = 1300;

/** Ask for an animated switch to a mode (handled by <ModeTransition />). */
export function switchModeAnimated(to: Mode) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { to } }));
}

/**
 * The 3-second Lite ⇄ Pro transition: STRATA's glass layers build up (Pro) or
 * settle into one (Lite) while the mode switches underneath. Click or Escape skips.
 */
export function ModeTransition() {
  const router = useRouter();
  const [to, setTo] = useState<Mode | null>(null);
  const timers = useRef<number[]>([]);
  const switched = useRef(false);

  useEffect(() => {
    const doSwitch = (m: Mode) => {
      if (switched.current) return;
      switched.current = true;
      setMode(m);
      router.push("/");
      window.scrollTo({ top: 0 });
    };
    const finish = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      document.documentElement.style.overflow = "";
      setTo(null);
    };
    const onSwitch = (e: Event) => {
      const m = (e as CustomEvent<{ to: Mode }>).detail.to;
      if (timers.current.length) return; // already animating
      switched.current = false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return doSwitch(m);
      setTo(m);
      document.documentElement.style.overflow = "hidden";
      timers.current = [window.setTimeout(() => doSwitch(m), SWITCH_AT_MS), window.setTimeout(finish, TOTAL_MS)];
    };
    const skip = () => {
      if (!timers.current.length) return;
      const m = document.querySelector<HTMLElement>("[data-mode-overlay]")?.dataset.to as Mode | undefined;
      if (m) doSwitch(m);
      finish();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && skip();
    window.addEventListener(EVENT, onSwitch);
    window.addEventListener("keydown", onKey);
    window.addEventListener("strata:mode-skip", skip);
    return () => {
      window.removeEventListener(EVENT, onSwitch);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("strata:mode-skip", skip);
    };
  }, [router]);

  if (!to) return null;
  const pro = to === "pro";
  return (
    <div
      data-mode-overlay
      data-to={to}
      role="status"
      aria-live="polite"
      aria-label={pro ? "Switching to STRATA Pro" : "Switching to STRATA Lite"}
      onClick={() => window.dispatchEvent(new Event("strata:mode-skip"))}
      className="mode-overlay fixed inset-0 z-[200] grid cursor-pointer select-none place-items-center bg-bg"
    >
      <div className="mode-glow pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col items-center">
        <div className={pro ? "strata-stack strata-stack-pro" : "strata-stack strata-stack-lite"} aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="strata-layer" style={{ ["--i" as string]: i }} />
          ))}
        </div>
        <div className="mode-text mt-10 flex items-center gap-2.5 text-fg">
          <WordmarkText height={20} />
          <span className="text-[22px] font-semibold tracking-[-0.02em]">{pro ? "Pro" : "Lite"}</span>
        </div>
        <p className="mode-text mode-text-2 mt-2 text-[14px] text-muted">{pro ? "Operate on Solana" : "Discover Solana"}</p>
        <div className="mode-text mt-7 h-[3px] w-44 overflow-hidden rounded-full bg-surface-3">
          <span className="mode-progress block h-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
