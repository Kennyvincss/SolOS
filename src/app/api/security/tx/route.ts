import { preSignCheck } from "@/lib/services/transactions";
import { fail, handle, ok } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { tx?: string; signer?: string };
    if (!body.tx || body.tx.length > 20000) return fail("Paste a serialized transaction (base64 or base58)");
    try {
      return ok(await preSignCheck(body.tx, body.signer));
    } catch (e) {
      return fail(`Could not decode transaction: ${e instanceof Error ? e.message : "invalid data"}`);
    }
  });
}
