import { afterEach, describe, expect, it, vi } from "vitest";
import { isSolanaRelated, parseBing, parseDuckDuckGo, webSearch } from "@/lib/providers/websearch";

const b64 = (u: string) => Buffer.from(u).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
// Shaped like Bing's real result page (captured in CI).
const bingPage = (items: { url: string; title: string; snippet: string }[]) =>
  `<ol id="b_results" class="">${items
    .map(
      (i) => `<li class="b_algo" data-id iid=SERP.5349><div class="b_tpcn"><a class="tilk" href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${b64(i.url)}&amp;ntb=1"><cite>${i.url}</cite></a></div><h2 class=""><a target="_blank" href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;ptn=3&amp;u=a1${b64(i.url)}&amp;ntb=1" h="ID=SERP,5146.2">${i.title}</a></h2><div class="b_caption"><p class="b_lineclamp2" data-rslinkclamp-iid="">${i.snippet}</p></div></li>`,
    )
    .join("")}</ol>`;

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

describe("parseBing", () => {
  it("reads titles, the real addresses behind Bing's links, and snippets", () => {
    const r = parseBing(bingPage([
      { url: "https://modrinth.com/mod/axiom", title: "<strong>Axiom</strong> - Minecraft Mod - Modrinth", snippet: "Mar 3, 2024 · A building mod" },
      { url: "https://axiom.trade/", title: "Axiom", snippet: "Trade on <strong>Solana</strong>" },
    ]));
    expect(r).toEqual([
      { title: "Axiom - Minecraft Mod - Modrinth", url: "https://modrinth.com/mod/axiom", snippet: "A building mod", source: "bing" },
      { title: "Axiom", url: "https://axiom.trade/", snippet: "Trade on Solana", source: "bing" },
    ]);
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

  const wiki = (pages: { key: string; title: string }[]) => new Response(JSON.stringify({ pages: pages.map((p) => ({ ...p, description: "", excerpt: "" })) }), { status: 200 });

  it("returns results from the whole web with Solana results first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("wikipedia.org")) return wiki([{ key: "Axiom", title: "Axiom" }, { key: "Ubuntu", title: "Ubuntu" }]);
        const q = new URL(url).searchParams.get("q");
        if (q === "axiom") {
          return new Response(bingPage([
            { url: "https://en.wikipedia.org/wiki/Axiom", title: "Axiom - Wikipedia", snippet: "An axiom is a statement" },
            { url: "https://www.axiomspace.com/", title: "Axiom Space", snippet: "Commercial space station" },
            { url: "https://axiom.trade/", title: "Axiom", snippet: "Trade on Solana" },
          ]), { status: 200 });
        }
        return new Response(bingPage([
          { url: "https://axiom.trade/", title: "Axiom", snippet: "Trade on Solana" },
          { url: "https://dexscreener.com/solana/axiom", title: "AXIOM price", snippet: "" },
          { url: "https://example.com/unrelated", title: "Unrelated", snippet: "nothing here" },
        ]), { status: 200 });
      }),
    );
    const r = await webSearch("axiom");
    expect(r.sources).toEqual(["Bing", "Wikipedia"]);
    expect(r.results.map((x) => [x.url, x.solana])).toEqual([
      ["https://axiom.trade/", true],
      ["https://dexscreener.com/solana/axiom", true],
      ["https://en.wikipedia.org/wiki/Axiom", false],
      ["https://www.axiomspace.com/", false],
    ]);
  });

  it("uses DuckDuckGo when Bing doesn't answer, and drops unrelated Wikipedia articles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("bing.com")) return new Response("blocked", { status: 429 });
        if (url.includes("wikipedia.org")) return wiki([{ key: "Ubuntu", title: "Ubuntu" }]);
        return new Response(ddgPage([{ url: "https://stonk.example/launchpad", title: "Stonk Launchpad", snippet: "Launch tokens on Solana" }]), { status: 200 });
      }),
    );
    const r = await webSearch("stonk launchpad");
    expect(r.sources).toEqual(["DuckDuckGo"]);
    expect(r.results.map((x) => x.url)).toEqual(["https://stonk.example/launchpad"]);
  });

  it("fails cleanly when no search service answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(webSearch("nothing answers")).rejects.toThrow();
  });
});
