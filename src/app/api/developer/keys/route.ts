import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { createKey, revokeKey } from "@/lib/services/developer";
import { developer } from "../_auth";

/** Create an API key. The secret is shown once. */
export async function POST(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const parsed = z.object({ name: z.string().max(40) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid key name");
    try {
      return ok(await createKey(d.uid, parsed.data.name));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Couldn't create a key");
    }
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Missing key id");
    await revokeKey(d.uid, id);
    return ok({ ok: true });
  });
}
