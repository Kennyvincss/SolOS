import type { AppEntry } from "../types";
import { domainOf } from "../catalog/apps";

/**
 * Logo resolution for App Store entries. Sources, best first:
 *  1. DefiLlama protocol logo (when the app is tracked there)
 *  2. The app's X profile picture (via unavatar.io)
 *  3. The website's icon (via Google's favicon service, 128px)
 * The first source that returns a real image wins.
 */

export function logoCandidates(app: AppEntry, llamaLogo?: string): string[] {
  const out: string[] = [];
  if (llamaLogo) out.push(llamaLogo);
  if (app.twitter) out.push(`https://unavatar.io/x/${encodeURIComponent(app.twitter)}?fallback=false`);
  out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(app.website))}&sz=128`);
  return out;
}

export interface LogoImage {
  body: ArrayBuffer;
  contentType: string;
  source: string;
}

/** Tiny placeholder icons (e.g. a 16px default globe) are treated as "no logo". */
const MIN_BYTES = 300;

export async function fetchLogo(candidates: string[], fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<LogoImage | null> {
  for (const url of candidates) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: "image/*" }, redirect: "follow" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) continue;
      const body = await res.arrayBuffer();
      if (body.byteLength < MIN_BYTES) continue;
      return { body, contentType: type, source: url };
    } catch {
      /* try the next source */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
