import { PUBLIC_RPC, config } from "../config";
import { fetchJson, UpstreamError } from "./http";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../solana/constants";

/**
 * Minimal Solana JSON-RPC client. Works with the public endpoint and any
 * provider (Helius, Triton, QuickNode...) via SOLANA_RPC_URL.
 */

let rpcId = 0;

/** When the configured RPC rejects our key, use the public endpoint for a while. */
let customRejectedUntil = 0;
const REJECTED_STATUSES = new Set([401, 402, 403]);

async function call<T>(url: string, method: string, params: unknown[], timeoutMs: number): Promise<T> {
  const res = await fetchJson<{ result?: T; error?: { code: number; message: string } }>(url, {
    body: { jsonrpc: "2.0", id: ++rpcId, method, params },
    timeoutMs,
  });
  if (res.error) throw new UpstreamError(`RPC ${method}: ${res.error.message}`, res.error.code);
  return res.result as T;
}

const rateLimited = (e: unknown) => e instanceof UpstreamError && (e.status === 429 || e.status === -32429 || /rate|too many/i.test(e.message));

/** Rate limits are usually momentary: try again twice, briefly, before giving up. */
async function callWithRetry<T>(url: string, method: string, params: unknown[], timeoutMs: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call<T>(url, method, params, timeoutMs);
    } catch (e) {
      if (attempt >= 2 || !rateLimited(e)) throw e;
      await new Promise((r) => setTimeout(r, 400 + attempt * 600 + Math.random() * 200));
    }
  }
}

export async function rpc<T>(method: string, params: unknown[] = [], timeoutMs = 10000): Promise<T> {
  const custom = config.rpcUrl !== PUBLIC_RPC;
  if (!custom || Date.now() < customRejectedUntil) return callWithRetry<T>(PUBLIC_RPC, method, params, timeoutMs);
  try {
    return await callWithRetry<T>(config.rpcUrl, method, params, timeoutMs);
  } catch (e) {
    // An invalid, expired or out-of-credit API key shouldn't take wallets offline.
    if (e instanceof UpstreamError && e.status !== undefined && REJECTED_STATUSES.has(e.status)) {
      customRejectedUntil = Date.now() + 5 * 60 * 1000;
      console.warn(`[solana-os] SOLANA_RPC_URL rejected the request (HTTP ${e.status}); using the public Solana RPC for now. Check the RPC API key.`);
      return callWithRetry<T>(PUBLIC_RPC, method, params, timeoutMs);
    }
    throw e;
  }
}

/** Several calls in one HTTP request (JSON-RPC batch). Failed calls come back as null. */
export async function rpcBatch<T>(calls: { method: string; params: unknown[] }[], timeoutMs = 20000): Promise<(T | null)[]> {
  if (!calls.length) return [];
  const send = async (url: string) => {
    const body = calls.map((c) => ({ jsonrpc: "2.0", id: ++rpcId, method: c.method, params: c.params }));
    const res = await fetchJson<{ id: number; result?: T; error?: unknown }[]>(url, { body, timeoutMs });
    const byId = new Map((Array.isArray(res) ? res : []).map((r) => [r.id, r]));
    return body.map((b) => (byId.get(b.id)?.result ?? null) as T | null);
  };
  const custom = config.rpcUrl !== PUBLIC_RPC;
  if (!custom || Date.now() < customRejectedUntil) return send(PUBLIC_RPC);
  try {
    return await send(config.rpcUrl);
  } catch (e) {
    if (e instanceof UpstreamError && e.status !== undefined && REJECTED_STATUSES.has(e.status)) {
      customRejectedUntil = Date.now() + 5 * 60 * 1000;
      return send(PUBLIC_RPC);
    }
    throw e;
  }
}

/** True while the configured RPC is being skipped because it rejected our key. */
export function customRpcRejected(): boolean {
  return Date.now() < customRejectedUntil;
}

export interface ParsedTokenAccount {
  pubkey: string;
  account: {
    owner: string;
    data: {
      parsed: {
        info: {
          mint: string;
          owner: string;
          state?: string;
          tokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString: string };
        };
      };
    };
  };
}

export async function getBalanceLamports(address: string): Promise<number> {
  const r = await rpc<{ value: number }>("getBalance", [address, { commitment: "confirmed" }]);
  return r.value;
}

export async function getTokenAccounts(owner: string): Promise<(ParsedTokenAccount & { program: "spl-token" | "token-2022" })[]> {
  const [a, b] = await Promise.all(
    [TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((programId) =>
      rpc<{ value: ParsedTokenAccount[] }>("getTokenAccountsByOwner", [
        owner,
        { programId },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]).catch((e) => {
        // Token-2022 lookups fail on some RPCs; SPL Token failing is fatal.
        if (programId === TOKEN_PROGRAM) throw e;
        return { value: [] as ParsedTokenAccount[] };
      }),
    ),
  );
  return [
    ...a.value.map((v) => ({ ...v, program: "spl-token" as const })),
    ...b.value.map((v) => ({ ...v, program: "token-2022" as const })),
  ];
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown | null;
  memo: string | null;
  blockTime: number | null;
}

export async function getSignatures(address: string, limit = 20, before?: string): Promise<SignatureInfo[]> {
  return rpc<SignatureInfo[]>("getSignaturesForAddress", [address, { limit, ...(before ? { before } : {}) }]);
}

/** Subset of the jsonParsed getTransaction shape we rely on. */
export interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: RpcTokenBalance[];
    postTokenBalances?: RpcTokenBalance[];
    logMessages?: string[];
    computeUnitsConsumed?: number;
    innerInstructions?: { index: number; instructions: RpcInstruction[] }[];
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: { pubkey: string; signer: boolean; writable: boolean; source?: string }[];
      instructions: RpcInstruction[];
    };
  };
  version?: number | "legacy";
}

export interface RpcTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString?: string };
}

export interface RpcInstruction {
  programId: string;
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> } | string;
  accounts?: string[];
  data?: string;
  stackHeight?: number | null;
}

export async function getTransaction(signature: string): Promise<ParsedTransaction | null> {
  return rpc<ParsedTransaction | null>("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
}

export interface ParsedAccountInfo {
  lamports: number;
  owner: string;
  executable: boolean;
  data: { parsed?: { type: string; info: Record<string, unknown> }; program?: string } | [string, string];
}

export async function getAccountInfo(address: string): Promise<ParsedAccountInfo | null> {
  const r = await rpc<{ value: ParsedAccountInfo | null }>("getAccountInfo", [address, { encoding: "jsonParsed", commitment: "confirmed" }]);
  return r.value;
}

export async function getLargestAccounts(mint: string): Promise<{ address: string; uiAmount: number | null; amount: string }[]> {
  const r = await rpc<{ value: { address: string; uiAmount: number | null; amount: string }[] }>("getTokenLargestAccounts", [mint]);
  return r.value;
}

export async function getTokenSupply(mint: string): Promise<{ uiAmount: number | null; decimals: number; amount: string }> {
  const r = await rpc<{ value: { uiAmount: number | null; decimals: number; amount: string } }>("getTokenSupply", [mint]);
  return r.value;
}

export async function simulateTransaction(base64Tx: string) {
  return rpc<{
    value: { err: unknown | null; logs: string[] | null; unitsConsumed?: number };
  }>("simulateTransaction", [base64Tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" }]);
}

export async function getSlot(): Promise<number> {
  return rpc<number>("getSlot");
}

export async function getRecentPerformance(): Promise<{ numTransactions: number; samplePeriodSecs: number; slot: number }[]> {
  return rpc("getRecentPerformanceSamples", [5]);
}

export async function getMultipleAccounts(addresses: string[]): Promise<(ParsedAccountInfo | null)[]> {
  if (!addresses.length) return [];
  const r = await rpc<{ value: (ParsedAccountInfo | null)[] }>("getMultipleAccounts", [addresses, { encoding: "jsonParsed" }]);
  return r.value;
}

export async function getPrioritizationFees(): Promise<{ slot: number; prioritizationFee: number }[]> {
  return rpc("getRecentPrioritizationFees", [[]]);
}

export async function getEpochInfo(): Promise<{ epoch: number; slotIndex: number; slotsInEpoch: number; absoluteSlot: number; transactionCount?: number }> {
  return rpc("getEpochInfo", []);
}
