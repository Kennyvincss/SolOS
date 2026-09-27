import { config } from "../config";
import { fetchJson, UpstreamError } from "./http";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../solana/constants";

/**
 * Minimal Solana JSON-RPC client. Works with the public endpoint and any
 * provider (Helius, Triton, QuickNode...) via SOLANA_RPC_URL.
 */

let rpcId = 0;

export async function rpc<T>(method: string, params: unknown[] = [], timeoutMs = 10000): Promise<T> {
  const res = await fetchJson<{ result?: T; error?: { code: number; message: string } }>(config.rpcUrl, {
    body: { jsonrpc: "2.0", id: ++rpcId, method, params },
    timeoutMs,
  });
  if (res.error) throw new UpstreamError(`RPC ${method}: ${res.error.message}`, res.error.code);
  return res.result as T;
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
