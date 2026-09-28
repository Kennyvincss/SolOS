"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatPanel, desktopPanelBridge, webPageContext } from "./chat-panel";
import { cn } from "../ui";

const EVENT = "strata:ai-panel";

/**
 * Open STRATA AI next to the current page. In the desktop app this is the
 * browser's own side panel; on the website it's a slide-over panel.
 */
export function openAiPanel(prompt?: string) {
  const bridge = desktopPanelBridge();
  if (bridge) {
    bridge.panel("open", prompt ?? null);
    return;
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { prompt: prompt ?? null, toggle: prompt === undefined } }));
}

/** The website's slide-over STRATA AI panel (not used inside the desktop app). */
export function AiSidePanel() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const path = usePathname();
  const getContext = useCallback(async () => webPageContext(), []);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ prompt: string | null; toggle: boolean }>).detail;
      if (d?.prompt) {
        setPrompt(d.prompt);
        setKey((k) => k + 1);
        setOpen(true);
      } else setOpen((o) => (d?.toggle ? !o : true));
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j" && !desktopPanelBridge()) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(EVENT, on);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // The /ai page is already a full chat.
  useEffect(() => {
    if (path.startsWith("/ai")) setOpen(false);
  }, [path]);

  useEffect(() => {
    document.documentElement.classList.toggle("ai-panel-open", open);
  }, [open]);

  return (
    <aside
      aria-label="STRATA AI"
      aria-hidden={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-50 w-full max-w-[420px] border-l border-line bg-bg transition-[transform,visibility] duration-200 ease-out",
        open ? "visible translate-x-0 shadow-[var(--shadow-pop)]" : "pointer-events-none invisible translate-x-full",
      )}
    >
      {open && <ChatPanel key={key} variant="panel" getContext={getContext} onClose={() => setOpen(false)} initialPrompt={prompt} />}
    </aside>
  );
}
