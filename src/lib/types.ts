/**
 * Domain types shared by the server services, API routes and the UI.
 *
 * Every piece of data that leaves a provider is wrapped in `Sourced<T>` so the
 * UI can always tell the user where it came from and whether it is live
 * blockchain/market data or clearly-labelled demo data.
 */

export type DataMode = "live" | "demo";

export interface DataMeta {
  /** Human readable provider name, e.g. "Solana RPC", "Jupiter", "DefiLlama". */
  provider: string;
  mode: DataMode;
  fetchedAt: string;
  /** Optional explanation, e.g. why the live provider was not used. */
  note?: string;
}

export interface Sourced<T> {
  data: T;
  meta: DataMeta;
}

/* ------------------------------------------------------------------ tokens */

export interface TokenAudit {
  mintAuthorityDisabled?: boolean;
  freezeAuthorityDisabled?: boolean;
  /** Share of supply held by the top holders, 0-100. */
  topHoldersPercentage?: number;
  isSus?: boolean;
}

export interface Token {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals?: number;
  priceUsd?: number;
  change1h?: number;
  change24h?: number;
  change7d?: number;
  change30d?: number;
  marketCap?: number;
  fdv?: number;
  volume24h?: number;
  liquidity?: number;
  holders?: number;
  circulatingSupply?: number;
  totalSupply?: number;
  verified?: boolean;
  tags?: string[];
  launchpad?: string;
  createdAt?: string;
  audit?: TokenAudit;
  website?: string;
  twitter?: string;
}

export interface PricePoint {
  /** Unix ms */
  t: number;
  v: number;
}

export interface TokenHolder {
  address: string;
  amount: number;
  percentage?: number;
}

/* ------------------------------------------------------------------ wallets */

export type HoldingKind = "sol" | "stable" | "lst" | "token" | "nft" | "rwa";

export interface Holding {
  mint: string;
  symbol?: string;
  name?: string;
  icon?: string;
  amount: number;
  decimals: number;
  priceUsd?: number;
  valueUsd?: number;
  change24h?: number;
  kind: HoldingKind;
  tokenProgram?: "spl-token" | "token-2022";
}

export interface Portfolio {
  address: string;
  solBalance: number;
  totalUsd?: number;
  /** Value-weighted 24h change in % where prices carry a 24h change. */
  change24hPct?: number;
  holdings: Holding[];
  nfts: Holding[];
  /** Tokens for which no price is known. */
  unpricedCount: number;
  pnl: PnlSummary;
}

export interface PnlSummary {
  /** PnL needs historical cost basis which only an indexer can provide. */
  available: boolean;
  reason?: string;
  d1?: number;
  d7?: number;
  d30?: number;
  allTime?: number;
}

export type ActivityKind =
  | "swap"
  | "transfer_in"
  | "transfer_out"
  | "stake"
  | "nft"
  | "program"
  | "failed"
  | "unknown";

export interface ActivityItem {
  signature: string;
  blockTime?: number;
  slot: number;
  status: "success" | "failed";
  kind: ActivityKind;
  summary: string;
  programs: ProgramRef[];
  fee?: number;
}

/* ------------------------------------------------------------- transactions */

export interface ProgramRef {
  id: string;
  name: string;
  known: boolean;
  app?: string;
}

export interface BalanceChange {
  owner: string;
  mint: string;
  symbol?: string;
  decimals: number;
  change: number;
}

export interface TxExplanation {
  signature: string;
  slot: number;
  blockTime?: number;
  status: "success" | "failed";
  error?: string;
  feeSol: number;
  feePayer: string;
  signers: string[];
  programs: ProgramRef[];
  headline: string;
  details: string[];
  kind: ActivityKind;
  balanceChanges: BalanceChange[];
  /** Change for the fee payer only, the "you" in the headline. */
  payerChanges: BalanceChange[];
  instructions: { program: string; programName: string; type?: string; info?: Record<string, unknown> }[];
  logs?: string[];
  computeUnits?: number;
}

/* ------------------------------------------------------------------ catalog */

export const APP_CATEGORIES = [
  "DeFi",
  "Trading",
  "Payments",
  "NFTs",
  "Gaming",
  "AI",
  "Social",
  "RWA",
  "DePIN",
  "Wallets",
  "Developer Tools",
  "Infrastructure",
  "DAOs",
  "Security",
  "Other",
] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];

export interface AppEntry {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  subcategories?: string[];
  website: string;
  appUrl?: string;
  twitter?: string;
  discord?: string;
  github?: string;
  docs?: string;
  /** Year the product launched on Solana (only set when publicly known). */
  launched?: number;
  token?: { symbol: string; mint: string };
  programs?: { id: string; name: string }[];
  developer: string;
  /** Names used to find this project in DefiLlama (TVL, volume). */
  llama?: string[];
  audits?: string[];
  bugBounty?: string;
  /** Brand color for the monogram when no logo is available. */
  color: string;
  featured?: boolean;
  keywords?: string[];
}

export interface AppMetrics {
  tvlUsd?: number;
  change1d?: number;
  change7d?: number;
  volume24h?: number;
  fees24h?: number;
  logo?: string;
  llamaCategory?: string;
}

/* --------------------------------------------------------------------- news */

export const NEWS_CATEGORIES = [
  "Solana",
  "DeFi",
  "Tokens",
  "Apps",
  "AI",
  "RWA",
  "Payments",
  "Gaming",
  "Infrastructure",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  categories: NewsCategory[];
}

/* ---------------------------------------------------------------------- defi */

export const DEFI_CATEGORIES = [
  "Swapping",
  "Lending",
  "Borrowing",
  "Staking",
  "Liquid staking",
  "Liquidity providing",
  "Perpetuals",
  "Yield",
  "Restaking",
  "Stablecoins",
] as const;
export type DefiCategory = (typeof DEFI_CATEGORIES)[number];

export interface YieldPool {
  id: string;
  project: string;
  symbol: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd: number;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
  category: DefiCategory;
}

export interface Protocol {
  name: string;
  slug: string;
  category: string;
  tvlUsd?: number;
  change1d?: number;
  change7d?: number;
  logo?: string;
  url?: string;
  twitter?: string;
  description?: string;
}

/* -------------------------------------------------------------------- search */

export type SearchKind =
  | "answer"
  | "token"
  | "wallet"
  | "transaction"
  | "app"
  | "project"
  | "protocol"
  | "news"
  | "extension"
  | "page"
  | "nft"
  | "developer";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: string;
  color?: string;
  score: number;
  badge?: string;
  meta?: Record<string, string | number | undefined>;
}

export interface SearchIntent {
  type:
    | "trending_tokens"
    | "new_apps"
    | "whales"
    | "analyze_wallet"
    | "explain_tx"
    | "today"
    | "compare"
    | "category"
    | "yield"
    | "security"
    | "portfolio"
    | "question"
    | "lookup";
  /** Plain-English label shown above the answer card. */
  label: string;
  /** Route that best answers the query. */
  href?: string;
  entity?: string;
  category?: string;
  /** Question to hand to Solana AI. */
  aiPrompt?: string;
}

export interface SearchResponse {
  query: string;
  intent: SearchIntent;
  groups: { kind: SearchKind; label: string; hits: SearchHit[] }[];
  tookMs: number;
  meta: DataMeta[];
}

/* -------------------------------------------------------------------- risk */

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface RiskIndicator {
  id: string;
  label: string;
  level: RiskLevel;
  value?: string;
  explanation: string;
}

export interface RiskReport {
  subject: string;
  subjectType: "token" | "wallet" | "program" | "transaction" | "app" | "domain";
  indicators: RiskIndicator[];
  /** Summary counts only. We never compute a blanket "SAFE" verdict. */
  counts: Record<RiskLevel, number>;
  methodology: string;
  meta: DataMeta;
}
