"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { webPageContext } from "./page-context";
import { ChatLoading } from "./chat-loading";
import { cn } from "../ui";

// The chat UI loads the first time STRATA AI is opened.
const ChatPanel = dynamic(() => import("./chat-panel").then((m) => m.ChatPanel), { ssr: false, loading: () => <ChatLoading /> });

/**
 * STRATA AI in the bottom-right corner: a small round button that opens a
 * chat popup (like WhatsApp's AI button). The popup has its own close button.
 */
export function AiBubble() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // keep the chat once opened
  const path = usePathname();
  const getContext = useCallback(async () => webPageContext(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The /ai page is already a full chat.
  if (path.startsWith("/ai")) return null;

  return (
    <div className="ai-bubble pointer-events-none fixed bottom-5 right-4 z-[60] flex flex-col items-end gap-3 sm:right-6">
      {mounted && (
        <div
          role="dialog"
          aria-label="STRATA AI"
          aria-hidden={!open}
          className={cn(
            "pointer-events-auto flex w-[min(400px,calc(100vw-24px))] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-line bg-bg shadow-[var(--shadow-pop)] transition-[opacity,transform] duration-200",
            "h-[min(600px,calc(100dvh-140px))]",
            open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none invisible translate-y-3 scale-95 opacity-0",
          )}
        >
          <ChatPanel variant="panel" getContext={getContext} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        onClick={() => {
          setMounted(true);
          setOpen((o) => !o);
        }}
        aria-label={open ? "Close STRATA AI" : "Ask STRATA AI"}
        aria-expanded={open}
        title="Ask STRATA AI"
        className="ai-fab pointer-events-auto grid h-14 w-14 place-items-center rounded-full p-[3px] shadow-[0_8px_24px_-6px_rgba(90,80,220,0.45)] transition-transform hover:scale-105 active:scale-95"
      >
        <span className="grid h-full w-full place-items-center rounded-full bg-bg">
          <Sparkles size={22} className="ai-fab-icon" />
        </span>
      </button>
    </div>
  );
}
