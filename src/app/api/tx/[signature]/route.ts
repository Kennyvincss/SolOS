import { explainSignature } from "@/lib/services/transactions";
import { fail, handle, ok } from "@/lib/api";
import { isSignature } from "@/lib/solana/address";

export async function GET(_req: Request, { params }: { params: Promise<{ signature: string }> }) {
  return handle(async () => {
    const { signature } = await params;
    if (!isSignature(signature)) return fail("That is not a valid transaction signature");
    // Confirmed transactions are immutable, so they cache well.
    return ok(await explainSignature(signature), 3600);
  });
}
