import { getActivity } from "@/lib/services/wallets";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { isDemoWallet } from "@/lib/providers/demo";

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (!isAddress(address) && !isDemoWallet(address)) return fail("Invalid Solana address");
    const sp = new URL(req.url).searchParams;
    const viewer = sp.get("viewer");
    const limit = Math.min(50, Number(sp.get("limit") ?? 15) || 15);
    return ok(await getActivity(address, limit, viewer && isAddress(viewer) ? viewer : undefined), 15);
  });
}
