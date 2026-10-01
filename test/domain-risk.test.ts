import { describe, expect, it } from "vitest";
import { domainRisk } from "@/lib/services/security";

/** What the desktop address bar shows: high and medium warnings, except "not in the registry". */
const shown = (d: string) =>
  domainRisk(d.startsWith("http") ? d : `https://${d}/`)
    .indicators.filter((i) => i.level === "high" || (i.level === "medium" && i.id !== "registry"))
    .map((i) => `${i.level}:${i.id}`);

describe("domainRisk", () => {
  it("doesn't warn on official wallet, extension and ecosystem sites", () => {
    for (const d of ["phantom.app", "connect.phantom.app", "phantom.com", "backpack.exchange", "backpack.app", "solflare.com", "magiceden.us", "magiceden.io", "solana.fm", "docs.solana.com", "jup.ag", "raydium.io", "glow.app", "nightly.app"]) {
      expect([d, shown(d)]).toEqual([d, []]);
    }
  });

  it("doesn't warn on ordinary sites that only resemble an app's name", () => {
    for (const d of ["medium.com", "tensorflow.org", "driftwood.com", "orcasecurity.io", "google.com", "chromewebstore.google.com", "http://localhost:3000"]) {
      expect([d, shown(d)]).toEqual([d, []]);
    }
  });

  it("still flags typosquats, impersonation and airdrop bait", () => {
    expect(shown("phant0m.app")).toContain("high:lookalike");
    expect(shown("raydiurn.io")).toContain("high:lookalike");
    expect(shown("phanton.app")).toContain("high:lookalike");
    expect(shown("phantom-wallet-connect.com")).toContain("high:brand");
    expect(shown("solflare-support.net")).toContain("high:brand");
    expect(shown("jup-ag-claim.xyz")).toEqual(expect.arrayContaining(["high:brand", "high:bait"]));
    expect(shown("claim-airdrop-jup.com")).toContain("high:bait");
    expect(shown("http://example.com")).toContain("high:https");
  });

  it("mentions a brand without calling it phishing when there's no phishing word", () => {
    expect(shown("phantom-fans.com")).toEqual(["medium:brand"]);
  });
});
