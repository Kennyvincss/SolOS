import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { fail, handle, ok } from "@/lib/api";
import { syncConfigured } from "@/lib/sync-store";
import { listDevices, removeDevice, touchDevice, upsertDevice } from "@/lib/services/devices";

const Device = z.object({
  id: z.string().min(8).max(64).regex(/^[\w-]+$/),
  name: z.string().min(1).max(60),
  type: z.enum(["desktop", "laptop", "mobile", "browser"]),
  platform: z.string().max(30).optional(),
  app: z.enum(["desktop", "mobile", "web"]).optional(),
});

async function user() {
  if (!syncConfigured()) return { error: fail("Sending tabs isn't available right now.", 501) };
  const s = await getSession();
  if (!s) return { error: fail("Sign in to send tabs to your devices", 401) };
  return { uid: s.uid };
}

/** The signed-in account's devices (?current=<id> marks and refreshes this device). */
export async function GET(req: Request) {
  return handle(async () => {
    const u = await user();
    if ("error" in u) return u.error!;
    const current = new URL(req.url).searchParams.get("current");
    if (current) await touchDevice(u.uid, current).catch(() => {});
    const devices = await listDevices(u.uid);
    return ok({ devices: devices.map((d) => ({ ...d, current: d.id === current })) });
  });
}

/** Register (or update) this device. */
export async function POST(req: Request) {
  return handle(async () => {
    const u = await user();
    if ("error" in u) return u.error!;
    const parsed = Device.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid device");
    await upsertDevice(u.uid, parsed.data);
    return ok({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const u = await user();
    if ("error" in u) return u.error!;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Missing device id");
    await removeDevice(u.uid, id);
    return ok({ ok: true });
  });
}
