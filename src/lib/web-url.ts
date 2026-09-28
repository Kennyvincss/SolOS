import { isAddress, isSignature } from "./solana/address";

/**
 * If the input is a web address ("axiom.trade", "https://jup.ag/swap",
 * "app.kamino.finance/lending"), return it as a full https URL, else null.
 * Solana addresses, signatures and ordinary search text return null.
 */
export function asWebUrl(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  if (isAddress(t) || isSignature(t)) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      return u.hostname.includes(".") || u.hostname === "localhost" ? u.toString() : null;
    } catch {
      return null;
    }
  }
  // domain(.tld) with a letters-only TLD, optional port and path
  if (!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(:\d{1,5})?([/?#]\S*)?$/i.test(t)) return null;
  try {
    return new URL(`https://${t}`).toString();
  } catch {
    return null;
  }
}

/** Route that safety-checks a site before sending the user there. */
export function goHref(url: string) {
  return `/go?url=${encodeURIComponent(url)}`;
}
