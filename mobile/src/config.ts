import Constants from "expo-constants";

/** The STRATA web app shown on the home tab. Set SOLANA_OS_URL when building to point elsewhere. */
export const SOLANA_OS_URL = String(Constants.expoConfig?.extra?.solanaOsUrl ?? "https://solos-rho.vercel.app").replace(/\/+$/, "");
export const SOLANA_OS_ORIGIN = new URL(SOLANA_OS_URL).origin;
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
/** URL scheme wallets redirect back to (must match "scheme" in app.config.ts). */
export const SCHEME = "solanaos";
export const MAX_TABS = 12;
