import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let session: { uid: string } | null = { uid: "email:abc" };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));

const { GET, PUT } = await import("@/app/api/sync/[scope]/route");

const db = new Map<string, string>();
const params = (scope: string) => ({ params: Promise.resolve({ scope }) });

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
      db.set(key, value);
      return Response.json({ result: "OK" });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("account sync API", () => {
  it("stores and returns data per user and scope", async () => {
    expect(await (await GET(new Request("http://x"), params("web"))).json()).toEqual({ data: null, updatedAt: 0 });
    const put = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ data: { watchlist: ["JUP"] } }) }), params("web"));
    expect(put.status).toBe(200);
    const got = await (await GET(new Request("http://x"), params("web"))).json();
    expect(got.data).toEqual({ watchlist: ["JUP"] });
    expect(got.updatedAt).toBeGreaterThan(0);
    // Other scopes and other users are separate.
    expect((await (await GET(new Request("http://x"), params("desktop"))).json()).data).toBeNull();
    session = { uid: "email:other" };
    expect((await (await GET(new Request("http://x"), params("web"))).json()).data).toBeNull();
  });

  it("requires sign-in, a known scope, valid data and a size limit", async () => {
    session = null;
    expect((await GET(new Request("http://x"), params("web"))).status).toBe(401);
    session = { uid: "email:abc" };
    expect((await GET(new Request("http://x"), params("passwords"))).status).toBe(404);
    expect((await PUT(new Request("http://x", { method: "PUT", body: "[1,2]" }), params("web"))).status).toBe(400);
    expect((await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ data: { big: "x".repeat(600_000) } }) }), params("web"))).status).toBe(413);
  });

  it("reports 501 when sync storage isn't configured", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect((await GET(new Request("http://x"), params("web"))).status).toBe(501);
  });
});
