import "server-only";

/**
 * Shrink a logo to icon size as WebP. Token and app logos are often 256–2000px
 * PNGs (hundreds of KB) shown at 24–56px; a 2x thumbnail is a few KB.
 * Returns null when the image can't be decoded (callers then serve the original).
 */
export async function thumbnail(body: ArrayBuffer, size: number): Promise<Uint8Array | null> {
  try {
    const sharp = (await import("sharp")).default;
    const px = Math.max(16, Math.min(256, Math.round(size * 2)));
    const out = await sharp(Buffer.from(body), { animated: false, limitInputPixels: 40_000_000 })
      .resize(px, px, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

/** Sizes the UI asks for, so the CDN caches a handful of variants per image. */
export function thumbSize(raw: string | null): number {
  const n = Number(raw);
  const sizes = [16, 24, 32, 40, 48, 64, 96, 128];
  if (!Number.isFinite(n) || n <= 0) return 64;
  return sizes.find((s) => s >= n) ?? 128;
}

/** Public https URLs only: no credentials, local or private network hosts. */
export function safeImageUrl(raw: string | null): URL | null {
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return null;
  // IP literals: only public IPv4; no IPv6 literals at all.
  if (h.includes(":")) return null;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  return u;
}
