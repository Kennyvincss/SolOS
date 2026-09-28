import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { originFor } from "@/lib/auth/origin";
import { fail } from "@/lib/api";

export async function GET(req: Request) {
  if (!config.googleClientId || !config.googleClientSecret) return fail("Google sign-in isn't available yet. Sign in with your wallet or email instead.", 501);
  const state = crypto.randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set("sos_oauth_state", state, { httpOnly: true, secure: config.isProd, sameSite: "lax", path: "/api/auth", maxAge: 600 });
  // Started from the desktop app (which opens this in the system browser):
  // hand the sign-in back to the app when it completes.
  const desktop = new URL(req.url).searchParams.get("desktop") === "1";
  if (desktop) jar.set("sos_oauth_desktop", "1", { httpOnly: true, secure: config.isProd, sameSite: "lax", path: "/api/auth", maxAge: 600 });
  else jar.delete({ name: "sos_oauth_desktop", path: "/api/auth" });
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
