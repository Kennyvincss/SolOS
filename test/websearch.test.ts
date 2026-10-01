import { afterEach, describe, expect, it, vi } from "vitest";
import { isSolanaRelated, parseDuckDuckGo, webSearch } from "@/lib/providers/websearch";

const ddgPage = (items: { url: string; title: string; snippet: string; ad?: boolean }[]) =>
  `<html><body>${items
    .map(
      (i) => `<div class="result results_links results_links_deep web-result ${i.ad ? "result--ad" : ""}"><div class="links_main links_deep result__body">
  <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(i.url)}&amp;rut=abc">${i.title}</a></h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(i.url)}">${i.snippet}</a></div></div>`,
    )
    .join("\n")}</body></html>`;

describe("parseDuckDuckGo", () => {
  it("reads titles, real URLs and snippets, and skips ads", () => {
    const html = ddgPage([
      { url: "https://axiom.trade/", title: "<b>Axiom</b> Trade", snippet: "Trade memecoins on <b>Solana</b> &amp; more" },
      { url: "https://ads.example.com/", title: "Ad", snippet: "buy", ad: true },
      { url: "https://en.wikipedia.org/wiki/Axiom", title: "Axiom - Wikipedia", snippet: "An axiom is a statement" },
    ]);
    const r = parseDuckDuckGo(html);
    expect(r.map((x) => x.url)).toEqual(["https://axiom.trade/", "https://en.wikipedia.org/wiki/Axiom"]);
    expect(r[0]).toMatchObject({ title: "Axiom Trade", snippet: "Trade memecoins on Solana & more", source: "duckduckgo" });
  });
});

describe("isSolanaRelated", () => {
  it("recognises Solana sites and pages about Solana", () => {
    expect(isSolanaRelated({ title: "Swap", url: "https://jup.ag/swap", snippet: "" })).toBe(true);
    expect(isSolanaRelated({ title: "AXIOM", url: "https://dexscreener.com/solana/abc", snippet: "" })).toBe(true);
    expect(isSolanaRelated({ title: "Axiom Trade", url: "https://axiom.trade", snippet: "The gateway to DeFi on Solana" })).toBe(true);
    expect(isSolanaRelated({ title: "Axiom - Wikipedia", url: "https://en.wikipedia.org/wiki/Axiom", snippet: "An axiom is a statement taken to be true" })).toBe(false);
  });
});

describe("webSearch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns results from the whole web with Solana results first", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("wikipedia.org")) {
        return new Response(JSON.stringify({ pages: [{ key: "Axiom_(disambiguation)", title: "Axiom (disambiguation)", description: "Topics referred to by the same term", excerpt: "<span>Axiom</span> may refer to" }] }), { status: 200 });
      }
      const q = new URLSearchParams(String(init?.body)).get("q");
      if (q === "axiom") {
        return new Response(ddgPage([
          { url: "https://en.wikipedia.org/wiki/Axiom", title: "Axiom - Wikipedia", snippet: "An axiom is a statement" },
          { url: "https://www.axiomspace.com/", title: "Axiom Space", snippet: "Commercial space station" },
          { url: "https://axiom.trade/", title: "Axiom", snippet: "Trade on Solana" },
        ]), { status: 200 });
      }
      return new Response(ddgPage([
        { url: "https://axiom.trade/", title: "Axiom", snippet: "Trade on Solana" },
        { url: "https://dexscreener.com/solana/axiom", title: "AXIOM price", snippet: "" },
        { url: "https://example.com/unrelated", title: "Unrelated", snippet: "nothing here" },
      ]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await webSearch("axiom");
    expect(r.sources).toEqual(["DuckDuckGo", "Wikipedia"]);
    expect(r.results.map((x) => [x.url, x.solana])).toEqual([
      ["https://axiom.trade/", true],
      ["https://dexscreener.com/solana/axiom", true],
      ["https://en.wikipedia.org/wiki/Axiom", false],
      ["https://www.axiomspace.com/", false],
      ["https://en.wikipedia.org/wiki/Axiom_(disambiguation)", false],
    ]);
  });

  it("fails cleanly when no search service answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(webSearch("nothing answers")).rejects.toThrow();
  });
});
