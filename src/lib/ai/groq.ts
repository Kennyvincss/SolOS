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

/** Free tiers have small tokens-per-minute budgets, so tool results are capped. */
const MAX_TOOL_RESULT_CHARS = 6000;

const tools = TOOL_DEFS.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));

async function* streamCompletion(messages: Msg[], signal?: AbortSignal): AsyncGenerator<{ delta: Delta; finish?: string | null }> {
  const res = await fetch(`${config.groqApiUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.groqKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: config.groqModel,
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
  yield { type: "meta", engine: "groq", model: config.groqModel };
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

    for await (const { delta, finish: f } of streamCompletion(messages, signal)) {
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
