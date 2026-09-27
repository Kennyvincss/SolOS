import { describe, expect, it } from "vitest";
import { levenshtein, scoreDoc } from "@/lib/search/fuzzy";
import { detectIntent } from "@/lib/search/intent";
import { parseFeed, categorizeNews } from "@/lib/providers/news";
import { buildSignInMessage, parseSignInMessage, verifyEd25519 } from "@/lib/auth/siws";
import { manifestSchema, createHost, PermissionError } from "@/lib/extensions/sdk";
import { EXTENSIONS } from "@/lib/extensions/catalog";
import { APPS } from "@/lib/catalog/apps";
import crypto from "node:crypto";
import bs58 from "bs58";

describe("fuzzy scoring", () => {
  it("ranks exact and prefix matches highest", () => {
    expect(scoreDoc("jupiter", "Jupiter")).toBe(1);
    expect(scoreDoc("jup", "Jupiter")).toBeGreaterThan(0.8);
    expect(scoreDoc("jupitr", "Jupiter")).toBeGreaterThan(0.5); // typo tolerance
    expect(scoreDoc("lending", "Kamino", ["Lending, liquidity and leverage"])).toBeGreaterThan(0.3);
    expect(scoreDoc("zzzz", "Jupiter")).toBe(0);
  });
  it("computes edit distance", () => {
    expect(levenshtein("jup.ag", "jup.ag")).toBe(0);
    expect(levenshtein("jup.ag", "jupp.ag")).toBe(1);
  });
});

describe("intent detection", () => {
  const cases: [string, string][] = [
    ["What Solana tokens are trending today?", "trending_tokens"],
    ["What are whales buying?", "whales"],
    ["Find Solana prediction markets", "prediction_markets"],
    ["Show me new Solana apps", "new_apps"],
    ["What's happening on Solana today?", "today"],
    ["What can I do with my USDC?", "yield"],
    ["Compare Kamino vs marginfi", "compare"],
    ["defi apps", "category"],
    ["Show me my portfolio", "portfolio"],
    ["jupiter", "lookup"],
    ["Explain how staking rewards are calculated on Solana", "yield"],
    ["Why do transactions need priority fees?", "question"],
  ];
  for (const [q, type] of cases) {
    it(`"${q}" → ${type}`, () => expect(detectIntent(q).type).toBe(type));
  }
  it("routes addresses and signatures", () => {
    const addr = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    expect(detectIntent(`Analyze ${addr}`)).toMatchObject({ type: "analyze_wallet", href: `/wallets/${addr}` });
    expect(detectIntent(`is ${addr} a scam?`).type).toBe("security");
  });
});

describe("news parsing", () => {
  it("parses RSS items with CDATA and entities", () => {
    const xml = `<rss><channel><item><title><![CDATA[Solana &amp; friends ship Firedancer]]></title><link>https://example.com/a</link><pubDate>Mon, 01 Sep 2025 10:00:00 GMT</pubDate><description>&lt;p&gt;Validator client news&lt;/p&gt;</description></item></channel></rss>`;
    const [item] = parseFeed(xml, "Example");
    expect(item.title).toBe("Solana & friends ship Firedancer");
    expect(item.url).toBe("https://example.com/a");
    expect(item.summary).toBe("Validator client news");
    expect(categorizeNews(item.title, item.summary)).toContain("Infrastructure");
  });
});

describe("Sign-In With Solana", () => {
  it("verifies a real ed25519 signature and rejects tampering", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "jwk" }).x!;
    const address = bs58.encode(Buffer.from(raw, "base64url"));
    const message = buildSignInMessage({ domain: "solanaos.app", address, nonce: "abc123", issuedAt: new Date().toISOString() });
    const sig = bs58.encode(crypto.sign(null, Buffer.from(message), privateKey));
    expect(parseSignInMessage(message)).toMatchObject({ domain: "solanaos.app", address, nonce: "abc123" });
    expect(verifyEd25519(message, sig, address)).toBe(true);
    expect(verifyEd25519(message.replace("abc123", "zzz999"), sig, address)).toBe(false);
  });
});

describe("extension SDK", () => {
  it("built-in manifests are valid", () => {
    for (const m of EXTENSIONS) expect(manifestSchema.safeParse(m).success, m.id).toBe(true);
  });
  it("enforces declared permissions", async () => {
    const m = EXTENSIONS.find((e) => e.id === "solanaos.network-monitor")!;
    const host = createHost(m, {
      fetchJson: async () => ({ ok: true }),
      getConnectedWallet: () => null,
      getPref: () => undefined,
      setPref: () => {},
      notify: () => {},
    });
    await expect(host.network.status()).resolves.toEqual({ ok: true });
    await expect(host.wallet.connected()).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("app catalog", () => {
  it("has unique slugs and valid URLs", () => {
    const slugs = new Set<string>();
    for (const a of APPS) {
      expect(slugs.has(a.slug), a.slug).toBe(false);
      slugs.add(a.slug);
      expect(() => new URL(a.website)).not.toThrow();
    }
  });
});
