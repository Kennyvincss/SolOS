import { safeImageUrl, thumbnail, thumbSize } from "@/lib/services/thumbnail";

/**
 * GET /api/img?u=<https image url>&s=<px>: a small WebP copy of a remote logo,
 * cached on the CDN. Anything that can't be shrunk redirects to the original.
 */
const MAX_BYTES = 6 * 1024 * 1024;
const CACHE = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const src = safeImageUrl(params.get("u"));
  if (!src) return new Response("Bad image URL", { status: 400 });
  const size = thumbSize(params.get("s"));
  const original = () => new Response(null, { status: 302, headers: { Location: src.toString(), "Cache-Control": "public, s-maxage=3600" } });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    // redirect: "manual" so a redirect can't point the fetch at a private host.
    const res = await fetch(src, { signal: ctrl.signal, headers: { accept: "image/*" }, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = safeImageUrl(res.headers.get("location") ? new URL(res.headers.get("location")!, src).toString() : null);
      return next ? new Response(null, { status: 302, headers: { Location: `/api/img?u=${encodeURIComponent(next.toString())}&s=${size}`, "Cache-Control": CACHE } }) : original();
    }
    const type = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || !type.startsWith("image/") || len > MAX_BYTES) return original();
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return original();
    // Already tiny (or vector): send as-is.
    if (body.byteLength < 6 * 1024 || type.includes("svg")) {
      return new Response(body, { headers: { "Content-Type": type.includes("svg") ? "image/svg+xml" : type, "Cache-Control": CACHE, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" } });
    }
    const out = await thumbnail(body, size);
    if (!out || out.byteLength >= body.byteLength) return new Response(body, { headers: { "Content-Type": type, "Cache-Control": CACHE } });
    return new Response(out as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": CACHE } });
  } catch {
    return original();
  } finally {
    clearTimeout(timer);
  }
}
