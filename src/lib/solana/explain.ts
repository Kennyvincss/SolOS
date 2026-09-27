import type { ActivityKind, BalanceChange, ProgramRef, TxExplanation } from "../types";
import type { ParsedTransaction, RpcInstruction } from "../providers/rpc";
import { COMPUTE_BUDGET_PROGRAM, KNOWN_MINTS, LAMPORTS_PER_SOL, SOL_MINT, programName } from "./constants";
import { fmtNum, shortAddr } from "../format";

/**
 * Turn a jsonParsed transaction into a plain-English explanation.
 * Everything here is derived from on-chain balance changes and instruction
 * data — no guessing about intent beyond well-defined heuristics.
 */

/** SOL movements below this are treated as rent/account creation noise when tokens moved too. */
const RENT_NOISE_SOL = 0.0035;

export type SymbolLookup = (mint: string) => { symbol?: string; decimals?: number } | undefined;

const defaultLookup: SymbolLookup = (mint) => KNOWN_MINTS[mint];

export function symbolFor(mint: string, lookup: SymbolLookup = defaultLookup): string {
  return lookup(mint)?.symbol ?? KNOWN_MINTS[mint]?.symbol ?? shortAddr(mint);
}

export function computeBalanceChanges(tx: ParsedTransaction, lookup: SymbolLookup = defaultLookup): BalanceChange[] {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
  const meta = tx.meta;
  if (!meta) return [];
  const changes = new Map<string, BalanceChange>();
  const add = (owner: string, mint: string, decimals: number, delta: number) => {
    if (!delta) return;
    const key = `${owner}:${mint}`;
    const cur = changes.get(key);
    if (cur) cur.change += delta;
    else changes.set(key, { owner, mint, decimals, change: delta, symbol: symbolFor(mint, lookup) });
  };

  // Native SOL. The fee is reported separately, so add it back for the fee payer.
  keys.forEach((k, i) => {
    const pre = meta.preBalances[i] ?? 0;
    const post = meta.postBalances[i] ?? 0;
    let delta = post - pre;
    if (i === 0) delta += meta.fee;
    if (delta) add(k, SOL_MINT, 9, delta / LAMPORTS_PER_SOL);
  });

  // SPL tokens, keyed by the token account's owner.
  const tokenKey = (b: { accountIndex: number; mint: string }) => `${b.accountIndex}:${b.mint}`;
  const pre = new Map((meta.preTokenBalances ?? []).map((b) => [tokenKey(b), b]));
  const post = new Map((meta.postTokenBalances ?? []).map((b) => [tokenKey(b), b]));
  for (const k of new Set([...pre.keys(), ...post.keys()])) {
    const a = pre.get(k);
    const b = post.get(k);
    const ref = b ?? a!;
    const owner = ref.owner ?? keys[ref.accountIndex];
    const decimals = ref.uiTokenAmount.decimals;
    const before = a ? Number(a.uiTokenAmount.uiAmountString ?? a.uiTokenAmount.uiAmount ?? 0) : 0;
    const after = b ? Number(b.uiTokenAmount.uiAmountString ?? b.uiTokenAmount.uiAmount ?? 0) : 0;
    add(owner, ref.mint, decimals, after - before);
  }

  // Wrapped SOL is SOL: merge it into the native line for each owner.
  const merged = new Map<string, BalanceChange>();
  for (const c of changes.values()) {
    const key = `${c.owner}:${c.mint === SOL_MINT ? "SOL" : c.mint}`;
    const cur = merged.get(key);
    if (cur) cur.change += c.change;
    else merged.set(key, { ...c, symbol: c.mint === SOL_MINT ? "SOL" : c.symbol });
  }
  return [...merged.values()]
    .map((c) => ({ ...c, change: Number(c.change.toFixed(Math.min(c.decimals, 9))) }))
    .filter((c) => c.change !== 0);
}

function allInstructions(tx: ParsedTransaction): RpcInstruction[] {
  const inner = (tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions);
  return [...tx.transaction.message.instructions, ...inner];
}

export function programsOf(tx: ParsedTransaction): ProgramRef[] {
  const seen = new Map<string, ProgramRef>();
  // Top-level programs first: they express what the user actually called.
  for (const ix of allInstructions(tx)) {
    if (seen.has(ix.programId)) continue;
    const p = programName(ix.programId);
    seen.set(ix.programId, { id: ix.programId, name: p.name, known: p.known, app: p.app });
  }
  return [...seen.values()];
}

function amount(c: BalanceChange) {
  return `${fmtNum(Math.abs(c.change))} ${c.symbol ?? shortAddr(c.mint)}`;
}

function viaApp(programs: ProgramRef[], topLevel: string[]): string | undefined {
  const top = programs.filter((p) => topLevel.includes(p.id) && p.app);
  const pick = top[0] ?? programs.find((p) => p.app);
  if (!pick) return undefined;
  return pick.name.replace(/ (Aggregator )?v\d+$/, "").replace(/ Protocol$/, "");
}

export function explainTransaction(signature: string, tx: ParsedTransaction, lookup: SymbolLookup = defaultLookup): TxExplanation {
  const keys = tx.transaction.message.accountKeys;
  const feePayer = keys[0]?.pubkey ?? "";
  const signers = keys.filter((k) => k.signer).map((k) => k.pubkey);
  const programs = programsOf(tx);
  const topLevelIds = tx.transaction.message.instructions.map((i) => i.programId);
  const feeSol = (tx.meta?.fee ?? 0) / LAMPORTS_PER_SOL;
  const failed = Boolean(tx.meta?.err);
  const balanceChanges = computeBalanceChanges(tx, lookup);

  let payerChanges = balanceChanges.filter((c) => c.owner === feePayer);
  const tokenMoves = payerChanges.filter((c) => c.mint !== SOL_MINT);
  if (tokenMoves.length) {
    payerChanges = payerChanges.filter((c) => c.mint !== SOL_MINT || Math.abs(c.change) > RENT_NOISE_SOL);
  }
  const outs = payerChanges.filter((c) => c.change < 0);
  const ins = payerChanges.filter((c) => c.change > 0);
  const app = viaApp(programs, topLevelIds);
  const who = shortAddr(feePayer);
  const details: string[] = [];
  let kind: ActivityKind = "unknown";
  let headline: string;

  const instructions = tx.transaction.message.instructions.map((ix) => {
    const parsed = typeof ix.parsed === "object" ? ix.parsed : undefined;
    return { program: ix.programId, programName: programName(ix.programId).name, type: parsed?.type, info: parsed?.info };
  });
  const called = programs.filter((p) => p.id !== COMPUTE_BUDGET_PROGRAM && topLevelIds.includes(p.id));

  if (failed) {
    kind = "failed";
    headline = `This transaction failed. Only the network fee of ${fmtNum(feeSol)} SOL was charged.`;
    details.push(`Error: ${JSON.stringify(tx.meta?.err)}`);
  } else if (outs.length && ins.length) {
    const isStake = ins.some((c) => KNOWN_MINTS[c.mint]?.kind === "lst") && outs.some((c) => c.mint === SOL_MINT);
    kind = isStake ? "stake" : "swap";
    const verb = isStake ? "staked" : "swapped";
    headline = `{who} ${verb} ${outs.map(amount).join(" + ")} for ${ins.map(amount).join(" + ")}${app ? ` using ${app}` : ""}.`;
  } else if (outs.length) {
    kind = "transfer_out";
    const recipients = balanceChanges.filter((c) => c.owner !== feePayer && c.change > 0 && outs.some((o) => o.mint === c.mint));
    const to = recipients.length ? ` to ${[...new Set(recipients.map((r) => shortAddr(r.owner)))].join(", ")}` : "";
    const nft = outs.some((o) => o.decimals === 0 && Math.abs(o.change) === 1);
    if (nft) kind = "nft";
    headline = `{who} sent ${outs.map(amount).join(" + ")}${to}${app ? ` via ${app}` : ""}.`;
  } else if (ins.length) {
    kind = "transfer_in";
    const senders = balanceChanges.filter((c) => c.owner !== feePayer && c.change < 0 && ins.some((o) => o.mint === c.mint));
    const from = senders.length ? ` from ${[...new Set(senders.map((r) => shortAddr(r.owner)))].join(", ")}` : "";
    headline = `{who} received ${ins.map(amount).join(" + ")}${from}${app ? ` via ${app}` : ""}.`;
  } else {
    kind = "program";
    headline = called.length
      ? `{who} interacted with ${called.map((p) => p.name).join(", ")}. No token balances of the signer changed.`
      : `{who} submitted a transaction with no balance changes other than the fee.`;
  }

  if (!failed) {
    for (const c of payerChanges) details.push(`${c.change > 0 ? "Received" : "Paid"} ${amount(c)}`);
    const others = balanceChanges.filter((c) => c.owner !== feePayer);
    if (others.length) details.push(`${others.length} other balance change${others.length === 1 ? "" : "s"} across ${new Set(others.map((o) => o.owner)).size} accounts`);
  }
  details.push(`Network fee: ${fmtNum(feeSol)} SOL paid by ${who}`);
  if (called.length) details.push(`Programs called: ${called.map((p) => p.name).join(", ")}`);

  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? undefined,
    status: failed ? "failed" : "success",
    error: failed ? JSON.stringify(tx.meta?.err) : undefined,
    feeSol,
    feePayer,
    signers,
    programs,
    headline,
    details,
    kind,
    balanceChanges,
    payerChanges,
    instructions,
    logs: tx.meta?.logMessages?.slice(0, 60),
    computeUnits: tx.meta?.computeUnitsConsumed,
  };
}

/** Resolve the "{who}" placeholder for the current viewer. */
export function renderHeadline(headline: string, feePayer: string, viewer?: string | null): string {
  if (viewer && viewer === feePayer) return headline.replace("{who}", "You");
  return headline.replace("{who}", `Wallet ${shortAddr(feePayer)}`);
}
