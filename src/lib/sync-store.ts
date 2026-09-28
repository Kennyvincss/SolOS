import "server-only";

/**
 * Per-user sync storage in Redis over the Upstash REST API. Works with the
 * Upstash integration on Vercel (UPSTASH_REDIS_REST_URL / _TOKEN) and the
 * older Vercel KV variables (KV_REST_API_URL / _TOKEN).
 */

function creds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function syncConfigured(): boolean {
  return creds() !== null;
}

async function redis<T>(command: (string | number)[]): Promise<T> {
  const c = creds();
  if (!c) throw new Error("Sync storage is not configured");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Sync storage error (${res.status})`);
  return body.result as T;
}

const key = (uid: string, scope: string) => `sync:v1:${scope}:${uid}`;

export async function readSync(uid: string, scope: string): Promise<{ data: unknown; updatedAt: number } | null> {
  const raw = await redis<string | null>(["GET", key(uid, scope)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeSync(uid: string, scope: string, data: unknown): Promise<number> {
  const updatedAt = Date.now();
  await redis(["SET", key(uid, scope), JSON.stringify({ data, updatedAt })]);
  return updatedAt;
}
