/**
 * Small fetch helper shared by all providers: timeouts, JSON parsing, an
 * in-memory TTL cache and in-flight de-duplication. On Vercel each serverless
 * instance keeps its own cache, which is exactly what we want for hot paths
 * like token lists and protocol metadata.
 */

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status?: number,
    public url?: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** Strip a request URL (which may carry an API key) and anything key-like from an error message. */
export function redact(message: string, url?: string): string {
  let out = message;
  if (url) {
    out = out.split(url).join("[url]");
    try {
      const u = new URL(url);
      for (const v of u.searchParams.values()) if (v.length >= 8) out = out.split(v).join("[redacted]");
    } catch {
      /* not a URL: redact the raw value */
      if (url.length >= 8) out = out.split(url).join("[redacted]");
    }
  }
  return out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted]");
}

export function cacheGet<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  if (cache.size >= MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = fn()
    .then((v) => {
      cacheSet(key, v, ttlMs);
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        accept: "application/json",
        ...(opts.body ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new UpstreamError(`${res.status} ${res.statusText}`, res.status, url);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new UpstreamError(msg.includes("abort") ? "timed out" : redact(msg, url), undefined, url);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "SolanaOS/0.1 (+news aggregator)", accept: "application/rss+xml, application/xml, text/xml, */*" },
      cache: "no-store",
    });
    if (!res.ok) throw new UpstreamError(`${res.status} ${res.statusText}`, res.status, url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
