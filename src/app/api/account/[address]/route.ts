import { getAccountInfo } from "@/lib/providers/rpc";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { KNOWN_PROGRAMS, SYSTEM_PROGRAM } from "@/lib/solana/constants";
import { isDemoWallet } from "@/lib/providers/demo";

/** What kind of account is this? Lets one search box route wallets, mints and programs. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (isDemoWallet(address)) return ok({ type: "wallet", demo: true });
    if (!isAddress(address)) return fail("Invalid Solana address");
    const acct = await getAccountInfo(address);
    if (!acct) return ok({ type: "missing" }, 30);
    if (acct.executable) return ok({ type: "program", name: KNOWN_PROGRAMS[address]?.name }, 300);
    const parsed = !Array.isArray(acct.data) ? acct.data.parsed : undefined;
    if (parsed?.type === "mint") return ok({ type: "mint" }, 300);
    if (acct.owner === SYSTEM_PROGRAM) return ok({ type: "wallet" }, 60);
    return ok({ type: "other", owner: acct.owner, ownerName: KNOWN_PROGRAMS[acct.owner]?.name }, 60);
  });
}
