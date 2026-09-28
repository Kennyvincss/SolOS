// Phantom / Solflare deeplink protocol (pure, unit-tested).
//
// Both wallets implement the same protocol: the app opens
// https://<wallet>/ul/v1/<method>?... with an x25519-encrypted payload, the
// wallet asks the user to approve, then redirects back to our URL scheme with
// an encrypted response. See https://docs.phantom.com/phantom-deeplinks.

import nacl from "tweetnacl";
import bs58 from "bs58";

export type WalletId = "phantom" | "solflare";
export type Method = "connect" | "disconnect" | "signMessage" | "signTransaction" | "signAllTransactions" | "signAndSendTransaction";

export const WALLET_APPS: Record<WalletId, { name: string; base: string; keyParam: string; color: string; download: string }> = {
  phantom: { name: "Phantom", base: "https://phantom.app/ul/v1", keyParam: "phantom_encryption_public_key", color: "#ab9ff2", download: "https://phantom.com/download" },
  solflare: { name: "Solflare", base: "https://solflare.com/ul/v1", keyParam: "solflare_encryption_public_key", color: "#fc7227", download: "https://solflare.com/download" },
};

export const METHODS: Method[] = ["connect", "disconnect", "signMessage", "signTransaction", "signAllTransactions", "signAndSendTransaction"];

export function isWalletId(x: unknown): x is WalletId {
  return x === "phantom" || x === "solflare";
}

/** Our callback URL for a request: <scheme>://wallet/<wallet>/<method>/<request id>. */
export function redirectLink(scheme: string, wallet: WalletId, method: Method, rid: string): string {
  return `${scheme}://wallet/${wallet}/${method}/${encodeURIComponent(rid)}`;
}

export interface Callback {
  wallet: WalletId;
  method: Method;
  rid: string;
  params: Record<string, string>;
}

/** Parse a wallet's redirect back to us. Returns null for any other URL. */
export function parseCallback(url: string, scheme: string): Callback | null {
  const prefix = `${scheme}://wallet/`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const q = rest.indexOf("?");
  const path = (q >= 0 ? rest.slice(0, q) : rest).split("/");
  const [wallet, method, rid] = path;
  if (!isWalletId(wallet) || !METHODS.includes(method as Method) || !rid) return null;
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const [k, v] of new URLSearchParams(rest.slice(q + 1))) params[k] = v;
  }
  return { wallet, method: method as Method, rid: decodeURIComponent(rid), params };
}

export function sharedSecret(walletEncryptionPublicKey: string, dappSecretKey: Uint8Array): Uint8Array {
  return nacl.box.before(bs58.decode(walletEncryptionPublicKey), dappSecretKey);
}

export function encryptPayload(payload: unknown, shared: Uint8Array): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(24);
  const box = nacl.box.after(new TextEncoder().encode(JSON.stringify(payload)), nonce, shared);
  return { nonce: bs58.encode(nonce), payload: bs58.encode(box) };
}

export function decryptPayload<T = Record<string, unknown>>(data: string, nonce: string, shared: Uint8Array): T {
  const opened = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), shared);
  if (!opened) throw new Error("Couldn't decrypt the wallet's response");
  return JSON.parse(new TextDecoder().decode(opened)) as T;
}

export function connectUrl(o: { wallet: WalletId; dappPublicKey: Uint8Array; appUrl: string; redirect: string; cluster?: string }): string {
  const p = new URLSearchParams({
    app_url: o.appUrl,
    dapp_encryption_public_key: bs58.encode(o.dappPublicKey),
    redirect_link: o.redirect,
    cluster: o.cluster ?? "mainnet-beta",
  });
  return `${WALLET_APPS[o.wallet].base}/connect?${p}`;
}

export function requestUrl(o: { wallet: WalletId; method: Exclude<Method, "connect">; dappPublicKey: Uint8Array; shared: Uint8Array; payload: unknown; redirect: string }): string {
  const { nonce, payload } = encryptPayload(o.payload, o.shared);
  const p = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(o.dappPublicKey),
    nonce,
    redirect_link: o.redirect,
    payload,
  });
  return `${WALLET_APPS[o.wallet].base}/${o.method}?${p}`;
}

/** An error redirect (user rejected, etc.) as a readable message, or null. */
export function callbackError(params: Record<string, string>): string | null {
  if (!params.errorCode && !params.errorMessage) return null;
  const code = params.errorCode;
  if (code === "4001") return "Request rejected in the wallet";
  return params.errorMessage || `Wallet error ${code}`;
}
