import "server-only";
import { config } from "../config";
import { GroqError, groqChat, isModelError, isRateLimit } from "./groq";
import { offlineChat } from "./offline";
import type { AiEvent, ChatTurn } from "./protocol";
import type { ToolContext } from "./tools";

/** Turn a Groq failure into a message people can act on (never raw API JSON). */
export function friendlyError(err: unknown): string {
  // Details (status, model, key problems) go to the server log only.
  if (err instanceof GroqError) {
    console.error("[solana-ai] Groq error:", err.status, err.message);
    if (err.status === 429) return "STRATA AI is busy right now. Please try again in a minute.";
    if (err.status === 413) return "That question is too long. Try a shorter one.";
  }
  return "STRATA AI is temporarily unavailable. Please try again in a moment.";
}

/** STRATA AI entry point: Groq when GROQ_API_KEY is set, otherwise the no-key offline mode. */
export async function* chat(history: ChatTurn[], ctx: ToolContext, signal?: AbortSignal): AsyncGenerator<AiEvent> {
  if (!config.groqKey) {
    yield* offlineChat(history, ctx);
    return;
  }
  let answered = false;
  try {
    for await (const ev of groqChat(history, ctx, signal)) {
      if (ev.type === "text" || ev.type === "card") answered = true;
      yield ev;
    }
  } catch (err) {
    if (signal?.aborted) return;
    // Every Groq model is rate limited right now: answer from the data tools
    // instead of failing, unless part of an answer was already shown.
    if (isRateLimit(err) && !answered) {
      console.warn("[solana-ai] Groq rate limited; answering in offline mode");
      yield* offlineChat(history, ctx, "busy");
      return;
    }
    console.error("[solana-ai]", err);
    yield { type: "error", message: friendlyError(err) };
    yield { type: "done" };
  }
}

/** Best-effort per-instance rate limit to protect the Groq quota. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}
