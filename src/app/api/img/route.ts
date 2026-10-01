import { safeImageUrl, thumbnail, thumbSize } from "@/lib/services/thumbnail";

/**
 * GET /api/img?u=<https image url>&s=<px>: a small WebP copy of a remote logo,
 * cached on the CDN. When no small copy can be made the response is an error
 * (the UI then shows the letter badge) rather than the original, which can be
 * megabytes: a slow host is retried after a minute, a broken image after a day.
 */
const MAX_BYTES = 15 * 1024 * 1024;
const PASS_THROUGH_BYTES = 200 * 1024; // originals this small may be sent as-is
const CACHE = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";
const fail = (status: number, seconds: number) => new Response(null, { status, headers: { "Cache-Control": `public, s-maxage=${seconds}` } });

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const src = safeImageUrl(params.get("u"));
  if (!src) return new Response("Bad image URL", { status: 400 });
  const size = thumbSize(params.get("s"));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    // redirect: "manual" so a redirect can't point the fetch at a private host.
    const res = await fetch(src, { signal: ctrl.signal, headers: { accept: "image/*" }, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = safeImageUrl(res.headers.get("location") ? new URL(res.headers.get("location")!, src).toString() : null);
      return next ? new Response(null, { status: 302, headers: { Location: `/api/img?u=${encodeURIComponent(next.toString())}&s=${size}`, "Cache-Control": CACHE } }) : fail(404, 86400);
    }
    const type = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || !type.startsWith("image/")) return fail(404, res.status >= 500 ? 60 : 86400);
    if (len > MAX_BYTES) return fail(413, 86400);
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return fail(413, 86400);
    // Already tiny (or vector): send as-is.
    if (body.byteLength < 6 * 1024 || (type.includes("svg") && body.byteLength <= PASS_THROUGH_BYTES)) {
      return new Response(body, { headers: { "Content-Type": type.includes("svg") ? "image/svg+xml" : type, "Cache-Control": CACHE, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" } });
    }
    const out = await thumbnail(body, size);
    if (!out || out.byteLength >= body.byteLength) {
      return body.byteLength <= PASS_THROUGH_BYTES ? new Response(body, { headers: { "Content-Type": type, "Cache-Control": CACHE } }) : fail(415, 86400);
    }
    return new Response(out as BodyInit, { headers: { "Content-Type": "image/webp", "Cache-Control": CACHE } });
  } catch {
    return fail(504, 60); // slow or unreachable host: try again on a later visit
  } finally {
    clearTimeout(timer);
  }
}
