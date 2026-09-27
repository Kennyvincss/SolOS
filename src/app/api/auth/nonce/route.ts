import crypto from "node:crypto";
import { cookies } from "next/headers";
import { sign } from "@/lib/auth/session";
import { buildSignInMessage } from "@/lib/auth/siws";
import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const address = url.searchParams.get("address") ?? "";
    if (!isAddress(address)) return fail("Invalid address");
    const nonce = crypto.randomBytes(12).toString("base64url");
    const issuedAt = new Date().toISOString();
    const domain = req.headers.get("host") ?? url.host;
    const message = buildSignInMessage({ domain, address, nonce, issuedAt });
    const jar = await cookies();
    jar.set("sos_nonce", sign({ nonce, address, exp: Math.floor(Date.now() / 1000) + 300 }), {
      httpOnly: true, secure: config.isProd, sameSite: "strict", path: "/api/auth", maxAge: 300,
    });
    return ok({ message });
  });
}
