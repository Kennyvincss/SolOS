import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { AiEvent, ChatTurn } from "./protocol";
import { runTool, TOOL_DEFS, TOOL_LABELS, TOOL_SCHEMAS, type AiSource, type ToolContext, type ToolName } from "./tools";

const SYSTEM_PROMPT = `You are Solana AI, the assistant built into Solana OS — the front door to the Solana ecosystem.

You help people search, understand and use Solana: tokens, wallets, transactions, apps, DeFi, RWAs, payments, prediction markets, news and security.

How to answer:
- Use tools to fetch real data before stating facts about prices, balances, transactions, TVL, yields, markets or news. Never make up numbers, addresses or events.
- Keep answers clear and compact. Lead with the direct answer, then the key numbers, then context. Use short markdown sections and bullet lists; use bold sparingly.
- Link to the underlying Solana OS pages the tools return (e.g. [JUP](/tokens/<mint>), [wallet](/wallets/<address>), [transaction](/tx/<sig>), [Jupiter](/apps/jupiter)) so the user can verify.
- Rich cards for tool results are rendered automatically below your text, so don't repeat long tables of the same numbers; summarise and interpret.

Separate three kinds of statements, and label them when mixing them in one answer:
- **Verified data** — values returned by a tool (say where from, e.g. "on-chain", "Jupiter", "DefiLlama").
- **Analysis** — your interpretation of that data. Mark it as analysis.
- **Uncertain** — anything you cannot verify with the tools. Say so plainly.

If a tool result has "dataMode": "demo", tell the user the figures are demo placeholders, not real market data.

Financial topics: you provide information, not financial advice. Do not tell users to buy or sell, do not predict prices, and never express certainty about future outcomes. When discussing risk, use the security tool's indicators and explain them; never call a token, app or transaction "safe".

Explaining to beginners: avoid jargon or define it in one short clause.

Privacy: only discuss publicly available on-chain data. Do not speculate about the real-world identity behind a wallet.

When the user refers to "my wallet", "my portfolio" or similar, call wallet tools with address "me". If no wallet is connected the tool will say so; then ask them to connect a wallet or paste an address.`;

function tools(): Anthropic.Beta.BetaTool[] {
  return TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
    eager_input_streaming: true,
  }));
}

export async function* claudeChat(history: ChatTurn[], ctx: ToolContext, signal?: AbortSignal): AsyncGenerator<AiEvent> {
  const client = new Anthropic({ apiKey: config.anthropicKey });
  yield { type: "meta", engine: "claude", model: config.aiModel };

  const today = new Date().toISOString().slice(0, 10);
  const context = `Current date: ${today}. Connected wallet: ${ctx.wallet ?? "none"}.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const allSources: AiSource[] = [];
  let jsonRetries = 0;
  let wroteText = false;

  for (let step = 0; step < 8; step++) {
    const stream = client.beta.messages.stream(
      {
        model: config.aiModel,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: (process.env.SOLANA_AI_EFFORT as "low" | "medium" | "high" | undefined) ?? "medium" },
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: context },
        ],
        tools: tools(),
        messages,
      },
      { signal },
    );

    let message: Anthropic.Beta.BetaMessage;
    let firstInStep = true;
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          // Separate text written before and after tool calls into paragraphs.
          const sep = firstInStep && wroteText ? "\n\n" : "";
          firstInStep = false;
          wroteText = true;
          yield { type: "text", delta: sep + event.delta.text };
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only a tool-input JSON parse failure is retried; API errors propagate.
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      yield { type: "text", delta: "\n\nI can't help with that request." };
      break;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!toolUses.length) break;
    if (message.stop_reason === "max_tokens") {
      yield { type: "text", delta: "\n\n_(Response was cut off.)_" };
      break;
    }

    messages.push({ role: "assistant", content: message.content });
    for (const t of toolUses) yield { type: "tool", id: t.id, name: t.name, label: TOOL_LABELS[t.name as ToolName] ?? t.name, status: "running" };

    const results = await Promise.all(
      toolUses.map(async (t) => {
        if (!(t.name in TOOL_SCHEMAS)) return { t, error: `Unknown tool ${t.name}` };
        const parsed = TOOL_SCHEMAS[t.name as ToolName].safeParse(t.input);
        if (!parsed.success) return { t, error: JSON.stringify({ INVALID_JSON: JSON.stringify(t.input) }) };
        try {
          return { t, out: await runTool(t.name as ToolName, parsed.data, ctx) };
        } catch (e) {
          return { t, error: e instanceof Error ? e.message : "Tool failed" };
        }
      }),
    );

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const r of results) {
      if ("out" in r && r.out) {
        yield { type: "tool", id: r.t.id, name: r.t.name, label: TOOL_LABELS[r.t.name as ToolName], status: "done" };
        if (r.out.card) yield { type: "card", card: r.out.card };
        allSources.push(...r.out.sources);
        toolResults.push({ type: "tool_result", tool_use_id: r.t.id, content: JSON.stringify(r.out.result) });
      } else {
        yield { type: "tool", id: r.t.id, name: r.t.name, label: TOOL_LABELS[r.t.name as ToolName] ?? r.t.name, status: "error", error: r.error };
        toolResults.push({ type: "tool_result", tool_use_id: r.t.id, is_error: true, content: r.error ?? "error" });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (allSources.length) {
    const seen = new Set<string>();
    yield { type: "sources", sources: allSources.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true))) };
  }
  yield { type: "done" };
}
