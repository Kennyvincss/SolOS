import { z } from "zod";
import { fail, handle, ok } from "@/lib/api";
import { PROJECT_KINDS, createProject, deleteProject, updateProject } from "@/lib/services/developer";
import { developer } from "../_auth";

const Fields = z.object({
  kind: z.enum(PROJECT_KINDS),
  name: z.string().min(2).max(40),
  description: z.string().min(10).max(280),
  category: z.string().min(2).max(30),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must look like 1.0.0"),
  permissions: z.array(z.string().max(40)).max(20),
  matches: z.array(z.string().max(200)).max(20),
  instructions: z.string().max(4000).optional(),
  homepage: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const parsed = Fields.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid project");
    return ok(await createProject(d.uid, parsed.data));
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    const parsed = Fields.partial().safeParse(body);
    if (!body?.id || !parsed.success) return fail("Invalid project");
    const p = await updateProject(d.uid, body.id, parsed.data);
    return p ? ok(p) : fail("Project not found", 404);
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return fail("Missing project id");
    await deleteProject(d.uid, id);
    return ok({ ok: true });
  });
}
