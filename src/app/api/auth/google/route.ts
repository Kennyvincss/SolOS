import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { originFor } from "@/lib/auth/origin";
import { fail } from "@/lib/api";

export async function GET(req: Request) {
  if (!config.googleClientId || !config.googleClientSecret) return fail("Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).", 501);
  const state = crypto.randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set("sos_oauth_state", state, { httpOnly: true, secure: config.isProd, sameSite: "lax", path: "/api/auth", maxAge: 600 });
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: `${originFor(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
