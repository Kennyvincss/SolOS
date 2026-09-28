import { getAccountInfo } from "../providers/rpc";
import { KNOWN_PROGRAMS, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../solana/constants";
import { isDemoWallet } from "../providers/demo";

export type AccountKind = "wallet" | "mint" | "token_account" | "program" | "other" | "missing";

export interface AccountClass {
  type: AccountKind;
  /** Program name, for programs in the registry. */
  name?: string;
  /** Owning program of an "other" account (e.g. a Squads multisig vault). */
  owner?: string;
  ownerName?: string;
  /** For token accounts: the wallet that owns it, and the token. */
  wallet?: string;
  mint?: string;
  demo?: boolean;
}

/**
 * What an address is on-chain: a wallet (System Program account), a token
 * mint ("contract address"), a token account, a program, or something else.
 * Addresses with no account yet are "missing" (usually an unused wallet).
 */
export async function classifyAddress(address: string): Promise<AccountClass> {
  if (isDemoWallet(address)) return { type: "wallet", demo: true };
  const acct = await getAccountInfo(address);
  if (!acct) return { type: "missing" };
  if (acct.executable) return { type: "program", name: KNOWN_PROGRAMS[address]?.name };
  const parsed = !Array.isArray(acct.data) ? acct.data.parsed : undefined;
  if (parsed?.type === "mint") return { type: "mint" };
  if (parsed?.type === "account" && (acct.owner === TOKEN_PROGRAM || acct.owner === TOKEN_2022_PROGRAM)) {
    return { type: "token_account", wallet: String(parsed.info.owner ?? ""), mint: String(parsed.info.mint ?? "") };
  }
  if (acct.owner === SYSTEM_PROGRAM) return { type: "wallet" };
  return { type: "other", owner: acct.owner, ownerName: KNOWN_PROGRAMS[acct.owner]?.name };
}
