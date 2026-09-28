import { getSession } from "@/lib/auth/session";
import { fail, handle, ok } from "@/lib/api";
import { syncConfigured } from "@/lib/sync-store";
import { takeInbox, touchDevice } from "@/lib/services/devices";

/** Tabs sent to this device (each is delivered once). */
export async function GET(req: Request) {
  return handle(async () => {
    if (!syncConfigured()) return ok({ items: [] });
    const s = await getSession();
    if (!s) return fail("Sign in", 401);
    const device = new URL(req.url).searchParams.get("device");
    if (!device || !/^[\w-]{8,64}$/.test(device)) return fail("Missing device");
    await touchDevice(s.uid, device).catch(() => {});
    return ok({ items: await takeInbox(s.uid, device) });
  });
}
