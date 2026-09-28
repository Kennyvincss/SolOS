import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { submitProject } from "@/lib/services/developer";
import { developer } from "../_auth";

const Body = z.object({
  projectId: z.string().min(4).max(40),
  notes: z.string().max(1000).default(""),
  sourceUrl: z.string().url().max(300).optional().or(z.literal("")),
  storeId: z.string().regex(/^[a-p]{32}$/, "Chrome Web Store IDs are 32 letters a–p").optional().or(z.literal("")),
});

/** Submit a project to the STRATA Store for review. */
export async function POST(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid submission");
    const sub = await submitProject(d.uid, parsed.data.projectId, { notes: parsed.data.notes, sourceUrl: parsed.data.sourceUrl || undefined, storeId: parsed.data.storeId || undefined });
    return sub ? ok(sub) : fail("Project not found", 404);
  });
}
