import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import type { AiEvent } from "@/lib/ai/protocol";

const claudeImpl = vi.fn();

vi.mock("@/lib/config", () => ({ config: { anthropicKey: "sk-ant-test" } }));
vi.mock("@/lib/ai/claude", () => ({ claudeChat: (...args: unknown[]) => claudeImpl(...args) }));
vi.mock("@/lib/ai/offline", () => ({
  async *offlineChat(): AsyncGenerator<AiEvent> {
    yield { type: "meta", engine: "offline" };
    yield { type: "text", delta: "offline answer" };
    yield { type: "done" };
  },
}));

const { chat } = await import("@/lib/ai/run");
const { claudeAvailable, resetClaudeAvailability, accountProblem } = await import("@/lib/ai/availability");

async function collect(gen: AsyncGenerator<AiEvent>) {
  const out: AiEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function failingClaude(err: Error) {
  return async function* (): AsyncGenerator<AiEvent> {
    yield { type: "meta", engine: "claude" };
    throw err;
  };
}

const q = [{ role: "user" as const, content: "What's trending?" }];

describe("Solana AI fallback", () => {
  beforeEach(() => {
    resetClaudeAvailability();
    claudeImpl.mockReset();
  });

  it("falls back to offline mode on an invalid API key", async () => {
    claudeImpl.mockImplementation(failingClaude(new Anthropic.AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers())));
    const events = await collect(chat(q, {}));
    expect(events.some((e) => e.type === "text" && e.delta === "offline answer")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(claudeAvailable()).toBe(false);
  });

  it("falls back when the account is out of credits and skips Claude afterwards", async () => {
    claudeImpl.mockImplementation(
      failingClaude(new Anthropic.BadRequestError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } },
        undefined,
        new Headers(),
      )),
    );
    await collect(chat(q, {}));
    expect(claudeAvailable()).toBe(false);
    claudeImpl.mockClear();
    const second = await collect(chat(q, {}));
    expect(claudeImpl).not.toHaveBeenCalled();
    expect(second.some((e) => e.type === "text" && e.delta === "offline answer")).toBe(true);
  });

  it("shows a friendly error, not raw JSON, for transient failures", async () => {
    claudeImpl.mockImplementation(failingClaude(new Anthropic.InternalServerError(500, { type: "error" }, '{"type":"error","error":{"type":"api_error"}}', new Headers())));
    const events = await collect(chat(q, {}));
    const err = events.find((e) => e.type === "error");
    expect(err && err.type === "error" && err.message).toBe("Solana AI is temporarily unavailable. Please try again in a moment.");
    expect(claudeAvailable()).toBe(true);
  });

  it("classifies account problems", () => {
    expect(accountProblem({ status: 401 })).toBe("invalid API key");
    expect(accountProblem(Object.assign(new Error("Your credit balance is too low"), { status: 400 }))).toBe("out of API credits");
    expect(accountProblem(Object.assign(new Error("max_tokens too large"), { status: 400 }))).toBeNull();
    expect(accountProblem({ status: 429 })).toBeNull();
  });
});
