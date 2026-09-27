import bs58 from "bs58";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

function decodeLength(s: string): number | null {
  if (!BASE58_RE.test(s)) return null;
  try {
    return bs58.decode(s).length;
  } catch {
    return null;
  }
}

/** A Solana public key: base58, 32 bytes. Could be a wallet, mint or program. */
export function isAddress(s: string): boolean {
  const t = s.trim();
  if (t.length < 32 || t.length > 44) return false;
  return decodeLength(t) === 32;
}

/** A transaction signature: base58, 64 bytes. */
export function isSignature(s: string): boolean {
  const t = s.trim();
  if (t.length < 80 || t.length > 90) return false;
  return decodeLength(t) === 64;
}

/** Pull the first address/signature out of free text such as "Analyze 7xK...". */
export function extractSolanaId(text: string): { type: "address" | "signature"; value: string } | null {
  const words = text.split(/[\s,;:()"'`]+/).filter(Boolean);
  for (const w of words) {
    if (isSignature(w)) return { type: "signature", value: w };
  }
  for (const w of words) {
    if (isAddress(w)) return { type: "address", value: w };
  }
  return null;
}
