import { addressRisk, domainRisk } from "@/lib/services/security";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";

export async function GET(req: Request) {
  return handle(async () => {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!q) return fail("Enter a token, wallet, program or website");
    if (isAddress(q)) return ok(await addressRisk(q), 60);
    return ok(domainRisk(q), 300);
  });
}
