import crypto from "node:crypto";
import bs58 from "bs58";

/** Sign-In With Solana: human-readable message + ed25519 signature check. */

export function buildSignInMessage(opts: { domain: string; address: string; nonce: string; issuedAt: string }) {
  return [
    // Wallets treat "<site> wants you to sign in with your Solana account:" as
    // a Sign-In With Solana request and refuse it unless <site> is the page's
    // address, so the STRATA heading must not use that wording. The site the
    // message is for is on the URI line, which the server checks (a signature
    // made on a copycat site fails).
    "Sign in to STRATA with your Solana account:",
    opts.address,
    "",
    "This request will not trigger a blockchain transaction or cost any fees.",
    "",
    `URI: https://${opts.domain}`,
    "Version: 1",
    "Chain ID: mainnet",
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt}`,
  ].join("\n");
}

export function parseSignInMessage(message: string): { domain: string; address: string; nonce: string; issuedAt: string } | null {
  const lines = message.split("\n");
  if (!/^Sign in to STRATA with your Solana account:$| wants you to sign in/.test(lines[0] ?? "")) return null;
  const domain = message.match(/^URI: https:\/\/([^\s/]+)\/?$/m)?.[1];
  const address = lines[1]?.trim();
  const nonce = message.match(/^Nonce: (\S+)$/m)?.[1];
  const issuedAt = message.match(/^Issued At: (\S+)$/m)?.[1];
  if (!domain || !address || !nonce || !issuedAt) return null;
  return { domain, address, nonce, issuedAt };
}

export function verifyEd25519(message: string, signatureB58: string, addressB58: string): boolean {
  try {
    const pub = bs58.decode(addressB58);
    const sig = bs58.decode(signatureB58);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(pub).toString("base64url") }, format: "jwk" });
    return crypto.verify(null, Buffer.from(message, "utf8"), key, Buffer.from(sig));
  } catch {
    return false;
  }
}
