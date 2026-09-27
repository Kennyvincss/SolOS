import { getToken } from "@/lib/services/tokens";
import { fail, handle, ok } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const r = await getToken(decodeURIComponent(id));
    if (!r.data) return fail("Token not found", 404);
    return ok(r, 30);
  });
}
