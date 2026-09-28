import { describe, expect, it } from "vitest";
import { decideNavigation, normalizeInput, parseIntentUrl, riskFromReport, walletBrowseUrl } from "../src/lib/url";

const BASE = "https://solos.example";

describe("normalizeInput", () => {
  it("opens URLs and bare domains, searches everything else", () => {
    expect(normalizeInput("https://jup.ag/swap", BASE)).toBe("https://jup.ag/swap");
    expect(normalizeInput("Axiom.trade", BASE)).toBe("https://Axiom.trade");
    expect(normalizeInput("what is jito", BASE)).toBe(`${BASE}/search?q=what%20is%20jito`);
    expect(normalizeInput("So11111111111111111111111111111111111111112", BASE)).toBe(`${BASE}/search?q=So11111111111111111111111111111111111111112`);
    expect(normalizeInput("", BASE)).toBe(BASE);
    expect(normalizeInput("javascript:alert(1)", BASE)).toBe(`${BASE}/search?q=javascript%3Aalert(1)`);
  });
});

describe("decideNavigation", () => {
  it("loads web pages", () => {
    expect(decideNavigation("https://jup.ag").kind).toBe("load");
    expect(decideNavigation("about:blank").kind).toBe("load");
  });
  it("hands wallet, payment and store links to other apps", () => {
    expect(decideNavigation("solana-wallet:/v1/associate/local?association=x&port=1234")).toEqual({ kind: "open", url: "solana-wallet:/v1/associate/local?association=x&port=1234" });
    expect(decideNavigation("solana:9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin?amount=1").kind).toBe("open");
    expect(decideNavigation("https://phantom.app/ul/browse/x").kind).toBe("open");
    expect(decideNavigation("https://phantom.app/download").kind).toBe("load");
    expect(decideNavigation("https://play.google.com/store/apps/details?id=x").kind).toBe("open");
  });
  it("asks before unknown schemes and blocks dangerous ones", () => {
    expect(decideNavigation("weird-app://do")).toEqual({ kind: "ask", url: "weird-app://do", scheme: "weird-app" });
    expect(decideNavigation("javascript:alert(1)").kind).toBe("block");
    expect(decideNavigation("file:///etc/passwd").kind).toBe("block");
  });
  it("parses Android intent links", () => {
    expect(parseIntentUrl("intent://scan/#Intent;scheme=zxing;package=com.google.zxing.client.android;S.browser_fallback_url=https%3A%2F%2Fexample.com;end")).toEqual({
      appUrl: "zxing://scan/",
      fallback: "https://example.com",
    });
    expect(parseIntentUrl("intent://x#Intent;S.browser_fallback_url=javascript%3Aalert(1);end")).toEqual({ appUrl: null, fallback: null });
  });
});

describe("helpers", () => {
  it("summarises security reports", () => {
    expect(riskFromReport({ indicators: [{ id: "lookalike", level: "high", label: "Lookalike domain", explanation: "x" }] })?.level).toBe("high");
    expect(riskFromReport({ indicators: [{ id: "registry", level: "low", label: "Known", value: "Jupiter" }] })?.label).toBe("Known app · Jupiter");
    expect(riskFromReport({})).toBeNull();
  });
  it("builds wallet browse links", () => {
    expect(walletBrowseUrl("phantom", "https://jup.ag/", BASE)).toBe("https://phantom.app/ul/browse/https%3A%2F%2Fjup.ag%2F?ref=https%3A%2F%2Fsolos.example");
    expect(walletBrowseUrl("solflare", "https://jup.ag/", BASE)).toBe("https://solflare.com/ul/v1/browse/https%3A%2F%2Fjup.ag%2F?ref=https%3A%2F%2Fsolos.example");
  });
});
