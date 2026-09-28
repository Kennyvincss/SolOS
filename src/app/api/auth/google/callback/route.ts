import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { originFor } from "@/lib/auth/origin";
import { createSession, sign, userIdFor } from "@/lib/auth/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = originFor(req);
  const back = (err?: string) => NextResponse.redirect(`${origin}/login${err ? `?error=${encodeURIComponent(err)}` : ""}`);
  const jar = await cookies();
  const expected = jar.get("sos_oauth_state")?.value;
  jar.delete({ name: "sos_oauth_state", path: "/api/auth" });
  const forDesktop = jar.get("sos_oauth_desktop")?.value === "1";
  jar.delete({ name: "sos_oauth_desktop", path: "/api/auth" });
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("Google sign-in was cancelled or expired.");
  if (!config.googleClientId || !config.googleClientSecret) return back("Google sign-in is not configured.");
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return back("Google rejected the sign-in.");
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access_token}` } });
    const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!info.sub) return back("Could not read your Google profile.");
    const user = {
      uid: userIdFor("google", info.sub),
      name: info.name ?? info.email?.split("@")[0] ?? "Solana OS user",
      provider: "google" as const,
      email: info.email_verified ? info.email : undefined,
      avatar: info.picture,
    };
    if (forDesktop) {
      // Short-lived, signed hand-off the desktop app exchanges for its own session.
      const token = sign({ kind: "desktop-handoff", user, exp: Math.floor(Date.now() / 1000) + 120 });
      return NextResponse.redirect(`${origin}/auth/desktop?token=${encodeURIComponent(token)}`);
    }
    await createSession(user);
    return NextResponse.redirect(`${origin}/`);
  } catch {
    return back("Google sign-in failed. Please try again.");
  }
}
