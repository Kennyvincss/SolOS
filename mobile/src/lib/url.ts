// Pure helpers for the browser (no React Native imports, so they can be unit tested).

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Address-bar input -> URL. URLs and bare domains open directly; anything else
 * (including Solana addresses and questions) goes to Solana OS search.
 */
export function normalizeInput(input: string, base: string): string {
  const t = String(input || "").trim();
  if (!t) return base;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`;
  const looksLikeDomain = !/\s/.test(t) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(t);
  if (looksLikeDomain) return `https://${t}`;
  return `${base}/search?q=${encodeURIComponent(t)}`;
}

/** What the address bar shows for a URL: the Solana OS home is shown as empty. */
export function displayUrl(url: string, base: string): string {
  if (url === base || url === `${base}/`) return "";
  return url;
}

export type RiskLevel = "low" | "medium" | "high";
export interface Risk {
  level: RiskLevel;
  label: string;
  detail?: string;
}

/** Summarise a Solana OS security report (/api/security) into one badge. */
export function riskFromReport(report: unknown): Risk | null {
  const ind = Array.isArray((report as { indicators?: unknown })?.indicators) ? ((report as { indicators: Record<string, string>[] }).indicators) : [];
  if (!ind.length) return null;
  const high = ind.find((i) => i.level === "high");
  if (high) return { level: "high", label: high.label, detail: high.explanation };
  const medium = ind.find((i) => i.level === "medium");
  if (medium) return { level: "medium", label: medium.label, detail: medium.explanation };
  const known = ind.find((i) => i.id === "registry");
  return { level: "low", label: known?.value ? `Known app · ${known.value}` : "No warnings", detail: known?.explanation };
}

/**
 * Android "intent:" links (intent://host/path#Intent;scheme=x;package=y;S.browser_fallback_url=z;end).
 * Returns the app URL to try and the web fallback, if any.
 */
export function parseIntentUrl(url: string): { appUrl: string | null; fallback: string | null } {
  const m = /^intent:(\/\/[^#]*)#Intent;(.*)end;?$/i.exec(url);
  if (!m) return { appUrl: null, fallback: null };
  const params: Record<string, string> = {};
  for (const part of m[2].split(";")) {
    const i = part.indexOf("=");
    if (i > 0) params[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  const scheme = params.scheme;
  const fallback = params["S.browser_fallback_url"];
  return {
    appUrl: scheme && /^[a-z][a-z0-9+.-]*$/i.test(scheme) ? `${scheme}:${m[1]}` : null,
    fallback: fallback && /^https?:\/\//i.test(fallback) ? fallback : null,
  };
}

/** Schemes handed to other apps without asking (the other app shows its own approval). */
const TRUSTED_SCHEMES = ["solana-wallet", "solana", "mailto", "tel", "sms", "itms-apps", "itms-appss", "market"];

/** Links that must open in another app even though they are https (wallet universal links, app stores). */
function isAppLink(u: URL): boolean {
  const host = u.hostname.replace(/^www\./, "");
  if ((host === "phantom.app" || host === "solflare.com") && u.pathname.startsWith("/ul/")) return true;
  if (host === "play.google.com" && u.pathname.startsWith("/store/")) return true;
  if (host === "apps.apple.com" || host === "testflight.apple.com") return true;
  return false;
}

export type NavDecision =
  | { kind: "load" }
  | { kind: "open"; url: string } // hand to the OS
  | { kind: "ask"; url: string; scheme: string } // confirm first, then hand to the OS
  | { kind: "intent"; appUrl: string | null; fallback: string | null }
  | { kind: "block" };

/** Decide what the browser does with a navigation. */
export function decideNavigation(url: string): NavDecision {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: "block" };
  }
  const scheme = u.protocol.replace(/:$/, "").toLowerCase();
  if (scheme === "http" || scheme === "https") return isAppLink(u) ? { kind: "open", url } : { kind: "load" };
  if (scheme === "about" || scheme === "data" || scheme === "blob") return { kind: "load" };
  if (scheme === "javascript" || scheme === "file" || scheme === "content") return { kind: "block" };
  if (scheme === "intent") return { kind: "intent", ...parseIntentUrl(url) };
  if (TRUSTED_SCHEMES.includes(scheme)) return { kind: "open", url };
  return { kind: "ask", url, scheme };
}

/** Open a page inside a wallet app's own browser (fallback for sites without Wallet Standard support). */
export function walletBrowseUrl(wallet: "phantom" | "solflare", pageUrl: string, ref: string): string {
  const u = encodeURIComponent(pageUrl);
  const r = encodeURIComponent(ref);
  return wallet === "phantom" ? `https://phantom.app/ul/browse/${u}?ref=${r}` : `https://solflare.com/ul/v1/browse/${u}?ref=${r}`;
}
