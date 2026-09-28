import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { getRecord, publicRecord, saveRecord } from "@/lib/services/developer";
import { developer } from "./_auth";

const Profile = z.object({
  name: z.string().max(60),
  handle: z.string().max(30).regex(/^[a-z0-9_-]*$/i, "letters, numbers, - and _"),
  bio: z.string().max(280),
  website: z.string().max(200),
  github: z.string().max(100),
  x: z.string().max(30),
});

/** The developer's profile, projects, submissions and keys (without secrets). */
export async function GET() {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    return ok(publicRecord(await getRecord(d.uid)));
  });
}

/** Update the developer profile. */
export async function PUT(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const parsed = Profile.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid profile");
    const r = await getRecord(d.uid);
    r.profile = parsed.data;
    await saveRecord(d.uid, r);
    return ok(publicRecord(r));
  });
}
