import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HELIUS = "https://mainnet.helius-rpc.com/?api-key=00000000-0000-0000-0000-000000000000";
const PUBLIC = "https://api.mainnet-beta.solana.com";
const MINT = "6UhUkSBc9RBB9gVJcjCWtcQv4t771rQF7bdn2qK7pump";

type Handler = (url: string, body: { method: string; params: unknown[] }) => { status: number; json?: unknown };

function mockFetch(handler: Handler) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    calls.push(url);
    const r = handler(url, JSON.parse(init.body));
    return { ok: r.status < 400, status: r.status, statusText: r.status === 401 ? "Unauthorized" : "OK", json: async () => r.json } as Response;
  });
  return calls;
}

describe("RPC with a rejected API key", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SOLANA_RPC_URL = HELIUS;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SOLANA_RPC_URL;
  });

  it("falls back to the public RPC on 401 and keeps using it", async () => {
    const calls = mockFetch((url) => (url === HELIUS ? { status: 401 } : { status: 200, json: { result: { value: 42 } } }));
    const { getBalanceLamports } = await import("@/lib/providers/rpc");
    expect(await getBalanceLamports(MINT)).toBe(42);
    expect(calls).toEqual([HELIUS, PUBLIC]);
    await getBalanceLamports(MINT);
    expect(calls.slice(2)).toEqual([PUBLIC]);
  });

  it("does not hide other errors", async () => {
    mockFetch(() => ({ status: 500 }));
    const { getBalanceLamports } = await import("@/lib/providers/rpc");
    await expect(getBalanceLamports(MINT)).rejects.toThrow(/500/);
  });
});

describe("classifyAddress", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  const account = (value: unknown) => mockFetch(() => ({ status: 200, json: { result: { value } } }));

  it("tells tokens, wallets, token accounts, programs and unused addresses apart", async () => {
    const { classifyAddress } = await import("@/lib/services/account");
    account({ lamports: 1, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", executable: false, data: { parsed: { type: "mint", info: {} } } });
    expect((await classifyAddress(MINT)).type).toBe("mint");
    account({ lamports: 1, owner: "11111111111111111111111111111111", executable: false, data: ["", "base64"] });
    expect((await classifyAddress(MINT)).type).toBe("wallet");
    account({ lamports: 1, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", executable: false, data: { parsed: { type: "account", info: { owner: "W", mint: "M" } } } });
    expect(await classifyAddress(MINT)).toEqual({ type: "token_account", wallet: "W", mint: "M" });
    account({ lamports: 1, owner: "BPFLoaderUpgradeab1e11111111111111111111111", executable: true, data: ["", "base64"] });
    expect((await classifyAddress(MINT)).type).toBe("program");
    account(null);
    expect((await classifyAddress(MINT)).type).toBe("missing");
  });
});
