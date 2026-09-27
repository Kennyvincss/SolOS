import { search } from "@/lib/search/engine";
import { handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (!q.trim()) return ok({ query: "", groups: [], intent: { type: "lookup", label: "Results" }, tookMs: 0, meta: [] });
    return ok(await search(q), 30);
  });
}
