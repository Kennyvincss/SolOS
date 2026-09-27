import { z } from "zod";
import { chat, rateLimited } from "@/lib/ai/run";
import { fail, ok } from "@/lib/api";

export const maxDuration = 120;

/** Non-streaming Solana AI for extensions and widgets. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`ai:${ip}`)) return fail("Too many requests", 429);
  const parsed = z.object({ prompt: z.string().min(1).max(4000), wallet: z.string().nullish() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request");
  let text = "";
  const sources = [];
  for await (const ev of chat([{ role: "user", content: parsed.data.prompt }], { wallet: parsed.data.wallet ?? null })) {
    if (ev.type === "text") text += ev.delta;
    if (ev.type === "sources") sources.push(...ev.sources);
    if (ev.type === "error") return fail(ev.message, 502);
  }
  return ok({ text, sources });
}
