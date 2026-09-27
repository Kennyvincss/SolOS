import bs58 from "bs58";
import type { RiskIndicator } from "../types";
import { COMPUTE_BUDGET_PROGRAM, KNOWN_PROGRAMS, LAMPORTS_PER_SOL, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM, programName } from "./constants";
import { fmtNum, shortAddr } from "../format";

/**
 * Decoder for *unsigned or signed serialized transactions* (legacy and v0).
 * Used by the pre-sign check in the Browser and Security Center: before a
 * user signs, we show exactly which programs are called, what moves, and
 * which permissions are granted.
 */

export interface DecodedInstruction {
  programId: string;
  programName: string;
  knownProgram: boolean;
  accounts: string[];
  data: Uint8Array;
  /** Human readable description when we can decode the instruction. */
  description?: string;
  type?: string;
}

export interface DecodedTransaction {
  version: "legacy" | 0;
  signatures: string[];
  numRequiredSignatures: number;
  accountKeys: string[];
  signers: string[];
  writable: string[];
  recentBlockhash: string;
  instructions: DecodedInstruction[];
  lookupTables: { account: string; writable: number[]; readonly: number[] }[];
  /** True when some accounts live in lookup tables and could not be resolved offline. */
  hasUnresolvedAccounts: boolean;
}

class Reader {
  private o = 0;
  constructor(private b: Uint8Array) {}
  get offset() {
    return this.o;
  }
  u8() {
    if (this.o >= this.b.length) throw new Error("Unexpected end of transaction bytes");
    return this.b[this.o++];
  }
  peek() {
    return this.b[this.o];
  }
  bytes(n: number) {
    if (this.o + n > this.b.length) throw new Error("Unexpected end of transaction bytes");
    const out = this.b.slice(this.o, this.o + n);
    this.o += n;
    return out;
  }
  compactU16() {
    let len = 0;
    let size = 0;
    for (;;) {
      const elem = this.u8();
      len |= (elem & 0x7f) << (size * 7);
      size += 1;
      if ((elem & 0x80) === 0) break;
      if (size > 3) throw new Error("Invalid compact-u16");
    }
    return len;
  }
  key() {
    return bs58.encode(this.bytes(32));
  }
}

export function parseTxBytes(input: string): Uint8Array {
  const s = input.trim();
  if (/^[A-Za-z0-9+/]+=*$/.test(s) && (s.length % 4 === 0 || s.endsWith("="))) {
    try {
      const buf = Buffer.from(s, "base64");
      if (buf.length > 64) return new Uint8Array(buf);
    } catch {
      /* fall through */
    }
  }
  return bs58.decode(s);
}

export function decodeTransaction(raw: Uint8Array): DecodedTransaction {
  const r = new Reader(raw);
  // A bare message (no signature section) starts with the header or 0x80 prefix.
  const sigCount = r.compactU16();
  const signatures: string[] = [];
  for (let i = 0; i < sigCount; i++) {
    const sig = r.bytes(64);
    signatures.push(sig.every((x) => x === 0) ? "" : bs58.encode(sig));
  }
  let version: "legacy" | 0 = "legacy";
  if ((r.peek() & 0x80) !== 0) {
    const v = r.u8() & 0x7f;
    if (v !== 0) throw new Error(`Unsupported transaction version ${v}`);
    version = 0;
  }
  const numRequiredSignatures = r.u8();
  const numReadonlySigned = r.u8();
  const numReadonlyUnsigned = r.u8();
  const keyCount = r.compactU16();
  const accountKeys: string[] = [];
  for (let i = 0; i < keyCount; i++) accountKeys.push(r.key());
  const recentBlockhash = r.key();
  const ixCount = r.compactU16();
  const rawIx: { programIndex: number; accounts: number[]; data: Uint8Array }[] = [];
  for (let i = 0; i < ixCount; i++) {
    const programIndex = r.u8();
    const n = r.compactU16();
    const accounts: number[] = [];
    for (let j = 0; j < n; j++) accounts.push(r.u8());
    const dl = r.compactU16();
    rawIx.push({ programIndex, accounts, data: r.bytes(dl) });
  }
  const lookupTables: DecodedTransaction["lookupTables"] = [];
  if (version === 0) {
    const n = r.compactU16();
    for (let i = 0; i < n; i++) {
      const account = r.key();
      const w = r.compactU16();
      const writable = [...r.bytes(w)];
      const ro = r.compactU16();
      const readonly = [...r.bytes(ro)];
      lookupTables.push({ account, writable, readonly });
    }
  }

  const signers = accountKeys.slice(0, numRequiredSignatures);
  const writable = accountKeys.filter((_, i) =>
    i < numRequiredSignatures ? i < numRequiredSignatures - numReadonlySigned : i < keyCount - numReadonlyUnsigned,
  );
  const lookupCount = lookupTables.reduce((s, t) => s + t.writable.length + t.readonly.length, 0);
  const resolve = (i: number) => accountKeys[i] ?? `lookup#${i - keyCount}`;

  const instructions = rawIx.map((ix) => {
    const programId = resolve(ix.programIndex);
    const p = programName(programId);
    const accounts = ix.accounts.map(resolve);
    const decoded: DecodedInstruction = { programId, programName: p.name, knownProgram: p.known, accounts, data: ix.data };
    describeInstruction(decoded);
    return decoded;
  });

  return {
    version,
    signatures,
    numRequiredSignatures,
    accountKeys,
    signers,
    writable,
    recentBlockhash,
    instructions,
    lookupTables,
    hasUnresolvedAccounts: lookupCount > 0,
  };
}

function u64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}
function u32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

const AUTHORITY_TYPES = ["MintTokens", "FreezeAccount", "AccountOwner", "CloseAccount"];

function describeInstruction(ix: DecodedInstruction) {
  const d = ix.data;
  try {
    if (ix.programId === SYSTEM_PROGRAM && d.length >= 4) {
      const tag = u32(d, 0);
      if (tag === 2 && d.length >= 12) {
        const lamports = Number(u64(d, 4)) / LAMPORTS_PER_SOL;
        ix.type = "transfer";
        ix.description = `Transfer ${fmtNum(lamports)} SOL from ${shortAddr(ix.accounts[0])} to ${shortAddr(ix.accounts[1])}`;
      } else if (tag === 0) {
        ix.type = "createAccount";
        ix.description = `Create a new account ${shortAddr(ix.accounts[1])} funded by ${shortAddr(ix.accounts[0])}`;
      } else if (tag === 1) {
        ix.type = "assign";
        ix.description = `Reassign ownership of account ${shortAddr(ix.accounts[0])} to program ${shortAddr(bs58.encode(d.slice(4, 36)))}`;
      } else if (tag === 4) {
        ix.type = "advanceNonce";
        ix.description = "Advance a durable nonce (this transaction does not expire like a normal one)";
      } else if (tag === 7) {
        ix.type = "authorizeNonce";
        ix.description = "Change the authority of a durable nonce account";
      }
    } else if ((ix.programId === TOKEN_PROGRAM || ix.programId === TOKEN_2022_PROGRAM) && d.length >= 1) {
      const tag = d[0];
      const amt = d.length >= 9 ? u64(d, 1).toString() : "?";
      if (tag === 3) {
        ix.type = "transfer";
        ix.description = `Transfer ${amt} base units of a token from ${shortAddr(ix.accounts[0])} to ${shortAddr(ix.accounts[1])}`;
      } else if (tag === 12) {
        const decimals = d[9];
        const ui = Number(amt) / 10 ** decimals;
        ix.type = "transferChecked";
        ix.description = `Transfer ${fmtNum(ui)} of token ${shortAddr(ix.accounts[1])} to ${shortAddr(ix.accounts[2])}`;
      } else if (tag === 4 || tag === 13) {
        ix.type = "approve";
        const delegate = tag === 4 ? ix.accounts[1] : ix.accounts[2];
        ix.description = `Approve ${shortAddr(delegate)} to spend up to ${amt} base units from token account ${shortAddr(ix.accounts[0])}`;
      } else if (tag === 5) {
        ix.type = "revoke";
        ix.description = `Revoke delegate permissions on ${shortAddr(ix.accounts[0])}`;
      } else if (tag === 6) {
        ix.type = "setAuthority";
        const kind = AUTHORITY_TYPES[d[1]] ?? "Unknown";
        const hasNew = d[2] === 1;
        const next = hasNew && d.length >= 35 ? shortAddr(bs58.encode(d.slice(3, 35))) : "nobody";
        ix.description = `Change ${kind} authority of ${shortAddr(ix.accounts[0])} to ${next}`;
      } else if (tag === 9) {
        ix.type = "closeAccount";
        ix.description = `Close token account ${shortAddr(ix.accounts[0])} and send its rent to ${shortAddr(ix.accounts[1])}`;
      } else if (tag === 8 || tag === 15) {
        ix.type = "burn";
        ix.description = `Burn tokens from ${shortAddr(ix.accounts[0])}`;
      } else if (tag === 7 || tag === 14) {
        ix.type = "mintTo";
        ix.description = `Mint new tokens to ${shortAddr(ix.accounts[1])}`;
      } else if (tag === 1 || tag === 16 || tag === 18) {
        ix.type = "initializeAccount";
        ix.description = "Initialize a token account";
      }
    } else if (ix.programId === COMPUTE_BUDGET_PROGRAM && d.length >= 1) {
      if (d[0] === 2) {
        ix.type = "setComputeUnitLimit";
        ix.description = `Set compute limit to ${u32(d, 1).toLocaleString()} units`;
      } else if (d[0] === 3) {
        ix.type = "setComputeUnitPrice";
        ix.description = `Set priority fee to ${u64(d, 1).toString()} micro-lamports per unit`;
      }
    } else if (ix.programId === "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") {
      ix.type = "createAssociatedTokenAccount";
      ix.description = `Create token account for ${shortAddr(ix.accounts[2])}`;
    } else if (ix.programId === "Stake11111111111111111111111111111111111111" && d.length >= 4) {
      const tag = u32(d, 0);
      if (tag === 1) {
        ix.type = "authorize";
        ix.description = `Change the authority of stake account ${shortAddr(ix.accounts[0])}`;
      } else if (tag === 2) {
        ix.type = "delegate";
        ix.description = `Delegate stake account ${shortAddr(ix.accounts[0])} to validator ${shortAddr(ix.accounts[1])}`;
      } else if (tag === 4) {
        ix.type = "withdraw";
        ix.description = `Withdraw from stake account ${shortAddr(ix.accounts[0])}`;
      }
    } else if (ix.programId.startsWith("Memo")) {
      ix.type = "memo";
      ix.description = `Memo: "${new TextDecoder().decode(d).slice(0, 120)}"`;
    }
  } catch {
    /* leave undescribed */
  }
  if (!ix.description) {
    ix.description = ix.knownProgram ? `Call ${ix.programName}` : `Call an unrecognized program ${shortAddr(ix.programId)}`;
  }
}

/**
 * Transparent, rule-based risk indicators for a transaction about to be signed.
 * We deliberately never output a single "SAFE" verdict.
 */
export function assessTransaction(tx: DecodedTransaction, signer?: string): RiskIndicator[] {
  const out: RiskIndicator[] = [];
  const me = signer ?? tx.signers[0];

  for (const ix of tx.instructions) {
    if (ix.type === "approve") {
      out.push({
        id: `approve-${out.length}`,
        label: "Grants spending permission",
        level: "high",
        value: shortAddr(ix.accounts[ix.data[0] === 4 ? 1 : 2]),
        explanation: `${ix.description}. A delegate can move these tokens later without asking you again. Only approve if you trust the app and the amount is what you expect.`,
      });
    }
    if (ix.type === "setAuthority") {
      out.push({ id: `auth-${out.length}`, label: "Changes an authority", level: "high", explanation: `${ix.description}. Authority changes can hand control of an account or token to someone else.` });
    }
    if (ix.type === "assign") {
      out.push({ id: `assign-${out.length}`, label: "Reassigns account ownership", level: "high", explanation: `${ix.description}. This is a common drainer technique: the new owner program gains control of the account.` });
    }
    if (ix.type === "authorize") {
      out.push({ id: `stakeauth-${out.length}`, label: "Changes stake authority", level: "high", explanation: `${ix.description}. The new authority could withdraw the staked SOL.` });
    }
    if (ix.type === "advanceNonce" || ix.type === "authorizeNonce") {
      out.push({ id: `nonce-${out.length}`, label: "Durable nonce", level: "medium", explanation: "This transaction uses a durable nonce, so it stays valid indefinitely instead of expiring after ~1 minute. It could be submitted long after you sign it." });
    }
    if (ix.type === "closeAccount" && me && ix.accounts[1] !== me) {
      out.push({ id: `close-${out.length}`, label: "Rent sent elsewhere", level: "medium", explanation: `${ix.description}, which is not your wallet.` });
    }
    if (ix.type === "transfer" && ix.programId === SYSTEM_PROGRAM && ix.accounts[0] === me) {
      const lamports = ix.data.length >= 12 ? Number(u64(ix.data, 4)) / LAMPORTS_PER_SOL : 0;
      out.push({
        id: `sol-${out.length}`,
        label: "Sends SOL",
        level: lamports >= 10 ? "medium" : "low",
        value: `${fmtNum(lamports)} SOL`,
        explanation: `${ix.description}. Check that the recipient is who you expect.`,
      });
    }
    if ((ix.type === "transfer" || ix.type === "transferChecked") && ix.programId !== SYSTEM_PROGRAM) {
      out.push({ id: `tok-${out.length}`, label: "Moves tokens", level: "low", explanation: `${ix.description}.` });
    }
  }

  const unknown = [...new Set(tx.instructions.filter((i) => !i.knownProgram).map((i) => i.programId))];
  if (unknown.length) {
    out.push({
      id: "unknown-programs",
      label: "Unrecognized programs",
      level: "medium",
      value: `${unknown.length}`,
      explanation: `Calls ${unknown.map((u) => shortAddr(u)).join(", ")}, which ${unknown.length === 1 ? "is" : "are"} not in the Solana OS program registry. That is not proof of danger, but we cannot describe what ${unknown.length === 1 ? "it does" : "they do"}.`,
    });
  } else if (tx.instructions.length) {
    out.push({
      id: "known-programs",
      label: "Only recognized programs",
      level: "low",
      explanation: `Every program called is in the Solana OS registry (${[...new Set(tx.instructions.map((i) => i.programName))].join(", ")}). Recognized programs can still be used in harmful ways; review the actions above.`,
    });
  }
  if (tx.hasUnresolvedAccounts) {
    out.push({ id: "alt", label: "Uses address lookup tables", level: "low", explanation: "Some accounts are loaded from lookup tables. They are resolved during simulation; offline decoding shows them as lookup references." });
  }
  if (tx.signers.length > 1) {
    out.push({ id: "multi-signer", label: "Multiple signers", level: "low", value: `${tx.signers.length}`, explanation: `This transaction needs ${tx.signers.length} signatures: ${tx.signers.map((s) => shortAddr(s)).join(", ")}.` });
  }
  return out;
}

export function isKnownProgram(id: string) {
  return Boolean(KNOWN_PROGRAMS[id]);
}
