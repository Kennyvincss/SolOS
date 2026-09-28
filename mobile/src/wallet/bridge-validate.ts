// Validation of wallet requests coming from web pages (pure, unit-tested).

import { isWalletId, type WalletId } from "./protocol";

export type WalletRequest =
  | { type: "connect"; wallet: WalletId; silent?: boolean }
  | { type: "disconnect"; wallet: WalletId }
  | { type: "signMessage"; wallet: WalletId; message: string }
  | { type: "signTransaction"; wallet: WalletId; transaction: string }
  | { type: "signAllTransactions"; wallet: WalletId; transactions: string[] }
  | { type: "signAndSendTransaction"; wallet: WalletId; transaction: string; options?: Record<string, unknown> | null };

const MAX_B64 = 256 * 1024;
const isB64 = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= MAX_B64 && /^[A-Za-z0-9+/]+=*$/.test(s);

/** Validate a request coming from an (untrusted) page. */
export function parseWalletRequest(x: unknown): WalletRequest | null {
  const r = x as Record<string, unknown>;
  if (!r || typeof r !== "object" || !isWalletId(r.wallet)) return null;
  switch (r.type) {
    case "connect":
      return { type: "connect", wallet: r.wallet, silent: r.silent === true };
    case "disconnect":
      return { type: "disconnect", wallet: r.wallet };
    case "signMessage":
      return isB64(r.message) ? { type: "signMessage", wallet: r.wallet, message: r.message } : null;
    case "signTransaction":
      return isB64(r.transaction) ? { type: "signTransaction", wallet: r.wallet, transaction: r.transaction } : null;
    case "signAllTransactions":
      return Array.isArray(r.transactions) && r.transactions.length > 0 && r.transactions.length <= 50 && r.transactions.every(isB64)
        ? { type: "signAllTransactions", wallet: r.wallet, transactions: r.transactions as string[] }
        : null;
    case "signAndSendTransaction": {
      const options = r.options && typeof r.options === "object" ? pickSendOptions(r.options as Record<string, unknown>) : null;
      return isB64(r.transaction) ? { type: "signAndSendTransaction", wallet: r.wallet, transaction: r.transaction, options } : null;
    }
    default:
      return null;
  }
}

function pickSendOptions(o: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (typeof o.skipPreflight === "boolean") out.skipPreflight = o.skipPreflight;
  if (typeof o.preflightCommitment === "string") out.preflightCommitment = o.preflightCommitment;
  if (typeof o.maxRetries === "number") out.maxRetries = o.maxRetries;
  if (typeof o.minContextSlot === "number") out.minContextSlot = o.minContextSlot;
  return Object.keys(out).length ? out : null;
}

