import { movers, newTokens, organicTokens, tokensByMints, topTradedTokens, trendingTokens } from "@/lib/services/tokens";
import { fail, handle, ok } from "@/lib/api";
import type { JupInterval } from "@/lib/providers/jupiter";

const INTERVALS = ["5m", "1h", "6h", "24h"];

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const list = sp.get("list") ?? "trending";
    const interval = (INTERVALS.includes(sp.get("interval") ?? "") ? sp.get("interval") : "24h") as JupInterval;
    const limit = Math.min(100, Number(sp.get("limit") ?? 30) || 30);
    switch (list) {
      case "trending":
        return ok(await trendingTokens(interval, limit), 60);
      case "top_traded":
        return ok(await topTradedTokens(interval, limit), 60);
      case "organic":
        return ok(await organicTokens(interval, limit), 60);
      case "new":
        return ok(await newTokens(limit), 60);
      case "mints":
        return ok(await tokensByMints((sp.get("mints") ?? "").split(",").filter(Boolean)), 30);
      case "movers":
        return ok(await movers(), 60);
      default:
        return fail("Unknown list");
    }
  });
}
