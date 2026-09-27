import { getApp } from "@/lib/catalog/apps";
import { solanaProtocols } from "@/lib/providers/defillama";
import { fetchLogo, logoCandidates } from "@/lib/services/logos";

/**
 * GET /api/logo/{slug}: the app's logo image, proxied and cached on the CDN for
 * a week so browsers never hit third-party logo services directly.
 * Returns 404 when no source has a logo; the UI then shows a letter badge.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = getApp(slug);
  if (!app) return new Response("Unknown app", { status: 404 });

  let llamaLogo: string | undefined;
  if (app.llama?.length) {
    try {
      const list = await solanaProtocols();
      llamaLogo = app.llama.map((n) => list.find((p) => p.slug === n || p.name.toLowerCase() === n.toLowerCase())).find((p) => p?.logo)?.logo;
    } catch {
      /* DefiLlama unavailable: use the other sources */
    }
  }

  const logo = await fetchLogo(logoCandidates(app, llamaLogo));
  if (!logo) {
    return new Response("No logo", { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
  }
  return new Response(logo.body, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "X-Logo-Source": new URL(logo.source).hostname,
    },
  });
}
