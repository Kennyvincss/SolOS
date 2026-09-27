import "server-only";
import type { Sourced, TxExplanation } from "../types";
import { getTransaction, simulateTransaction } from "../providers/rpc";
import { jupTokensByMint } from "../providers/jupiter";
import { liveOnly } from "../providers/source";
import { explainTransaction } from "../solana/explain";
import { assessTransaction, decodeTransaction, parseTxBytes, type DecodedTransaction } from "../solana/tx-decode";
import { KNOWN_MINTS } from "../solana/constants";
import type { RiskIndicator } from "../types";

export class NotFoundError extends Error {}

export async function explainSignature(signature: string): Promise<Sourced<TxExplanation>> {
  return liveOnly("Solana RPC", async () => {
    const tx = await getTransaction(signature);
    if (!tx) throw new NotFoundError("Transaction not found. It may be too old for this RPC node or not yet confirmed.");
    const first = explainTransaction(signature, tx);
    const unknown = [...new Set(first.balanceChanges.map((c) => c.mint))].filter((m) => !KNOWN_MINTS[m]);
    if (!unknown.length) return first;
    try {
      const meta = await jupTokensByMint(unknown);
      return explainTransaction(signature, tx, (mint) => {
        const t = meta.get(mint);
        return t ? { symbol: t.symbol, decimals: t.decimals } : KNOWN_MINTS[mint];
      });
    } catch {
      return first;
    }
  });
}

export interface PreSignReport {
  decoded: Omit<DecodedTransaction, "instructions"> & {
    instructions: { programId: string; programName: string; knownProgram: boolean; accounts: string[]; description?: string; type?: string }[];
  };
  indicators: RiskIndicator[];
  simulation?: { ok: boolean; error?: string; logs: string[]; unitsConsumed?: number; available: boolean; note?: string };
}

export async function preSignCheck(serialized: string, signer?: string): Promise<PreSignReport> {
  const decoded = decodeTransaction(parseTxBytes(serialized));
  const indicators = assessTransaction(decoded, signer);
  let simulation: PreSignReport["simulation"];
  try {
    const b64 = Buffer.from(parseTxBytes(serialized)).toString("base64");
    const sim = await simulateTransaction(b64);
    const err = sim.value.err;
    simulation = {
      ok: !err,
      error: err ? JSON.stringify(err) : undefined,
      logs: sim.value.logs ?? [],
      unitsConsumed: sim.value.unitsConsumed,
      available: true,
    };
    if (err) {
      indicators.unshift({
        id: "sim-failed",
        label: "Simulation failed",
        level: "high",
        value: simulation.error,
        explanation: "The network rejected this transaction in simulation. Signing it would likely fail, and a failing transaction can be a sign that something is wrong.",
      });
    }
  } catch (e) {
    simulation = { ok: false, logs: [], available: false, note: `Simulation unavailable: ${e instanceof Error ? e.message : "error"}` };
  }
  return {
    decoded: {
      ...decoded,
      instructions: decoded.instructions.map(({ data: _data, ...rest }) => rest),
    },
    indicators,
    simulation,
  };
}
