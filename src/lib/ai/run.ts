import "server-only";
import { config } from "../config";
import { claudeChat } from "./claude";
import { offlineChat } from "./offline";
import { accountProblem, claudeAvailable, markClaudeUnavailable } from "./availability";
import type { AiEvent, ChatTurn } from "./protocol";
import type { ToolContext } from "./tools";

/**
 * Solana AI entry point. Uses Claude when configured and healthy; if the key is
 * invalid or the account is out of credits, answers with the offline engine
 * instead and skips Claude for a cooldown period.
 */
export async function* chat(history: ChatTurn[], ctx: ToolContext, signal?: AbortSignal): AsyncGenerator<AiEvent> {
  if (!config.anthropicKey || !claudeAvailable()) {
    yield* offlineChat(history, ctx);
    return;
  }
  let answered = false;
  try {
    for await (const ev of claudeChat(history, ctx, signal)) {
      if (ev.type !== "meta") answered = true;
      yield ev;
    }
  } catch (err) {
    const problem = accountProblem(err);
    if (problem) {
      markClaudeUnavailable(problem);
      console.warn(`[solana-ai] Claude unavailable (${problem}); falling back to offline mode`);
      if (!answered) {
        yield* offlineChat(history, ctx);
        return;
      }
      yield { type: "error", message: "Solana AI switched to offline mode. Please ask again." };
      yield { type: "done" };
      return;
    }
    if (signal?.aborted) return;
    console.error("[solana-ai]", err);
    yield { type: "error", message: "Solana AI is temporarily unavailable. Please try again in a moment." };
    yield { type: "done" };
  }
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
