import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyUrl, idsInUrl } from "@/lib/library/classify";
import { makeZip, crc32 } from "@/lib/developer/zip";
import { starterFiles } from "@/lib/developer/templates";

let session: { uid: string } | null = { uid: "email:abc" };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));
vi.mock("@/lib/services/account", () => ({
  classifyAddress: async (a: string) => (a.startsWith("Mint") ? { type: "mint" } : a.startsWith("Prog") ? { type: "program" } : { type: "wallet" }),
}));
vi.mock("@/lib/search/engine", () => ({
  search: async () => ({ groups: [{ hits: [{ kind: "token", title: "Bonk", href: "/tokens/DezX", meta: { symbol: "BONK" } }] }] }),
}));

const HOME = "https://strata.example";

describe("page types", () => {
  it("labels STRATA pages and common onchain sites", () => {
    expect(classifyUrl(`${HOME}/tokens/abc`, HOME)).toBe("token");
    expect(classifyUrl(`${HOME}/wallets/abc`, HOME)).toBe("wallet");
    expect(classifyUrl(`${HOME}/tx/abc`, HOME)).toBe("transaction");
    expect(classifyUrl("https://solscan.io/tx/abc", HOME)).toBe("transaction");
    expect(classifyUrl("https://polymarket.com/event/x", HOME)).toBe("market");
    expect(classifyUrl("https://tensor.trade/trade/x", HOME)).toBe("nft");
    expect(classifyUrl("https://docs.jup.ag/", HOME)).toBe("research");
    expect(classifyUrl("https://example.com", HOME)).toBe("website");
  });
  it("finds ids in page URLs", () => {
    const sig = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
    expect(idsInUrl(`https://solscan.io/tx/${sig}`).signature).toBe(sig);
    expect(idsInUrl(`${HOME}/tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`).address).toBe("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN");
  });
});

describe("/open", () => {
  it("sends tickers, addresses and signatures to the right page", async () => {
    const { GET } = await import("@/app/open/route");
    const loc = async (q: string) => new URL((await GET(new Request(`${HOME}/open?q=${encodeURIComponent(q)}`))).headers.get("location")!).pathname + new URL((await GET(new Request(`${HOME}/open?q=${encodeURIComponent(q)}`))).headers.get("location")!).search;
    expect(await loc("BONK")).toBe("/tokens/DezX");
    expect(await loc("$bonk")).toBe("/tokens/DezX");
    expect(await loc("MintAddr1111111111111111111111111111111")).toBe("/tokens/MintAddr1111111111111111111111111111111");
    expect(await loc("ProgAddr1111111111111111111111111111111")).toBe("/security?q=ProgAddr1111111111111111111111111111111");
    expect(await loc("WaLLet11111111111111111111111111111111111")).toBe("/wallets/WaLLet11111111111111111111111111111111111");
    const sig = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
    expect(await loc(sig)).toBe(`/tx/${sig}`);
    expect(await loc("NOTATOKEN")).toBe("/search?q=NOTATOKEN");
  });
});

describe("send to devices", () => {
  const db = new Map<string, string>();
  beforeEach(() => {
    session = { uid: "email:abc" };
    db.clear();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const [cmd, key, value] = JSON.parse(String(init.body)) as string[];
        if (cmd === "GET") return Response.json({ result: db.get(key) ?? null });
        if (cmd === "GETDEL") {
          const v = db.get(key) ?? null;
          db.delete(key);
          return Response.json({ result: v });
        }
        if (cmd === "SET") db.set(key, value);
        return Response.json({ result: "OK" });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("registers devices, sends a tab and delivers it once", async () => {
    const devices = await import("@/app/api/devices/route");
    const send = await import("@/app/api/devices/send/route");
    const inbox = await import("@/app/api/devices/inbox/route");
    const post = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await devices.POST(post(`${HOME}/api/devices`, { id: "desktop-0001", name: "Kenny's PC", type: "desktop", app: "desktop" }))).status).toBe(200);
    expect((await devices.POST(post(`${HOME}/api/devices`, { id: "phone-00001", name: "STRATA on Android", type: "mobile", app: "mobile" }))).status).toBe(200);
    const list = await (await devices.GET(new Request(`${HOME}/api/devices?current=desktop-0001`))).json();
    expect(list.devices).toHaveLength(2);
    expect(list.devices.find((d: { id: string }) => d.id === "desktop-0001").current).toBe(true);
    expect((await send.POST(post(`${HOME}/api/devices/send`, { to: "phone-00001", from: "desktop-0001", url: "https://jup.ag/swap", title: "Jupiter" }))).status).toBe(200);
    expect((await send.POST(post(`${HOME}/api/devices/send`, { to: "not-mine-000", from: "desktop-0001", url: "https://jup.ag", title: "" }))).status).toBe(404);
    const first = await (await inbox.GET(new Request(`${HOME}/api/devices/inbox?device=phone-00001`))).json();
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ url: "https://jup.ag/swap", fromName: "Kenny's PC" });
    const again = await (await inbox.GET(new Request(`${HOME}/api/devices/inbox?device=phone-00001`))).json();
    expect(again.items).toHaveLength(0);
    session = null;
    expect((await devices.GET(new Request(`${HOME}/api/devices`))).status).toBe(401);
  });
});

describe("developer starters", () => {
  it("builds a valid zip", async () => {
    const files = starterFiles({ kind: "extension", name: "Whale Watcher", description: "Watches whales on Solana.", version: "1.0.0", permissions: ["storage"], matches: ["https://jup.ag/*"], home: HOME });
    expect(Object.keys(files)).toContain("whale-watcher/manifest.json");
    const manifest = JSON.parse(files["whale-watcher/manifest.json"]);
    expect(manifest.manifest_version).toBe(3);
    const zip = new Uint8Array(await makeZip(files).arrayBuffer());
    // End of central directory record, with the right file count.
    const end = zip.length - 22;
    const view = new DataView(zip.buffer);
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(Object.keys(files).length);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
