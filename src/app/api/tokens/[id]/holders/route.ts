import { topHolders } from "@/lib/services/tokens";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    if (!isAddress(id)) return fail("Invalid mint");
    return ok(await topHolders(id), 300);
  });
}
