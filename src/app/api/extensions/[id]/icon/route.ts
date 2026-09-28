import { cached, fetchText } from "@/lib/providers/http";

/**
 * Icon of a Chrome Web Store extension: reads the og:image of its store page
 * and redirects to it. Cached for a day per instance (and by the CDN).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-p]{32}$/.test(id)) return new Response("Invalid extension ID", { status: 400 });
  const icon = await cached(`cws-icon:${id}`, 24 * 3600 * 1000, async () => {
    const html = await fetchText(`https://chromewebstore.google.com/detail/${id}?hl=en`, 8000);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const url = m?.[1]?.replace(/&amp;/g, "&");
    return url && /^https:\/\/lh\d\.googleusercontent\.com\//.test(url) ? url : null;
  }).catch(() => null);
  if (!icon) return new Response("Not found", { status: 404, headers: { "cache-control": "public, s-maxage=3600" } });
  return new Response(null, { status: 302, headers: { location: icon, "cache-control": "public, max-age=86400, s-maxage=86400" } });
}
