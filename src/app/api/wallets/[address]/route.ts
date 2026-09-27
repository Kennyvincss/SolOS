import { getPortfolio } from "@/lib/services/wallets";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { isDemoWallet } from "@/lib/providers/demo";

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (!isAddress(address) && !isDemoWallet(address)) return fail("Invalid Solana address");
    return ok(await getPortfolio(address), 20);
  });
}
