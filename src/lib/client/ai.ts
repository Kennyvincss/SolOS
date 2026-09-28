"use client";

import { usePathname } from "next/navigation";
import type { AiEvent, ChatTurn, UserContext } from "@/lib/ai/protocol";
import { useStore } from "./store";
import { useAppShell, useDesktopExtensions } from "./desktop";

/** What Solana AI is told about this session: page, app, followed wallets, watchlist, extensions. */
export function useAiContext(): UserContext {
  const page = usePathname();
  const app = useAppShell();
  const followed = useStore((s) => s.followed);
  const watchlist = useStore((s) => s.watchlist);
  const watchAddress = useStore((s) => s.watchAddress);
  const desktop = useDesktopExtensions();
  return {
    page: page ?? undefined,
    app,
    followed: followed.slice(0, 25).map((f) => ({ address: f.address, label: f.label })),
    watchlist: watchlist.slice(0, 25),
    watchAddress,
    installedExtensions: desktop.installedList.map((x) => x.name).slice(0, 30),
  };
}

/** Stream Solana AI events (NDJSON) from /api/ai/chat. */
export async function streamChat(messages: ChatTurn[], wallet: string | null, onEvent: (e: AiEvent) => void, signal?: AbortSignal, context?: UserContext) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, wallet, context }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    onEvent({ type: "error", message: (body as { error?: string }).error ?? `Solana AI is unavailable (${res.status})` });
    onEvent({ type: "done" });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line) as AiEvent);
        } catch {
          /* skip malformed line */
        }
      }
    }
  }
}
