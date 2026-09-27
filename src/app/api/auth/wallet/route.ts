import { cookies } from "next/headers";
import { createSession, publicUser, userIdFor, verify } from "@/lib/auth/session";
import { parseSignInMessage, verifyEd25519 } from "@/lib/auth/siws";
import { fail, handle, ok } from "@/lib/api";
import { shortAddr } from "@/lib/format";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { message?: string; signature?: string; address?: string };
    if (!body.message || !body.signature || !body.address) return fail("Missing signature");
    const jar = await cookies();
    const pending = verify<{ nonce: string; address: string; exp: number }>(jar.get("sos_nonce")?.value);
    const parsed = parseSignInMessage(body.message);
    const host = req.headers.get("host");
    if (!pending || !parsed) return fail("Sign-in request expired. Please try again.", 401);
    if (parsed.nonce !== pending.nonce || parsed.address !== body.address || pending.address !== body.address) return fail("Sign-in message mismatch", 401);
    if (host && parsed.domain !== host) return fail("Sign-in message was created for a different site", 401);
    if (!verifyEd25519(body.message, body.signature, body.address)) return fail("Invalid signature", 401);
    jar.delete({ name: "sos_nonce", path: "/api/auth" });
    const s = await createSession({ uid: userIdFor("wallet", body.address), name: shortAddr(body.address), provider: "wallet", wallet: body.address });
    return ok({ user: publicUser(s) });
  });
}
