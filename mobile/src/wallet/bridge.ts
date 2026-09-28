// Native side of the in-page wallets: turns a page's Wallet Standard request
// into a Phantom/Solflare deeplink, waits for the wallet app to redirect back,
// and returns the decrypted result.
//
// Sessions are kept per wallet *and per site*, so each site is approved in the
// wallet separately and the wallet always shows the right site. They are
// stored in the OS keychain (expo-secure-store).

import { AppState } from "react-native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { fromByteArray, toByteArray } from "base64-js";
import {
  WALLET_APPS,
  callbackError,
  connectUrl,
  decryptPayload,
  parseCallback,
  redirectLink,
  requestUrl,
  sharedSecret,
  type Method,
  type WalletId,
} from "./protocol";
import type { WalletRequest } from "./bridge-validate";

export { parseWalletRequest, type WalletRequest } from "./bridge-validate";

interface StoredSession {
  dappSecretKey: string; // bs58
  walletKey: string; // wallet's encryption public key, bs58
  session: string;
  publicKey: string; // the user's account, bs58
}

const b58ToB64 = (s: string) => fromByteArray(bs58.decode(s));
const b64ToB58 = (s: string) => bs58.encode(toByteArray(s));

interface Pending {
  resolve: (params: Record<string, string>) => void;
  reject: (err: Error) => void;
  wentAway: boolean;
}

export class WalletBridge {
  private pending = new Map<string, Pending>();
  private seq = 0;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private scheme: string) {
    AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        for (const p of this.pending.values()) p.wentAway = true;
        return;
      }
      // Back in the app. If the wallet didn't redirect back within a few
      // seconds (user switched back by hand, or the wallet isn't installed),
      // fail the request instead of leaving the page waiting forever.
      if (this.activeTimer) clearTimeout(this.activeTimer);
      this.activeTimer = setTimeout(() => {
        for (const [rid, p] of this.pending) {
          if (!p.wentAway) continue;
          this.pending.delete(rid);
          p.reject(new Error("No response from the wallet"));
        }
      }, 4000);
    });
  }

  /** Feed incoming URLs here. Returns true if the URL was a wallet callback. */
  handleUrl(url: string): boolean {
    const cb = parseCallback(url, this.scheme);
    if (!cb) return false;
    const p = this.pending.get(cb.rid);
    if (!p) return true;
    this.pending.delete(cb.rid);
    const err = callbackError(cb.params);
    if (err) p.reject(new Error(err));
    else p.resolve(cb.params);
    return true;
  }

  private open(url: string, rid: string, wallet: WalletId): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      this.pending.set(rid, { resolve, reject, wentAway: false });
      Linking.openURL(url).catch(() => {
        this.pending.delete(rid);
        reject(new Error(`Couldn't open ${WALLET_APPS[wallet].name}. Is it installed?`));
      });
    });
  }

  private rid(): string {
    return `${Date.now().toString(36)}${(++this.seq).toString(36)}${bs58.encode(nacl.randomBytes(6))}`;
  }

  private async key(wallet: WalletId, origin: string): Promise<string> {
    const h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, origin);
    return `wallet_${wallet}_${h.slice(0, 40)}`;
  }

  private async load(wallet: WalletId, origin: string): Promise<StoredSession | null> {
    try {
      const raw = await SecureStore.getItemAsync(await this.key(wallet, origin));
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  private async save(wallet: WalletId, origin: string, s: StoredSession | null) {
    const k = await this.key(wallet, origin);
    if (s) await SecureStore.setItemAsync(k, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(k);
  }

  /** Handle a page request. `origin` comes from the WebView itself, never from the page. */
  async handle(origin: string, req: WalletRequest): Promise<unknown> {
    const { wallet } = req;
    const account = (s: StoredSession) => ({ address: s.publicKey, publicKey: fromByteArray(bs58.decode(s.publicKey)) });

    if (req.type === "connect") {
      const existing = await this.load(wallet, origin);
      if (existing) return account(existing);
      if (req.silent) return null;
      const kp = nacl.box.keyPair();
      const rid = this.rid();
      const params = await this.open(connectUrl({ wallet, dappPublicKey: kp.publicKey, appUrl: origin, redirect: redirectLink(this.scheme, wallet, "connect", rid) }), rid, wallet);
      const walletKey = params[WALLET_APPS[wallet].keyParam];
      if (!walletKey || !params.data || !params.nonce) throw new Error("The wallet sent an incomplete response");
      const data = decryptPayload<{ public_key: string; session: string }>(params.data, params.nonce, sharedSecret(walletKey, kp.secretKey));
      const s: StoredSession = { dappSecretKey: bs58.encode(kp.secretKey), walletKey, session: data.session, publicKey: data.public_key };
      await this.save(wallet, origin, s);
      return account(s);
    }

    if (req.type === "disconnect") {
      // Forget the session locally; no need to bounce to the wallet app.
      await this.save(wallet, origin, null);
      return null;
    }

    const s = await this.load(wallet, origin);
    if (!s) throw new Error("Connect the wallet first");
    const dappSecret = bs58.decode(s.dappSecretKey);
    const dappPublicKey = nacl.box.keyPair.fromSecretKey(dappSecret).publicKey;
    const shared = sharedSecret(s.walletKey, dappSecret);

    let method: Exclude<Method, "connect" | "disconnect">;
    let payload: Record<string, unknown>;
    switch (req.type) {
      case "signMessage":
        method = "signMessage";
        payload = { message: b64ToB58(req.message), session: s.session, display: "utf8" };
        break;
      case "signTransaction":
        method = "signTransaction";
        payload = { transaction: b64ToB58(req.transaction), session: s.session };
        break;
      case "signAllTransactions":
        method = "signAllTransactions";
        payload = { transactions: req.transactions.map(b64ToB58), session: s.session };
        break;
      case "signAndSendTransaction":
        method = "signAndSendTransaction";
        payload = { transaction: b64ToB58(req.transaction), session: s.session, ...(req.options ? { sendOptions: req.options } : {}) };
        break;
    }

    const rid = this.rid();
    let params: Record<string, string>;
    try {
      params = await this.open(requestUrl({ wallet, method, dappPublicKey, shared, payload, redirect: redirectLink(this.scheme, wallet, method, rid) }), rid, wallet);
    } catch (err) {
      // An expired or revoked session: forget it so the next connect starts fresh.
      if (/unauthori[sz]ed|session/i.test(String((err as Error)?.message))) await this.save(wallet, origin, null);
      throw err;
    }
    if (!params.data || !params.nonce) throw new Error("The wallet sent an incomplete response");
    const data = decryptPayload<Record<string, unknown>>(params.data, params.nonce, shared);

    switch (method) {
      case "signMessage":
        return { signature: b58ToB64(String(data.signature)) };
      case "signTransaction":
        return { transaction: b58ToB64(String(data.transaction)) };
      case "signAllTransactions":
        return { transactions: (data.transactions as string[]).map(b58ToB64) };
      case "signAndSendTransaction":
        return { signature: b58ToB64(String(data.signature)) };
    }
  }
}
