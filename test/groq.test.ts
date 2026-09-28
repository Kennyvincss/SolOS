import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiEvent } from "@/lib/ai/protocol";

vi.mock("@/lib/config", () => ({
  config: { groqKey: "gsk_test", groqModel: "test-model", groqApiUrl: "https://groq.test/openai/v1" },
}));
const runTool = vi.fn();
vi.mock("@/lib/ai/tools", async () => {
  const { z } = await import("zod");
  return {
    runTool: (...a: unknown[]) => runTool(...a),
    TOOL_DEFS: [{ name: "get_token", description: "token", input_schema: { type: "object", properties: { token: { type: "string" } } } }],
    TOOL_LABELS: { get_token: "Fetching token data" },
    TOOL_SCHEMAS: { get_token: z.object({ token: z.string() }) },
  };
});

const { groqChat, GroqError, parseRetryAfter } = await import("@/lib/ai/groq");

function sse(chunks: unknown[]) {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); } }), { status: 200 });
}

async function collect(gen: AsyncGenerator<AiEvent>) {
  const out: AiEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe("groqChat", () => {
  it("streams tool calls split across chunks, runs the tool, then streams the answer", async () => {
    const bodies: unknown[] = [];
    const responses = [
      sse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_token", arguments: '{"tok' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'en":"JUP"}' } }] }, finish_reason: "tool_calls" }] },
      ]),
      sse([{ choices: [{ delta: { content: "JUP is " } }] }, { choices: [{ delta: { content: "$0.80." }, finish_reason: "stop" }] }]),
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => (bodies.push(JSON.parse(String(init.body))), responses.shift()!)));
    runTool.mockResolvedValue({ result: { priceUsd: 0.8 }, sources: [{ label: "JUP", href: "/tokens/jup", provider: "Jupiter", mode: "live" }] });

    const events = await collect(groqChat([{ role: "user", content: "price of JUP?" }], {}));

    expect(runTool).toHaveBeenCalledWith("get_token", { token: "JUP" }, {});
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toBe("JUP is $0.80.");
    expect(events.find((e) => e.type === "meta")).toMatchObject({ engine: "groq", model: "test-model" });
    expect(events.some((e) => e.type === "sources")).toBe(true);
    // The second request carries the assistant tool call and the tool result.
    const second = bodies[1] as { messages: { role: string; tool_call_id?: string }[]; tools: unknown[] };
    expect(second.messages.at(-2)).toMatchObject({ role: "assistant" });
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(second.tools).toHaveLength(1);
  });

  it("throws a GroqError with the HTTP status so the caller can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })));
    await expect(collect(groqChat([{ role: "user", content: "hi" }], {}))).rejects.toMatchObject({ status: 401 });
    expect(GroqError).toBeDefined();
  });
});

describe("friendlyError", () => {
  it("maps Groq failures to readable messages", async () => {
    const { friendlyError } = await import("@/lib/ai/run");
    expect(friendlyError(new GroqError(401, "Groq 401: Invalid API Key"))).toMatch(/rejected the API key/);
    expect(friendlyError(new GroqError(429, "Groq 429: Rate limit reached"))).toMatch(/rate limit/);
    expect(friendlyError(new GroqError(404, "Groq 404: The model `x` does not exist or you do not have access to it."))).toMatch(/GROQ_MODEL/);
    expect(friendlyError(new GroqError(400, "Groq 400: The model `llama-3.3-70b-versatile` has been decommissioned"))).toMatch(/decommissioned/);
    expect(friendlyError(new GroqError(400, "Groq 400: tool_use_failed"))).toMatch(/Groq 400: tool_use_failed/);
    expect(friendlyError(new Error("boom"))).toMatch(/temporarily unavailable/);
  });
});

describe("model selection", () => {
  it("prefers known tool-calling models and skips non-chat models", async () => {
    const { pickModel } = await import("@/lib/ai/groq");
    expect(pickModel(["whisper-large-v3", "llama-3.1-8b-instant", "openai/gpt-oss-120b"])).toBe("openai/gpt-oss-120b");
    expect(pickModel(["whisper-large-v3", "meta-llama/llama-guard-4-12b", "some-new/model-2027"])).toBe("some-new/model-2027");
    expect(pickModel(["whisper-large-v3"])).toBeNull();
  });

  it("auto-discovers the model when GROQ_MODEL is unset", async () => {
    const { config } = await import("@/lib/config");
    const saved = config.groqModel;
    (config as { groqModel?: string }).groqModel = undefined;
    try {
      const calls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          calls.push(url);
          if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "whisper-large-v3" }, { id: "qwen/qwen3-32b", active: true }] }));
          expect(JSON.parse(String(init?.body)).model).toBe("qwen/qwen3-32b");
          return sse([{ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] }]);
        }),
      );
      const events = await collect(groqChat([{ role: "user", content: "hello" }], {}));
      expect(events.find((e) => e.type === "meta")).toMatchObject({ model: "qwen/qwen3-32b" });
      expect(calls[0]).toMatch(/\/models$/);
    } finally {
      (config as { groqModel?: string }).groqModel = saved;
    }
  });

  it("switches to another model when the first one is rate limited", async () => {
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "test-model" }, { id: "llama-3.3-70b-versatile" }, { id: "whisper-large-v3" }] }));
        const model = JSON.parse(String(init?.body)).model as string;
        models.push(model);
        if (model === "test-model") return new Response(JSON.stringify({ error: { message: "Rate limit reached for model test-model. Please try again in 42.5s." } }), { status: 429 });
        return sse([{ choices: [{ delta: { content: "Hello" }, finish_reason: "stop" }] }]);
      }),
    );
    const events = await collect(groqChat([{ role: "user", content: "hi" }], {}));
    expect(models[0]).toBe("test-model");
    expect(models).toHaveLength(2);
    expect(models[1]).not.toBe("test-model");
    expect(events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toBe("Hello");
  });
});

describe("parseRetryAfter", () => {
  it("reads Groq's wait hints", () => {
    expect(parseRetryAfter("3", "")).toBe(3000);
    expect(parseRetryAfter(null, "Please try again in 1m2.5s.")).toBe(62500);
    expect(parseRetryAfter(null, "Please try again in 850ms.")).toBe(850);
    expect(parseRetryAfter(null, "no hint")).toBeUndefined();
  });
});
