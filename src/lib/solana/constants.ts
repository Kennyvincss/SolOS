import type { HoldingKind } from "../types";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

/** Well-known mints. Identity only — prices always come from a market provider. */
export const KNOWN_MINTS: Record<string, { symbol: string; name: string; kind: HoldingKind; decimals: number }> = {
  [SOL_MINT]: { symbol: "SOL", name: "Solana", kind: "sol", decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", name: "USD Coin", kind: "stable", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", name: "Tether USD", kind: "stable", decimals: 6 },
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": { symbol: "PYUSD", name: "PayPal USD", kind: "stable", decimals: 6 },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP", name: "Jupiter", kind: "token", decimals: 6 },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK", name: "Bonk", kind: "token", decimals: 5 },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: "JTO", name: "Jito", kind: "token", decimals: 9 },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: "PYTH", name: "Pyth Network", kind: "token", decimals: 6 },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY", name: "Raydium", kind: "token", decimals: 6 },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF", name: "dogwifhat", kind: "token", decimals: 6 },
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: { symbol: "ORCA", name: "Orca", kind: "token", decimals: 6 },
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: { symbol: "RENDER", name: "Render", kind: "token", decimals: 8 },
  hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux: { symbol: "HNT", name: "Helium", kind: "token", decimals: 8 },
  "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ": { symbol: "W", name: "Wormhole", kind: "token", decimals: 6 },
  KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS: { symbol: "KMNO", name: "Kamino", kind: "token", decimals: 6 },
  DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7: { symbol: "DRIFT", name: "Drift", kind: "token", decimals: 6 },
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": { symbol: "JLP", name: "Jupiter Perps LP", kind: "token", decimals: 6 },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: "mSOL", name: "Marinade staked SOL", kind: "lst", decimals: 9 },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: "JitoSOL", name: "Jito Staked SOL", kind: "lst", decimals: 9 },
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: { symbol: "bSOL", name: "BlazeStake Staked SOL", kind: "lst", decimals: 9 },
  "2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv": { symbol: "PENGU", name: "Pudgy Penguins", kind: "token", decimals: 6 },
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": { symbol: "POPCAT", name: "Popcat", kind: "token", decimals: 9 },
};

export const STABLE_SYMBOLS = new Set(["USDC", "USDT", "PYUSD", "USDS", "USDe", "USDG", "FDUSD", "EURC", "USD1", "USDY", "syrupUSDC"]);

/** Program registry used to translate program ids into something readable. */
export const KNOWN_PROGRAMS: Record<string, { name: string; app?: string }> = {
  [SYSTEM_PROGRAM]: { name: "System Program" },
  [TOKEN_PROGRAM]: { name: "SPL Token" },
  [TOKEN_2022_PROGRAM]: { name: "Token-2022" },
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: { name: "Associated Token Account" },
  [COMPUTE_BUDGET_PROGRAM]: { name: "Compute Budget" },
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: { name: "Memo" },
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: { name: "Memo (v1)" },
  Stake11111111111111111111111111111111111111: { name: "Stake Program" },
  Vote111111111111111111111111111111111111111: { name: "Vote Program" },
  AddressLookupTab1e1111111111111111111111111: { name: "Address Lookup Table" },
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { name: "Jupiter Aggregator v6", app: "jupiter" },
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM v4", app: "raydium" },
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: { name: "Raydium CLMM", app: "raydium" },
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: { name: "Raydium CPMM", app: "raydium" },
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { name: "Orca Whirlpools", app: "orca" },
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: { name: "Meteora DLMM", app: "meteora" },
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": { name: "Pump.fun", app: "pump-fun" },
  MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD: { name: "Marinade Finance", app: "marinade" },
  KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD: { name: "Kamino Lend", app: "kamino" },
  dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH: { name: "Drift Protocol v2", app: "drift" },
  MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA: { name: "marginfi v2", app: "marginfi" },
  PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY: { name: "Phoenix", app: "phoenix" },
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: { name: "Metaplex Token Metadata", app: "metaplex" },
  SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf: { name: "Squads v4", app: "squads" },
};

export function programName(id: string): { name: string; known: boolean; app?: string } {
  const p = KNOWN_PROGRAMS[id];
  if (p) return { name: p.name, known: true, app: p.app };
  return { name: `Program ${id.slice(0, 4)}…${id.slice(-4)}`, known: false };
}
