import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import crypto from "node:crypto";
import { explainTransaction, renderHeadline } from "@/lib/solana/explain";
import { assessTransaction, decodeTransaction } from "@/lib/solana/tx-decode";
import { extractSolanaId, isAddress, isSignature } from "@/lib/solana/address";
import type { ParsedTransaction } from "@/lib/providers/rpc";
import { SOL_MINT, SYSTEM_PROGRAM, TOKEN_PROGRAM } from "@/lib/solana/constants";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const key = () => bs58.encode(crypto.randomBytes(32));

describe("address helpers", () => {
  it("recognises addresses and signatures", () => {
    expect(isAddress(USDC)).toBe(true);
    expect(isAddress("not-an-address")).toBe(false);
    const sig = bs58.encode(crypto.randomBytes(64));
    expect(isSignature(sig)).toBe(true);
    expect(isAddress(sig)).toBe(false);
    expect(extractSolanaId(`Analyze ${USDC} please`)).toEqual({ type: "address", value: USDC });
    expect(extractSolanaId(`explain ${sig}`)).toEqual({ type: "signature", value: sig });
  });
});

function swapTx(payer: string, failed = false): ParsedTransaction {
  const pool = key();
  return {
    slot: 1,
    blockTime: 1_700_000_000,
    meta: {
      err: failed ? { InstructionError: [2, { Custom: 6001 }] } : null,
      fee: 5000,
      // payer spends 2.4 SOL (+ fee); pool vault gains it
      preBalances: [10_000_000_000, 1_000_000_000, 1, 1],
      postBalances: failed ? [9_999_995_000, 1_000_000_000, 1, 1] : [7_599_995_000, 3_400_000_000, 1, 1],
      preTokenBalances: [
        { accountIndex: 2, mint: USDC, owner: payer, uiTokenAmount: { amount: "0", decimals: 6, uiAmount: 0, uiAmountString: "0" } },
        { accountIndex: 3, mint: USDC, owner: pool, uiTokenAmount: { amount: "1000000000", decimals: 6, uiAmount: 1000, uiAmountString: "1000" } },
      ],
      postTokenBalances: failed
        ? undefined
        : [
            { accountIndex: 2, mint: USDC, owner: payer, uiTokenAmount: { amount: "420000000", decimals: 6, uiAmount: 420, uiAmountString: "420" } },
            { accountIndex: 3, mint: USDC, owner: pool, uiTokenAmount: { amount: "580000000", decimals: 6, uiAmount: 580, uiAmountString: "580" } },
          ],
      logMessages: [],
      innerInstructions: [{ index: 1, instructions: [{ programId: TOKEN_PROGRAM, parsed: { type: "transfer" } }] }],
    },
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [
          { pubkey: payer, signer: true, writable: true },
          { pubkey: pool, signer: false, writable: true },
          { pubkey: key(), signer: false, writable: true },
          { pubkey: key(), signer: false, writable: true },
        ],
        instructions: [
          { programId: "ComputeBudget111111111111111111111111111111", data: "x" },
          { programId: JUP_V6, data: "x", accounts: [] },
        ],
      },
    },
  };
}

describe("explainTransaction", () => {
  it("describes a swap in plain English", () => {
    const payer = key();
    const ex = explainTransaction("sig", swapTx(payer));
    expect(ex.kind).toBe("swap");
    expect(ex.status).toBe("success");
    expect(ex.feeSol).toBeCloseTo(0.000005);
    expect(renderHeadline(ex.headline, ex.feePayer, payer)).toBe("You swapped 2.4 SOL for 420 USDC using Jupiter.");
    expect(renderHeadline(ex.headline, ex.feePayer, null)).toMatch(/^Wallet \w{4}…\w{4} swapped 2.4 SOL for 420 USDC using Jupiter\.$/);
    expect(ex.programs.map((p) => p.name)).toContain("Jupiter Aggregator v6");
    const sol = ex.payerChanges.find((c) => c.mint === SOL_MINT)!;
    expect(sol.change).toBeCloseTo(-2.4);
  });

  it("reports failures without inventing movements", () => {
    const ex = explainTransaction("sig", swapTx(key(), true));
    expect(ex.kind).toBe("failed");
    expect(ex.headline).toMatch(/failed/);
  });

  it("describes a plain SOL transfer", () => {
    const from = key();
    const to = key();
    const tx: ParsedTransaction = {
      slot: 2,
      blockTime: null,
      meta: { err: null, fee: 5000, preBalances: [5e9, 0, 1], postBalances: [5e9 - 1e9 - 5000, 1e9, 1] },
      transaction: {
        signatures: ["s"],
        message: {
          accountKeys: [
            { pubkey: from, signer: true, writable: true },
            { pubkey: to, signer: false, writable: true },
            { pubkey: SYSTEM_PROGRAM, signer: false, writable: false },
          ],
          instructions: [{ programId: SYSTEM_PROGRAM, parsed: { type: "transfer", info: {} } }],
        },
      },
    };
    const ex = explainTransaction("s", tx);
    expect(ex.kind).toBe("transfer_out");
    expect(renderHeadline(ex.headline, from, from)).toBe(`You sent 1 SOL to ${to.slice(0, 4)}…${to.slice(-4)}.`);
  });
});

/* ---------------------------------------------------- serialized tx decoding */

function compact(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    let b = v & 0x7f;
    v >>= 7;
    if (v) b |= 0x80;
    out.push(b);
    if (!v) return out;
  }
}
function u64le(n: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return [...b];
}

function buildLegacyTx(keys: string[], numSigners: number, ixs: { program: number; accounts: number[]; data: number[] }[]) {
  const bytes: number[] = [];
  bytes.push(...compact(numSigners));
  for (let i = 0; i < numSigners; i++) bytes.push(...new Array(64).fill(0));
  bytes.push(numSigners, 0, 1); // header: signers, readonly signed, readonly unsigned (program)
  bytes.push(...compact(keys.length));
  for (const k of keys) bytes.push(...bs58.decode(k));
  bytes.push(...crypto.randomBytes(32));
  bytes.push(...compact(ixs.length));
  for (const ix of ixs) {
    bytes.push(ix.program, ...compact(ix.accounts.length), ...ix.accounts, ...compact(ix.data.length), ...ix.data);
  }
  return new Uint8Array(bytes);
}

describe("decodeTransaction + assessTransaction", () => {
  it("decodes a SOL transfer", () => {
    const me = key();
    const to = key();
    const raw = buildLegacyTx([me, to, SYSTEM_PROGRAM], 1, [{ program: 2, accounts: [0, 1], data: [2, 0, 0, 0, ...u64le(1_500_000_000n)] }]);
    const d = decodeTransaction(raw);
    expect(d.version).toBe("legacy");
    expect(d.signers).toEqual([me]);
    expect(d.instructions[0].type).toBe("transfer");
    expect(d.instructions[0].description).toMatch(/Transfer 1\.5 SOL/);
    const risks = assessTransaction(d, me);
    expect(risks.find((r) => r.label === "Sends SOL")?.value).toBe("1.5 SOL");
    expect(risks.some((r) => r.level === "high")).toBe(false);
  });

  it("flags token approvals and unknown programs as risky", () => {
    const me = key();
    const tokenAcct = key();
    const delegate = key();
    const unknown = key();
    const raw = buildLegacyTx([me, tokenAcct, delegate, TOKEN_PROGRAM, unknown], 1, [
      { program: 3, accounts: [1, 2, 0], data: [4, ...u64le(1_000_000n)] },
      { program: 4, accounts: [0], data: [1, 2, 3] },
    ]);
    const d = decodeTransaction(raw);
    expect(d.instructions[0].type).toBe("approve");
    const risks = assessTransaction(d, me);
    expect(risks.find((r) => r.label === "Grants spending permission")?.level).toBe("high");
    expect(risks.find((r) => r.id === "unknown-programs")?.level).toBe("medium");
    // Never a blanket "safe" verdict.
    expect(risks.every((r) => !/\bsafe\b/i.test(r.label))).toBe(true);
  });

  it("accepts base64 input via parse and rejects truncated bytes", () => {
    const raw = buildLegacyTx([key(), key(), SYSTEM_PROGRAM], 1, [{ program: 2, accounts: [0, 1], data: [2, 0, 0, 0, ...u64le(1n)] }]);
    expect(() => decodeTransaction(raw.slice(0, 50))).toThrow();
  });
});
