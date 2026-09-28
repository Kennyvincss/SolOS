import { createHash } from "node:crypto";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * STRATA API keys. Requests to /api/* that carry a key
 * (Authorization: Bearer strata_live_… or x-strata-key) are checked and
 * counted for the developer's analytics. Requests without a key work as
 * before (the public API is open).
 */
function redisCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis(creds: { url: string; token: string }, command: (string | number)[]) {
  const res = await fetch(creds.url, { method: "POST", headers: { authorization: `Bearer ${creds.token}`, "content-type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { result?: unknown };
  return body.result;
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const auth = req.headers.get("authorization") ?? "";
  const key = req.headers.get("x-strata-key") ?? (auth.startsWith("Bearer strata_") ? auth.slice(7) : "");
  if (!key) return NextResponse.next();
  const creds = redisCreds();
  if (!creds) return NextResponse.next();
  const hash = createHash("sha256").update(key).digest("hex");
  const raw = await redis(creds, ["GET", `devkey:v1:${hash}`]).catch(() => null);
  if (!raw) return NextResponse.json({ error: "Invalid or revoked STRATA API key" }, { status: 401 });
  let keyId = "";
  try {
    keyId = (JSON.parse(String(raw)) as { keyId: string }).keyId;
  } catch {
    return NextResponse.next();
  }
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const counter = `devuse:v1:${keyId}:${day}`;
  event.waitUntil(
    (async () => {
      const n = await redis(creds, ["INCR", counter]).catch(() => null);
      if (n === 1) await redis(creds, ["EXPIRE", counter, 40 * 86400]).catch(() => null);
    })(),
  );
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
