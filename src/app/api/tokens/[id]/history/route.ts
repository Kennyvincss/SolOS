import { tokenHistory } from "@/lib/services/tokens";
import { handle, ok } from "@/lib/api";
import type { ChartRange } from "@/lib/providers/geckoterminal";

const RANGES: ChartRange[] = ["1D", "7D", "30D", "90D", "1Y"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const r = new URL(req.url).searchParams.get("range") as ChartRange;
    return ok(await tokenHistory(id, RANGES.includes(r) ? r : "7D"), 120);
  });
}
