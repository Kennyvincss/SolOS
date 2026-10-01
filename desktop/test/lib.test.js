const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeInput, routeInput, classifyUrl, normalizeOrder, moveInOrder, folderForType, riskFromReport, hostOf, WALLETS, mergeBookmarks } = require("../src/lib");

test("bookmark sync: newest change per URL wins, deletions propagate", () => {
  const local = {
    "https://jup.ag/": { title: "Jupiter", createdAt: 1, updatedAt: 10 },
    "https://kamino.finance/": { title: "Kamino", createdAt: 2, updatedAt: 5 },
  };
  const remote = {
    "https://jup.ag/": { title: "Jupiter", createdAt: 1, updatedAt: 20, deleted: true }, // deleted later elsewhere
    "https://kamino.finance/": { title: "Old", createdAt: 2, updatedAt: 1 }, // older than local
    "https://drift.trade/": { title: "Drift", createdAt: 3, updatedAt: 3 }, // new elsewhere
  };
  const m = mergeBookmarks(local, remote);
  assert.equal(m["https://jup.ag/"].deleted, true);
  assert.equal(m["https://kamino.finance/"].title, "Kamino");
  assert.equal(m["https://drift.trade/"].title, "Drift");
  assert.deepEqual(mergeBookmarks({}, {}), {});
});

const base = "https://solanaos.example";

test("address bar: URLs and domains open directly", () => {
  assert.equal(normalizeInput("https://jup.ag/swap", base), "https://jup.ag/swap");
  assert.equal(normalizeInput("jup.ag", base), "https://jup.ag");
  assert.equal(normalizeInput("app.kamino.finance/lending", base), "https://app.kamino.finance/lending");
  assert.equal(normalizeInput("localhost:3000", base), "http://localhost:3000");
  assert.equal(normalizeInput("", base), base);
});

test("address bar: universal STRATA search", () => {
  assert.equal(normalizeInput("best solana prediction markets", base), `${base}/search?q=best%20solana%20prediction%20markets`);
  // Tickers and addresses are resolved by STRATA (token page, wallet explorer…).
  assert.equal(normalizeInput("BONK", base), `${base}/open?q=BONK`);
  assert.equal(normalizeInput("$wif", base), `${base}/open?q=%24wif`);
  const addr = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  assert.equal(normalizeInput(addr, base), `${base}/open?q=${addr}`);
  const sig = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
  assert.equal(normalizeInput(sig, base), `${base}/tx/${sig}`);
  // Requests about "this" page go to STRATA AI.
  assert.deepEqual(routeInput("Analyze this wallet", base), { kind: "ai", prompt: "Analyze this wallet" });
  assert.deepEqual(routeInput("explain this transaction", base), { kind: "ai", prompt: "explain this transaction" });
  assert.equal(routeInput("what is trending", base).kind, "url");
  assert.deepEqual(routeInput("strata://tokens", base), { kind: "url", url: `${base}/tokens` });
  // Not domains: words with dots but no real TLD.
  assert.equal(normalizeInput("v1.2", base), `${base}/search?q=v1.2`);
});

test("page types for history and bookmarks", () => {
  assert.equal(classifyUrl(`${base}/tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`, base), "token");
  assert.equal(classifyUrl(`${base}/wallets/abc`, base), "wallet");
  assert.equal(classifyUrl(`${base}/tx/abc`, base), "transaction");
  assert.equal(classifyUrl("https://solscan.io/tx/abc", base), "transaction");
  assert.equal(classifyUrl("https://solscan.io/account/abc", base), "wallet");
  assert.equal(classifyUrl("https://dexscreener.com/solana/abc", base), "token");
  assert.equal(classifyUrl("https://polymarket.com/event/x", base), "market");
  assert.equal(classifyUrl("https://magiceden.io/marketplace/x", base), "nft");
  assert.equal(classifyUrl("https://docs.kamino.finance/", base), "research");
  assert.equal(classifyUrl("https://jup.ag/swap", base, new Set(["jup.ag"])), "app");
  assert.equal(classifyUrl("https://example.com/", base), "website");
  assert.equal(folderForType("token"), "f-trading");
});

test("tab order: pinned first, groups kept together", () => {
  const tabs = new Map([
    [1, { pinned: false }],
    [2, { pinned: true }],
    [3, { groupId: "g" }],
    [4, {}],
    [5, { groupId: "g" }],
  ]);
  assert.deepEqual(normalizeOrder([1, 2, 3, 4, 5], tabs), [2, 1, 3, 5, 4]);
  assert.deepEqual(moveInOrder([1, 2, 3], 1, 2), [2, 3, 1]);
  assert.deepEqual(moveInOrder([1, 2, 3], 3, 0), [3, 1, 2]);
});

test("risk badge summarises the worst indicator", () => {
  assert.deepEqual(riskFromReport({ indicators: [{ id: "registry", level: "medium", label: "App registry", explanation: "x" }, { id: "bait", level: "high", label: "Bait keywords", explanation: "y" }] }), { level: "high", label: "Bait keywords", detail: "y" });
  assert.equal(riskFromReport({ indicators: [{ id: "registry", level: "low", label: "App registry", value: "jup.ag", explanation: "z" }] }).label, "Known app · jup.ag");
  assert.equal(riskFromReport({}), null);
});

test("hostOf ignores non-web URLs", () => {
  assert.equal(hostOf("https://www.jup.ag/x"), "jup.ag");
  assert.equal(hostOf("chrome-extension://abc/popup.html"), null);
});

test("wallet extension IDs look like Chrome Web Store IDs", () => {
  for (const w of WALLETS) assert.match(w.id, /^[a-p]{32}$/);
});
