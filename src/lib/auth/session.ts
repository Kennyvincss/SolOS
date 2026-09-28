import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { config } from "../config";

/**
 * Stateless sessions: an HMAC-SHA256 signed token in an httpOnly cookie.
 * No database is required, which keeps STRATA deployable to Vercel
 * serverless functions as-is. Set AUTH_SECRET in production.
 */

export const SESSION_COOKIE = "sos_session";
const SESSION_TTL_S = 60 * 60 * 24 * 30;

export interface SessionUser {
  uid: string;
  name: string;
  provider: "wallet" | "google" | "email";
  email?: string;
  wallet?: string;
  avatar?: string;
  iat: number;
  exp: number;
}

export class AuthConfigError extends Error {}

function secret(): string {
  if (config.authSecret) return config.authSecret;
  if (config.isProd) throw new AuthConfigError("AUTH_SECRET is not set. Add it in your Vercel project environment variables.");
  return "solana-os-dev-secret-do-not-use-in-production";
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(payload: object): string {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T extends { exp: number }>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  let expected: string;
  try {
    expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verify<SessionUser>(jar.get(SESSION_COOKIE)?.value);
}

export async function createSession(user: Omit<SessionUser, "iat" | "exp">) {
  const now = Math.floor(Date.now() / 1000);
  const session: SessionUser = { ...user, iat: now, exp: now + SESSION_TTL_S };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign(session), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export function publicUser(s: SessionUser | null) {
  if (!s) return null;
  return { uid: s.uid, name: s.name, provider: s.provider, email: s.email, wallet: s.wallet, avatar: s.avatar };
}

export function userIdFor(kind: "wallet" | "google" | "email", id: string) {
  return `${kind}:${crypto.createHash("sha256").update(id.toLowerCase()).digest("hex").slice(0, 24)}`;
}
