const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeInput, riskFromReport, hostOf, WALLETS, mergeBookmarks } = require("../src/lib");

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

test("address bar: everything else searches Solana OS", () => {
  assert.equal(normalizeInput("what is trending", base), `${base}/search?q=what%20is%20trending`);
  assert.equal(normalizeInput("JUP", base), `${base}/search?q=JUP`);
  const addr = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  assert.equal(normalizeInput(addr, base), `${base}/search?q=${addr}`);
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
