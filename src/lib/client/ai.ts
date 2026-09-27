"use client";

import type { AiEvent, ChatTurn } from "@/lib/ai/protocol";

/** Stream Solana AI events (NDJSON) from /api/ai/chat. */
export async function streamChat(messages: ChatTurn[], wallet: string | null, onEvent: (e: AiEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, wallet }),
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
