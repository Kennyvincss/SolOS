import "server-only";
import { config } from "../config";
import { GroqError, groqChat, isModelError, isRateLimit } from "./groq";
import { offlineChat } from "./offline";
import type { AiEvent, ChatTurn } from "./protocol";
import type { ToolContext } from "./tools";

/** Turn a Groq failure into a message people can act on (never raw API JSON). */
export function friendlyError(err: unknown): string {
  if (err instanceof GroqError) {
    const detail = err.message.replace(/^Groq \d+:\s*/, "").slice(0, 200);
    if (err.status === 401) return "Solana AI can't connect: Groq rejected the API key. Check GROQ_API_KEY.";
    if (err.status === 429) return "Solana AI is busy right now (Groq rate limit). Please try again in a minute.";
    if (isModelError(err)) return `Solana AI's model isn't available on Groq (${detail}). Remove GROQ_MODEL to auto-select, or set it to a model from console.groq.com/docs/models.`;
    if (err.status === 413) return "That request was too large for Solana AI. Try a shorter question.";
    return `Solana AI request failed (Groq ${err.status}: ${detail}).`;
  }
  return "Solana AI is temporarily unavailable. Please try again in a moment.";
}

/** Solana AI entry point: Groq when GROQ_API_KEY is set, otherwise the no-key offline mode. */
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
