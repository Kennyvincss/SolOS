import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { isDemoWallet } from "@/lib/providers/demo";
import { classifyAddress } from "@/lib/services/account";

/** What kind of account is this? Lets one search box route wallets, mints and programs. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (!isDemoWallet(address) && !isAddress(address)) return fail("Invalid Solana address");
    const c = await classifyAddress(address);
    return ok(c, c.type === "missing" ? 30 : c.type === "wallet" || c.type === "other" ? 60 : 300);
  });
}
