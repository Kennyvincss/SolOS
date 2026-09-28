// Runs the injected wallet script in a real Chromium page against the real
// @wallet-standard/app registry (what dApps use to discover wallets).
// Skipped when Playwright isn't installed.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectedScript, replyScript } from "../src/wallet/injected";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
function loadPlaywright(): Any {
  for (const p of ["playwright", `${execSync("npm root -g").toString().trim()}/playwright`]) {
    try {
      return require(p);
    } catch {
      /* next */
    }
  }
  return null;
}
function findWalletsJs(): string | null {
  for (const p of ["../node_modules/@wallet-standard/app/lib/esm/wallets.js", "../../node_modules/@wallet-standard/app/lib/esm/wallets.js"]) {
    try {
      return readFileSync(new URL(p, import.meta.url), "utf8");
    } catch {
      /* next */
    }
  }
  return null;
}

const pw = loadPlaywright();
const walletsJs = findWalletsJs();
const TOKEN = "tok123";

// Stand-in for the native side: checks the token and answers like the bridge does.
const nativeMock = `
window.__sent = [];
window.ReactNativeWebView = { postMessage: function (raw) {
  var m = JSON.parse(raw); window.__sent.push(m);
  if (m.token !== ${JSON.stringify(TOKEN)}) return;
  var r = m.req, v;
  if (r.type === "connect") v = r.silent ? null : { address: "Addr111", publicKey: btoa(String.fromCharCode.apply(null, new Array(32).fill(7))) };
  else if (r.type === "disconnect") v = null;
  else if (r.type === "signMessage") v = { signature: btoa("sig:" + atob(r.message)) };
  else if (r.type === "signTransaction") v = { transaction: btoa("signed:" + atob(r.transaction)) };
  else if (r.type === "signAllTransactions") v = { transactions: r.transactions.map(function (t) { return btoa("signed:" + atob(t)); }) };
  else if (r.type === "signAndSendTransaction") v = { signature: btoa("txsig") };
  setTimeout(function () { eval(${JSON.stringify(replyScript("__ID__", true, "__V__"))}.replace('"__ID__"', JSON.stringify(m.id)).replace('"__V__"', JSON.stringify(v))); }, 5);
} };`;

describe.skipIf(!pw || !walletsJs)("injected wallets in a browser", () => {
  let browser: Any;
  let page: Any;

  beforeAll(async () => {
    browser = await pw!.chromium.launch();
    page = await browser.newPage({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 SolanaOSMobile/0.1.0" });
    await page.route("https://dapp.test/**", (route: Any) => {
      const url = route.request().url();
      if (url.endsWith("/wallets.js")) return route.fulfill({ contentType: "text/javascript", body: walletsJs! });
      if (url.endsWith("/frame")) return route.fulfill({ contentType: "text/html", body: "<p>frame</p>" });
      return route.fulfill({
        contentType: "text/html",
        body: `<html><body><iframe src="/frame"></iframe><script type="module">import { getWallets } from "/wallets.js"; window.walletsApi = getWallets(); window.appReady = true;</script></body></html>`,
      });
    });
    await page.addInitScript({ content: nativeMock + "\n" + injectedScript({ token: TOKEN, wallets: [{ id: "phantom", name: "Phantom", color: "#ab9ff2" }, { id: "solflare", name: "Solflare", color: "#fc7227" }], cleanUserAgent: true }) });
    await page.goto("https://dapp.test/");
    await page.waitForFunction(() => (window as unknown as { appReady?: boolean }).appReady);
  });
  afterAll(async () => browser?.close());

  it("registers Phantom and Solflare with the Wallet Standard", async () => {
    const wallets = await page.evaluate(() => (window as any).walletsApi.get().map((w: any) => ({ name: w.name, chains: w.chains, features: Object.keys(w.features), icon: w.icon.slice(0, 26) })));
    expect(wallets.map((w: { name: string }) => w.name)).toEqual(["Phantom", "Solflare"]);
    expect(wallets[0].chains).toContain("solana:mainnet");
    expect(wallets[0].features).toEqual(expect.arrayContaining(["standard:connect", "standard:events", "solana:signMessage", "solana:signTransaction", "solana:signAndSendTransaction"]));
    expect(wallets[0].icon).toBe("data:image/svg+xml;base64,");
  });

  it("connects, signs and sends through the native bridge", async () => {
    const r = await page.evaluate(async () => {
      const dec = (u: Uint8Array) => String.fromCharCode(...u);
      const enc = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
      const w = (window as any).walletsApi.get()[0];
      const changes: number[] = [];
      w.features["standard:events"].on("change", (p: any) => changes.push(p.accounts.length));
      const silent = await w.features["standard:connect"].connect({ silent: true });
      const { accounts } = await w.features["standard:connect"].connect();
      const account = accounts[0];
      const [msg] = await w.features["solana:signMessage"].signMessage({ account, message: enc("hello") });
      const [one] = await w.features["solana:signTransaction"].signTransaction({ account, transaction: enc("tx1") });
      const many = await w.features["solana:signTransaction"].signTransaction({ account, transaction: enc("a") }, { account, transaction: enc("b") });
      const [sent] = await w.features["solana:signAndSendTransaction"].signAndSendTransaction({ account, transaction: enc("tx2"), chain: "solana:mainnet" });
      let notConnected = "";
      await w.features["standard:disconnect"].disconnect();
      try {
        await w.features["solana:signMessage"].signMessage({ account, message: enc("x") });
      } catch (e) {
        notConnected = (e as Error).message;
      }
      return {
        silent: silent.accounts.length,
        address: account.address,
        pkLen: account.publicKey.length,
        msg: dec(msg.signature),
        one: dec(one.signedTransaction),
        many: many.map((m: any) => dec(m.signedTransaction)),
        sent: dec(sent.signature),
        changes,
        notConnected,
        types: (window as any).__sent.map((m: any) => m.req.type),
      };
    });
    expect(r).toMatchObject({ silent: 0, address: "Addr111", pkLen: 32, msg: "sig:hello", one: "signed:tx1", many: ["signed:a", "signed:b"], sent: "txsig", changes: [1, 0], notConnected: "Account not connected" });
    expect(r.types).toEqual(["connect", "connect", "signMessage", "signTransaction", "signAllTransactions", "signAndSendTransaction", "disconnect"]);
  });

  it("hides the Android WebView markers so sites offer Mobile Wallet Adapter", async () => {
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).not.toMatch(/; wv\)|Version\/4\.0/);
    expect(ua).toContain("SolanaOSMobile/0.1.0");
  });

  it("does not run inside iframes, and the page can't read the token", async () => {
    const frame = page.frames().find((f: Any) => f.url().endsWith("/frame"))!;
    expect(await frame.evaluate(() => typeof (window as any).__solanaOS)).toBe("undefined");
    const html = await page.evaluate(() => JSON.stringify(Object.keys(window).filter((k) => /token/i.test(k))));
    expect(html).toBe("[]");
  });
});
