import { NextResponse } from "next/server";
import { originFor } from "@/lib/auth/origin";
import { createSession, verify, type SessionUser } from "@/lib/auth/session";

/**
 * Finishes a sign-in that ran in the system browser (Google blocks sign-in
 * inside embedded browsers): the desktop app opens this with the signed,
 * two-minute hand-off token and gets its own session cookie.
 */
export async function GET(req: Request) {
  const origin = originFor(req);
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const payload = verify<{ kind: string; user: Omit<SessionUser, "iat" | "exp">; exp: number }>(token);
  if (!payload || payload.kind !== "desktop-handoff" || !payload.user?.uid) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That sign-in link expired. Please try again.")}`);
  }
  await createSession(payload.user);
  return NextResponse.redirect(`${origin}/`);
}
