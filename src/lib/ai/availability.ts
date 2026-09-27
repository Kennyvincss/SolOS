/**
 * Tracks whether Claude is usable on this server instance. When the API key is
 * rejected or the account is out of credits, Solana AI switches to offline mode
 * for a cooldown period instead of failing every request.
 */

const COOLDOWN_MS = 5 * 60_000;

let unavailableUntil = 0;
let lastReason: string | undefined;

export function markClaudeUnavailable(reason: string) {
  unavailableUntil = Date.now() + COOLDOWN_MS;
  lastReason = reason;
}

export function claudeAvailable(): boolean {
  return Date.now() >= unavailableUntil;
}

export function claudeUnavailableReason(): string | undefined {
  return claudeAvailable() ? undefined : lastReason;
}

/** Reset state (tests). */
export function resetClaudeAvailability() {
  unavailableUntil = 0;
  lastReason = undefined;
}

/**
 * Account-level failures that retrying won't fix: invalid/revoked key (401),
 * no permission (403), billing problems (402, or 400 "credit balance is too low").
 */
export function accountProblem(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const status = (err as { status?: unknown }).status;
  const body = (err as { error?: { error?: { message?: unknown } } }).error;
  const message = `${err instanceof Error ? err.message : ""} ${typeof body?.error?.message === "string" ? body.error.message : ""}`;
  if (status === 401) return "invalid API key";
  if (status === 403) return "API key lacks permission";
  if (status === 402) return "billing problem";
  if (status === 400 && /credit balance|billing|plans? & billing/i.test(message)) return "out of API credits";
  return null;
}
