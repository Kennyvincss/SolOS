import { z } from "zod";
import { chat, rateLimited } from "@/lib/ai/run";
import { fail } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import type { AiEvent } from "@/lib/ai/protocol";

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40),
  wallet: z.string().nullish(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`ai:${ip}`)) return fail("Too many requests. Please wait a minute.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid chat request");
  const { messages, wallet } = parsed.data;
  if (messages[messages.length - 1].role !== "user") return fail("Last message must be from the user");
  const ctx = { wallet: wallet && (isAddress(wallet) || wallet === "demo") ? wallet : null };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AiEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const ev of chat(messages.slice(-20), ctx, req.signal)) send(ev);
      } catch (err) {
        console.error("[ai]", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Solana AI failed" });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
