import "server-only";
import type { RiskIndicator, RiskLevel, RiskReport, Token } from "../types";
import { getAccountInfo, getLargestAccounts, getSignatures, getTokenSupply } from "../providers/rpc";
import { jupTokensByMint } from "../providers/jupiter";
import { KNOWN_DOMAINS, OFFICIAL_DOMAINS, domainOf, appForProgram } from "../catalog/apps";
import { KNOWN_MINTS, KNOWN_PROGRAMS, TOKEN_2022_PROGRAM } from "../solana/constants";
import { fmtNum, fmtPct, fmtUsd, shortAddr } from "../format";
import { levenshtein } from "../search/fuzzy";

const METHOD_TOKEN =
  "Rule-based checks on on-chain mint data (Solana RPC), holder distribution (largest token accounts) and market data (Jupiter). Each indicator is independent; there is no overall 'safe' score because none of these checks can prove a token is safe.";

function counts(ind: RiskIndicator[]): Record<RiskLevel, number> {
  const c: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
  for (const i of ind) c[i.level]++;
  return c;
}

function now() {
  return new Date().toISOString();
}

export async function tokenRisk(mint: string): Promise<RiskReport> {
  const ind: RiskIndicator[] = [];
  const [acct, largest, supply, jup] = await Promise.all([
    getAccountInfo(mint),
    getLargestAccounts(mint).catch(() => null),
    getTokenSupply(mint).catch(() => null),
    jupTokensByMint([mint]).then((m) => m.get(mint)).catch(() => undefined as Token | undefined),
  ]);
  if (!acct) throw new Error("Account not found on-chain");
  const parsed = !Array.isArray(acct.data) ? acct.data.parsed : undefined;
  if (!parsed || parsed.type !== "mint") throw new Error("This address is not a token mint");
  const info = parsed.info as {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    supply: string;
    decimals: number;
    extensions?: { extension: string; state?: Record<string, unknown> }[];
  };
  const stable = KNOWN_MINTS[mint]?.kind === "stable" || /^(USD|EUR|PYUSD)/i.test(jup?.symbol ?? "");

  ind.push(
    info.mintAuthority
      ? {
          id: "mint-authority",
          label: "Mint authority",
          level: stable ? "medium" : "high",
          value: shortAddr(info.mintAuthority),
          explanation: stable
            ? `Active (${shortAddr(info.mintAuthority)}). Normal for a fiat-backed stablecoin whose issuer mints and burns supply, but it means the issuer can create new tokens.`
            : `Active (${shortAddr(info.mintAuthority)}). This address can create unlimited new tokens, diluting holders.`,
        }
      : { id: "mint-authority", label: "Mint authority", level: "low", value: "Revoked", explanation: "No one can mint new supply." },
  );
  ind.push(
    info.freezeAuthority
      ? {
          id: "freeze-authority",
          label: "Freeze authority",
          level: stable ? "medium" : "high",
          value: shortAddr(info.freezeAuthority),
          explanation: stable
            ? "Active. Regulated stablecoin issuers keep this to comply with law enforcement requests; it can freeze any holder's tokens."
            : "Active. This address can freeze your tokens so you cannot sell or move them.",
        }
      : { id: "freeze-authority", label: "Freeze authority", level: "low", value: "Revoked", explanation: "No one can freeze holders' token accounts." },
  );

  if (acct.owner === TOKEN_2022_PROGRAM) {
    const exts = info.extensions ?? [];
    const names = exts.map((e) => e.extension);
    const risky: Record<string, [RiskLevel, string]> = {
      permanentDelegate: ["high", "A permanent delegate can transfer or burn tokens from any holder's account at any time."],
      transferHook: ["medium", "Every transfer calls an external program, which can add fees or block transfers."],
      transferFeeConfig: ["medium", "A fee is withheld on every transfer."],
      nonTransferable: ["medium", "Tokens cannot be transferred once received."],
      defaultAccountState: ["medium", "New token accounts may start frozen."],
      pausableConfig: ["medium", "The token can be paused, blocking all transfers."],
    };
    const flagged = names.filter((n) => risky[n]);
    if (flagged.length) {
      for (const n of flagged) ind.push({ id: `ext-${n}`, label: `Token-2022: ${n}`, level: risky[n][0], explanation: risky[n][1] });
    } else {
      ind.push({ id: "token-2022", label: "Token-2022 extensions", level: "low", value: names.length ? names.join(", ") : "none", explanation: "Uses the Token-2022 program without extensions that can seize, block or tax transfers." });
    }
  }

  if (largest && supply?.uiAmount) {
    const top10 = largest.slice(0, 10).reduce((s, l) => s + (l.uiAmount ?? 0), 0);
    const pct = (top10 / supply.uiAmount) * 100;
    ind.push({
      id: "concentration",
      label: "Top 10 account concentration",
      level: pct > 50 ? "high" : pct > 25 ? "medium" : "low",
      value: `${pct.toFixed(1)}%`,
      explanation: `The 10 largest token accounts hold ${pct.toFixed(1)}% of supply. Note that some large accounts are liquidity pools, exchanges or vesting contracts rather than individuals.`,
    });
  } else {
    ind.push({ id: "concentration", label: "Holder concentration", level: "unknown", explanation: "The RPC node did not return holder distribution for this token." });
  }

  if (jup) {
    const liq = jup.liquidity ?? 0;
    ind.push({
      id: "liquidity",
      label: "On-chain liquidity",
      level: liq < 10_000 ? "high" : liq < 250_000 ? "medium" : "low",
      value: fmtUsd(liq, { compact: true }),
      explanation: liq < 10_000 ? "Very thin liquidity: even small sells can move the price sharply, and you may not be able to exit." : liq < 250_000 ? "Moderate liquidity: larger trades will have noticeable price impact." : "Deep enough for typical retail trade sizes.",
    });
    if (jup.createdAt) {
      const ageDays = (Date.now() - new Date(jup.createdAt).getTime()) / 86400e3;
      ind.push({
        id: "age",
        label: "Token age",
        level: ageDays < 1 ? "high" : ageDays < 14 ? "medium" : "low",
        value: ageDays < 1 ? `${Math.max(1, Math.round(ageDays * 24))}h` : `${Math.round(ageDays)}d`,
        explanation: ageDays < 14 ? "Recently launched. New tokens have little track record and a high failure rate." : "Has traded for a while; age alone says nothing about quality.",
      });
    }
    if (jup.holders !== undefined) {
      ind.push({ id: "holders", label: "Holders", level: jup.holders < 500 ? "medium" : "low", value: fmtNum(jup.holders, { compact: true }), explanation: jup.holders < 500 ? "Few holders; price can be driven by a small group." : "Broadly held." });
    }
    ind.push({
      id: "verified",
      label: "Jupiter verification",
      level: jup.verified ? "low" : "medium",
      value: jup.verified ? "Verified" : "Not verified",
      explanation: jup.verified ? "Listed as verified by Jupiter's community verification process. This confirms identity, not quality." : "Not verified by Jupiter. Impersonator tokens often copy names and symbols of real projects; compare the mint address with the official source.",
    });
    if (jup.audit?.isSus) {
      ind.push({ id: "sus", label: "Flagged by Jupiter", level: "high", explanation: "Jupiter's audit data marks this token as suspicious." });
    }
    if (jup.change24h !== undefined && Math.abs(jup.change24h) > 50) {
      ind.push({ id: "volatility", label: "Extreme 24h move", level: "medium", value: fmtPct(jup.change24h), explanation: "Price moved more than 50% in 24 hours." });
    }
  } else {
    ind.push({ id: "market", label: "Market data", level: "unknown", explanation: "No market data found for this mint. It may not be tradable on major Solana DEXs." });
  }

  return { subject: mint, subjectType: "token", indicators: ind, counts: counts(ind), methodology: METHOD_TOKEN, meta: { provider: "Solana RPC + Jupiter", mode: "live", fetchedAt: now() } };
}

export async function addressRisk(address: string): Promise<RiskReport> {
  const acct = await getAccountInfo(address);
  const ind: RiskIndicator[] = [];
  if (!acct) {
    ind.push({ id: "exists", label: "Account", level: "unknown", value: "Not found", explanation: "This address has no on-chain account. It may be unused, or it may be a typo. Double-check before sending funds." });
    return { subject: address, subjectType: "wallet", indicators: ind, counts: counts(ind), methodology: "On-chain account lookup.", meta: { provider: "Solana RPC", mode: "live", fetchedAt: now() } };
  }
  if (acct.executable) {
    const known = KNOWN_PROGRAMS[address];
    ind.push({ id: "type", label: "Account type", level: known ? "low" : "medium", value: "Program", explanation: known ? `This is ${known.name}, a program in the STRATA registry.` : "This is an executable program that is not in the STRATA registry." });
    const parsed = !Array.isArray(acct.data) ? acct.data.parsed : undefined;
    const programData = parsed?.info?.programData as string | undefined;
    if (programData) {
      const pd = await getAccountInfo(programData).catch(() => null);
      const pdParsed = pd && !Array.isArray(pd.data) ? pd.data.parsed : undefined;
      const authority = pdParsed?.info?.authority as string | null | undefined;
      ind.push(
        authority
          ? { id: "upgrade", label: "Upgrade authority", level: "medium", value: shortAddr(authority), explanation: `The program can be changed by ${shortAddr(authority)}. Upgradeable programs are normal, but the code you trust today can be replaced; check whether the authority is a multisig or DAO.` }
          : { id: "upgrade", label: "Upgrade authority", level: "low", value: "Immutable", explanation: "The program can no longer be upgraded." },
      );
    }
    const app = appForProgram(address);
    if (app) ind.push({ id: "app", label: "Associated app", level: "low", value: app.name, explanation: `Registered as part of ${app.name}.` });
    return { subject: address, subjectType: "program", indicators: ind, counts: counts(ind), methodology: "On-chain program and program-data account inspection.", meta: { provider: "Solana RPC", mode: "live", fetchedAt: now() } };
  }
  const parsed = !Array.isArray(acct.data) ? acct.data.parsed : undefined;
  if (parsed?.type === "mint") return tokenRisk(address);

  ind.push({ id: "type", label: "Account type", level: "low", value: acct.owner === "11111111111111111111111111111111" ? "Wallet" : `Owned by ${KNOWN_PROGRAMS[acct.owner]?.name ?? shortAddr(acct.owner)}`, explanation: "Standard wallet accounts are owned by the System Program." });
  const sigs = await getSignatures(address, 100).catch(() => []);
  if (sigs.length) {
    const failed = sigs.filter((s) => s.err).length;
    const oldest = sigs[sigs.length - 1]?.blockTime;
    ind.push({ id: "activity", label: "Recent activity", level: "low", value: `${sigs.length}${sigs.length === 100 ? "+" : ""} txs`, explanation: `Found ${sigs.length === 100 ? "at least 100" : sigs.length} recent transactions${oldest ? `, going back to ${new Date(oldest * 1000).toLocaleDateString()}` : ""}.` });
    const ratio = failed / sigs.length;
    if (ratio > 0.4) ind.push({ id: "failures", label: "High failure rate", level: "medium", value: `${Math.round(ratio * 100)}%`, explanation: "Many recent transactions failed, which is typical of bots and spam senders." });
  } else {
    ind.push({ id: "activity", label: "Recent activity", level: "medium", value: "None", explanation: "No transaction history. Fresh addresses are sometimes used for scams; verify the recipient through another channel." });
  }
  ind.push({ id: "lamports", label: "SOL balance", level: "low", value: `${fmtNum(acct.lamports / 1e9)} SOL`, explanation: "Current native balance." });
  return { subject: address, subjectType: "wallet", indicators: ind, counts: counts(ind), methodology: "On-chain account type and recent transaction history. We do not label wallets as scams without verifiable evidence.", meta: { provider: "Solana RPC", mode: "live", fetchedAt: now() } };
}

/** Brand names too generic to signal impersonation ("solana" is in half the ecosystem's domains). */
const GENERIC_NAMES = new Set(["solana", "sol", "app", "web3", "crypto", "wallet", "chain"]);
/** Words drainer sites pair with a brand name: phantom-wallet-connect.com, jup-claim.xyz. */
const PHISHING_WORDS = /(claim|airdrop|reward|bonus|giveaway|connect|verify|validate|sync|rectify|support|recover|restore|unlock|secure|official|login|wallet)/i;
/** Look-alike characters: phant0m → phantom, raydiurn → raydium. */
const unconfuse = (s: string) => s.replace(/0/g, "o").replace(/1/g, "l").replace(/rn/g, "m").replace(/vv/g, "w").replace(/3/g, "e");
const isLocal = (host: string) => host === "localhost" || host.endsWith(".localhost") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "[::1]";

export function domainRisk(input: string): RiskReport {
  const ind: RiskIndicator[] = [];
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//.test(input) ? input : `https://${input}`);
  } catch {
    /* invalid */
  }
  if (!url) {
    ind.push({ id: "invalid", label: "URL", level: "unknown", explanation: "That doesn't look like a valid web address." });
  } else {
    const host = url.hostname.replace(/^www\./, "");
    const official = OFFICIAL_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
    const registered = KNOWN_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
    if (url.protocol !== "https:" && !isLocal(host)) ind.push({ id: "https", label: "Connection", level: "high", value: "Not HTTPS", explanation: "The site does not use HTTPS, so traffic can be intercepted or altered." });
    if (official) {
      ind.push({ id: "registry", label: "App registry", level: "low", value: registered ?? official, explanation: `${host} is an official domain in the STRATA registry. Always check the address bar for exact spelling.` });
    } else if (!isLocal(host)) {
      const labels = host.split(".");
      const base = labels.slice(-2).join(".");
      const name = labels.length >= 2 ? labels[labels.length - 2] : host;
      const words = host.split(/[.-]/);
      // A typosquat: one character off (phanton.app), or look-alike characters (phant0m.app, raydiurn.io).
      const close = OFFICIAL_DOMAINS.find((d) => {
        const dName = d.split(".")[0];
        if (dName.length < 4) return levenshtein(base, d) === 1;
        return (levenshtein(name, dName) === 1 && name.length >= 5) || (unconfuse(name) === dName && name !== dName);
      });
      // A brand name as its own word in the domain (phantom-wallet.com, jup-ag.xyz), not inside another word (tensorflow.org).
      const brand = OFFICIAL_DOMAINS.find((d) => {
        const dName = d.split(".")[0];
        if (GENERIC_NAMES.has(dName)) return false;
        return (dName.length >= 4 && words.includes(dName)) || host.includes(d.replace(/\./g, "-"));
      });
      const phishy = PHISHING_WORDS.test(host);
      if (close) {
        ind.push({ id: "lookalike", label: "Lookalike domain", level: "high", value: `looks like ${close}`, explanation: `${host} is almost the same as ${close}. Phishing sites use near-identical domains to steal wallet approvals.` });
      } else if (brand) {
        ind.push({
          id: "brand",
          label: phishy ? "Impersonates a known brand" : "Mentions a known brand",
          level: phishy ? "high" : "medium",
          value: brand,
          explanation: phishy ? `The domain uses the name of ${brand} with words drainer sites use, but it is not ${brand}'s official domain.` : `The domain uses the name of ${brand} but is not its official domain. Check it's really ${brand} before connecting a wallet.`,
        });
      } else {
        ind.push({ id: "registry", label: "App registry", level: "medium", value: "Not listed", explanation: "This domain is not in the STRATA app registry. That does not make it malicious, but be careful before connecting your wallet or signing." });
      }
      if (/(claim|airdrop|reward|bonus|free|giveaway|drop)/i.test(host)) {
        ind.push({ id: "bait", label: "Bait keywords", level: "high", explanation: "Domains promising airdrops, claims or rewards are the most common wallet-drainer pattern." });
      }
    }
  }
  return { subject: input, subjectType: "domain", indicators: ind, counts: counts(ind), methodology: "Registry match, typo-squatting distance and bait-keyword checks. Offline, rule based.", meta: { provider: "STRATA registry", mode: "live", fetchedAt: now() } };
}
