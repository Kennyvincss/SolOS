import { webSearch } from "@/lib/providers/websearch";
import { handle, ok } from "@/lib/api";

export async function GET(req: Request) {
  return handle(async () => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return ok(await webSearch(q), 600);
  });
}
