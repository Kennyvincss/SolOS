import { NextResponse } from "next/server";
import { createSession, userIdFor, verify } from "@/lib/auth/session";
import { originFor } from "@/lib/auth/origin";

export async function GET(req: Request) {
  const origin = originFor(req);
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const payload = verify<{ email: string; exp: number }>(token);
  if (!payload?.email) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That sign-in link is invalid or expired.")}`);
  await createSession({ uid: userIdFor("email", payload.email), name: payload.email.split("@")[0], provider: "email", email: payload.email });
  return NextResponse.redirect(`${origin}/`);
}
