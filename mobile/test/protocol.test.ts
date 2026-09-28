import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { callbackError, connectUrl, decryptPayload, encryptPayload, parseCallback, redirectLink, requestUrl, sharedSecret } from "../src/wallet/protocol";
import { parseWalletRequest } from "../src/wallet/bridge-validate";

/** A pretend wallet app implementing its side of the deeplink protocol. */
function fakeWallet() {
  const kp = nacl.box.keyPair();
  const user = nacl.sign.keyPair();
  return {
    kp,
    user,
    approveConnect(url: string) {
      const u = new URL(url);
      const dapp = u.searchParams.get("dapp_encryption_public_key")!;
      const shared = nacl.box.before(bs58.decode(dapp), kp.secretKey);
      const { nonce, payload } = encryptPayload({ public_key: bs58.encode(user.publicKey), session: "sess-1" }, shared);
      const cb = new URL(u.searchParams.get("redirect_link")!);
      const params = new URLSearchParams({ phantom_encryption_public_key: bs58.encode(kp.publicKey), nonce, data: payload });
      return { url: `${u.searchParams.get("redirect_link")}?${params}`, appUrl: u.searchParams.get("app_url"), cb };
    },
    openRequest(url: string) {
      const u = new URL(url);
      const dapp = u.searchParams.get("dapp_encryption_public_key")!;
      const shared = nacl.box.before(bs58.decode(dapp), kp.secretKey);
      const body = decryptPayload<Record<string, unknown>>(u.searchParams.get("payload")!, u.searchParams.get("nonce")!, shared);
      return { body, shared, redirect: u.searchParams.get("redirect_link")!, method: u.pathname.split("/").pop() };
    },
  };
}

describe("deeplink protocol", () => {
  it("connects and signs a message end to end", () => {
    const wallet = fakeWallet();
    const dapp = nacl.box.keyPair();

    const url = connectUrl({ wallet: "phantom", dappPublicKey: dapp.publicKey, appUrl: "https://jup.ag", redirect: redirectLink("solanaos", "phantom", "connect", "r1") });
    expect(url.startsWith("https://phantom.app/ul/v1/connect?")).toBe(true);
    const back = wallet.approveConnect(url);
    expect(back.appUrl).toBe("https://jup.ag");

    const cb = parseCallback(back.url, "solanaos")!;
    expect(cb).toMatchObject({ wallet: "phantom", method: "connect", rid: "r1" });
    const shared = sharedSecret(cb.params.phantom_encryption_public_key, dapp.secretKey);
    const conn = decryptPayload<{ public_key: string; session: string }>(cb.params.data, cb.params.nonce, shared);
    expect(conn.public_key).toBe(bs58.encode(wallet.user.publicKey));

    const message = new TextEncoder().encode("Sign in to STRATA");
    const req = requestUrl({ wallet: "phantom", method: "signMessage", dappPublicKey: dapp.publicKey, shared, payload: { message: bs58.encode(message), session: conn.session, display: "utf8" }, redirect: redirectLink("solanaos", "phantom", "signMessage", "r2") });
    const opened = wallet.openRequest(req);
    expect(opened.method).toBe("signMessage");
    expect(opened.body.session).toBe("sess-1");
    const sig = nacl.sign.detached(bs58.decode(String(opened.body.message)), wallet.user.secretKey);
    const enc = encryptPayload({ signature: bs58.encode(sig) }, opened.shared);
    const cb2 = parseCallback(`${opened.redirect}?nonce=${enc.nonce}&data=${enc.payload}`, "solanaos")!;
    const out = decryptPayload<{ signature: string }>(cb2.params.data, cb2.params.nonce, shared);
    expect(nacl.sign.detached.verify(message, bs58.decode(out.signature), wallet.user.publicKey)).toBe(true);
  });

  it("uses Solflare's endpoints", () => {
    const url = connectUrl({ wallet: "solflare", dappPublicKey: new Uint8Array(32), appUrl: "https://x.com", redirect: "solanaos://wallet/solflare/connect/r" });
    expect(url.startsWith("https://solflare.com/ul/v1/connect?")).toBe(true);
  });

  it("rejects foreign or malformed callbacks and reads errors", () => {
    expect(parseCallback("solanaos://open?url=x", "solanaos")).toBeNull();
    expect(parseCallback("solanaos://wallet/evil/connect/r", "solanaos")).toBeNull();
    expect(parseCallback("solanaos://wallet/phantom/steal/r", "solanaos")).toBeNull();
    const cb = parseCallback("solanaos://wallet/phantom/signTransaction/r9?errorCode=4001&errorMessage=User%20rejected", "solanaos")!;
    expect(callbackError(cb.params)).toBe("Request rejected in the wallet");
    expect(callbackError({})).toBeNull();
  });

  it("fails loudly on tampered responses", () => {
    const shared = nacl.randomBytes(32);
    const enc = encryptPayload({ a: 1 }, shared);
    expect(() => decryptPayload(enc.payload, enc.nonce, nacl.randomBytes(32))).toThrow(/decrypt/);
  });
});

describe("page request validation", () => {
  it("accepts well-formed requests only", () => {
    expect(parseWalletRequest({ type: "connect", wallet: "phantom", silent: true })).toEqual({ type: "connect", wallet: "phantom", silent: true });
    expect(parseWalletRequest({ type: "signMessage", wallet: "solflare", message: "aGk=" })).toEqual({ type: "signMessage", wallet: "solflare", message: "aGk=" });
    expect(parseWalletRequest({ type: "signMessage", wallet: "phantom", message: "not base64!" })).toBeNull();
    expect(parseWalletRequest({ type: "connect", wallet: "metamask" })).toBeNull();
    expect(parseWalletRequest({ type: "exportKey", wallet: "phantom" })).toBeNull();
    expect(parseWalletRequest({ type: "signAndSendTransaction", wallet: "phantom", transaction: "AQID", options: { skipPreflight: true, evil: "x" } })).toEqual({
      type: "signAndSendTransaction",
      wallet: "phantom",
      transaction: "AQID",
      options: { skipPreflight: true },
    });
  });
});
