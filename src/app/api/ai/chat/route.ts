import { z } from "zod";
import { chat, rateLimited } from "@/lib/ai/run";
import { fail } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import type { AiEvent } from "@/lib/ai/protocol";

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40),
  wallet: z.string().nullish(),
  context: z
    .object({
      page: z.string().max(300).optional(),
      app: z.enum(["web", "desktop", "mobile"]).optional(),
      followed: z.array(z.object({ address: z.string().max(64), label: z.string().max(60).optional() })).max(25).optional(),
      watchlist: z.array(z.string().max(64)).max(25).optional(),
      watchAddress: z.string().max(64).optional(),
      installedExtensions: z.array(z.string().max(80)).max(30).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`ai:${ip}`)) return fail("Too many requests. Please wait a minute.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid chat request");
  const { messages, wallet, context } = parsed.data;
  if (messages[messages.length - 1].role !== "user") return fail("Last message must be from the user");
  const user = context && {
    ...context,
    followed: context.followed?.filter((f) => isAddress(f.address)),
    watchlist: context.watchlist?.filter(isAddress),
    watchAddress: context.watchAddress && isAddress(context.watchAddress) ? context.watchAddress : undefined,
  };
  const ctx = { wallet: wallet && (isAddress(wallet) || wallet === "demo") ? wallet : null, user };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AiEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const ev of chat(messages.slice(-20), ctx, req.signal)) send(ev);
      } catch (err) {
        console.error("[ai]", err);
        send({ type: "error", message: "Solana AI is temporarily unavailable. Please try again in a moment." });
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
