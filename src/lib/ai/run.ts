import "server-only";
import { config } from "../config";
import { claudeChat } from "./claude";
import { offlineChat } from "./offline";
import type { AiEvent, ChatTurn } from "./protocol";
import type { ToolContext } from "./tools";

export function chat(history: ChatTurn[], ctx: ToolContext, signal?: AbortSignal): AsyncGenerator<AiEvent> {
  return config.anthropicKey ? claudeChat(history, ctx, signal) : offlineChat(history, ctx);
}

/** Best-effort per-instance rate limit to protect the model budget. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}
