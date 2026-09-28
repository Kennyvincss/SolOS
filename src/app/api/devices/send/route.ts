import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { fail, handle, ok } from "@/lib/api";
import { syncConfigured } from "@/lib/sync-store";
import { sendToDevice } from "@/lib/services/devices";
import { rateLimited } from "@/lib/ai/run";

const Body = z.object({
  to: z.string().min(8).max(64),
  from: z.string().min(8).max(64),
  url: z.string().url().max(2000).refine((u) => /^https?:/.test(u), "Only web pages can be sent"),
  title: z.string().max(200).default(""),
});

/** Send a tab to another of your devices. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!syncConfigured()) return fail("Sending tabs isn't available right now.", 501);
    const s = await getSession();
    if (!s) return fail("Sign in to send tabs to your devices", 401);
    if (rateLimited(`send:${s.uid}`, 30, 60_000)) return fail("Too many tabs sent. Wait a minute.", 429);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid tab");
    const sent = await sendToDevice(s.uid, parsed.data.to, { url: parsed.data.url, title: parsed.data.title, fromId: parsed.data.from });
    return sent ? ok({ ok: true }) : fail("That device isn't on your account", 404);
  });
}
