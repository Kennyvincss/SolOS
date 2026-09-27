import "server-only";
import { config } from "../config";
import type { AiEvent, ChatTurn } from "./protocol";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOL_DEFS, TOOL_LABELS, TOOL_SCHEMAS, type AiSource, type ToolContext, type ToolName } from "./tools";

/**
 * Groq provider (https://console.groq.com). Groq serves open models through an
 * OpenAI-compatible Chat Completions API with streaming and tool calling.
 * Docs: https://console.groq.com/docs/tool-use
 */

export class GroqError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GroqError";
  }
}

export function isModelError(e: GroqError) {
  return (e.status === 404 || e.status === 400) && /model/i.test(e.message) && /(not found|does not exist|decommissioned|deprecated|not supported|no chat model)/i.test(e.message);
}

type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface Delta {
  content?: string | null;
  tool_calls?: { index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[];
}

/**
 * Preferred tool-calling models, best first. Groq retires models over time, so
 * when GROQ_MODEL isn't set we ask the API which models this key can use and
 * take the first match.
 */
export const PREFERRED_MODELS = [
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct-0905",
  "moonshotai/kimi-k2-instruct",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3-32b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.1-8b-instant",
];
const NOT_CHAT = /whisper|tts|playai|guard|prompt-guard|orpheus|distil|compound|allam/i;

let discovered: { model: string; at: number } | null = null;

/** Pick a chat model from the list the API returns (exported for tests). */
export function pickModel(available: string[]): string | null {
  for (const m of PREFERRED_MODELS) if (available.includes(m)) return m;
  return available.find((m) => !NOT_CHAT.test(m)) ?? null;
}

export async function resolveModel(forceRefresh = false): Promise<string> {
  if (config.groqModel) return config.groqModel;
  if (discovered && !forceRefresh && Date.now() - discovered.at < 60 * 60_000) return discovered.model;
  const res = await fetch(`${config.groqApiUrl}/models`, { headers: { authorization: `Bearer ${config.groqKey}` } });
  if (!res.ok) throw new GroqError(res.status, `Groq ${res.status}: could not list models`);
  const body = (await res.json()) as { data?: { id: string; active?: boolean }[] };
  const ids = (body.data ?? []).filter((m) => m.active !== false).map((m) => m.id);
  const model = pickModel(ids);
  if (!model) throw new GroqError(404, "Groq 404: no chat model is available for this API key");
  discovered = { model, at: Date.now() };
  return model;
}

/** Free tiers have small tokens-per-minute budgets, so tool results are capped. */
const MAX_TOOL_RESULT_CHARS = 6000;

const tools = TOOL_DEFS.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));

async function* streamCompletion(model: string, messages: Msg[], signal?: AbortSignal): AsyncGenerator<{ delta: Delta; finish?: string | null }> {
  const res = await fetch(`${config.groqApiUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.groqKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      stream: true,
      temperature: 0.3,
      max_completion_tokens: 2048,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
    } catch {
      /* not JSON */
    }
    throw new GroqError(res.status, `Groq ${res.status}: ${message.slice(0, 300)}`);
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
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let chunk: { choices?: { delta?: Delta; finish_reason?: string | null }[]; error?: { message?: string } };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new GroqError(500, `Groq stream error: ${chunk.error.message ?? "unknown"}`);
      const choice = chunk.choices?.[0];
      if (choice) yield { delta: choice.delta ?? {}, finish: choice.finish_reason };
    }
  }
}

export async function* groqChat(history: ChatTurn[], ctx: ToolContext, signal?: AbortSignal): AsyncGenerator<AiEvent> {
  let model = await resolveModel();
  yield { type: "meta", engine: "groq", model };
  const today = new Date().toISOString().slice(0, 10);
  const messages: Msg[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\nCurrent date: ${today}. Connected wallet: ${ctx.wallet ?? "none"}.` },
    ...history.map((m) => ({ role: m.role, content: m.content }) as Msg),
  ];
  const allSources: AiSource[] = [];
  let wroteText = false;

  for (let step = 0; step < 6; step++) {
    let text = "";
    let firstInStep = true;
    const calls: ToolCall[] = [];
    let finish: string | null | undefined;

    let stream = streamCompletion(model, messages, signal);
    // If an auto-picked model was retired since discovery, re-discover once.
    if (!config.groqModel) {
      const first = await stream.next().catch(async (e) => {
        if (!(e instanceof GroqError) || !isModelError(e)) throw e;
        model = await resolveModel(true);
        stream = streamCompletion(model, messages, signal);
        return stream.next();
      });
      stream = (async function* (head, rest) {
        if (!head.done) yield head.value;
        yield* rest;
      })(first, stream);
    }
    for await (const { delta, finish: f } of stream) {
      if (f) finish = f;
      if (delta.content) {
        const sep = firstInStep && wroteText ? "\n\n" : "";
        firstInStep = false;
        wroteText = true;
        text += delta.content;
        yield { type: "text", delta: sep + delta.content };
      }
      for (const tc of delta.tool_calls ?? []) {
        const cur = (calls[tc.index] ??= { id: tc.id ?? `call_${step}_${tc.index}`, type: "function", function: { name: "", arguments: "" } });
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.function.name += tc.function.name;
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
      }
    }

    const toolCalls = calls.filter(Boolean);
    if (!toolCalls.length) break;
    if (finish === "length") {
      yield { type: "text", delta: "\n\n_(Response was cut off.)_" };
      break;
    }

    messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
    for (const t of toolCalls) yield { type: "tool", id: t.id, name: t.function.name, label: TOOL_LABELS[t.function.name as ToolName] ?? t.function.name, status: "running" };

    const results = await Promise.all(
      toolCalls.map(async (t) => {
        const name = t.function.name as ToolName;
        if (!(name in TOOL_SCHEMAS)) return { t, error: `Unknown tool ${t.function.name}` };
        let args: unknown;
        try {
          args = t.function.arguments.trim() ? JSON.parse(t.function.arguments) : {};
        } catch {
          return { t, error: `Arguments were not valid JSON: ${t.function.arguments.slice(0, 200)}` };
        }
        const parsed = TOOL_SCHEMAS[name].safeParse(args);
        if (!parsed.success) return { t, error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
        try {
          return { t, out: await runTool(name, parsed.data, ctx) };
        } catch (e) {
          return { t, error: e instanceof Error ? e.message : "Tool failed" };
        }
      }),
    );

    for (const r of results) {
      const name = r.t.function.name;
      if ("out" in r && r.out) {
        yield { type: "tool", id: r.t.id, name, label: TOOL_LABELS[name as ToolName], status: "done" };
        if (r.out.card) yield { type: "card", card: r.out.card };
        allSources.push(...r.out.sources);
        messages.push({ role: "tool", tool_call_id: r.t.id, content: JSON.stringify(r.out.result).slice(0, MAX_TOOL_RESULT_CHARS) });
      } else {
        yield { type: "tool", id: r.t.id, name, label: TOOL_LABELS[name as ToolName] ?? name, status: "error", error: r.error };
        messages.push({ role: "tool", tool_call_id: r.t.id, content: JSON.stringify({ error: r.error }) });
      }
    }
  }

  if (allSources.length) {
    const seen = new Set<string>();
    yield { type: "sources", sources: allSources.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true))) };
  }
  yield { type: "done" };
}
