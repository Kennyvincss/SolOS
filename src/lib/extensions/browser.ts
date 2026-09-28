/**
 * Real browser extensions for Solana, installed from the Chrome Web Store.
 *
 * In the Solana OS desktop app they install with one click and run exactly as
 * in Chrome (toolbar icon, popups, approvals). In other browsers the links go
 * to the Chrome Web Store. The desktop app double-checks that the store's name
 * for each ID matches before keeping an install.
 */

export interface BrowserExtension {
  /** Chrome Web Store ID. */
  id: string;
  name: string;
  description: string;
  kind: "Wallet";
  color: string;
  /** App Store slug, for the logo and app page. */
  app?: string;
}

export const BROWSER_EXTENSIONS: BrowserExtension[] = [
  { id: "bfnaelmomeimhlpmgjnjophhpkkoljpa", name: "Phantom", app: "phantom", kind: "Wallet", color: "#ab9ff2", description: "The most used Solana wallet. Also supports Ethereum, Base, Sui and Bitcoin." },
  { id: "bhhhlbepdkbapadjdnnojkbgioiodbic", name: "Solflare", app: "solflare", kind: "Wallet", color: "#fc7227", description: "Solana-native wallet with staking, swaps and Ledger support." },
  { id: "aflkmfhebedbjioipglgcbcmnbpgliof", name: "Backpack", app: "backpack", kind: "Wallet", color: "#e33e3f", description: "Wallet from the team behind the Backpack exchange and Mad Lads." },
  { id: "mcohilncbfahbmgdjkbpemcciiolgcge", name: "OKX Wallet", kind: "Wallet", color: "#d4d4d4", description: "Multi-chain wallet from OKX with Solana support and a built-in DEX." },
  { id: "hnfanknocfeofbddgcijnmhnfnkdnaad", name: "Coinbase Wallet", kind: "Wallet", color: "#3b82f6", description: "Self-custodial wallet from Coinbase that supports Solana." },
  { id: "egjidjbpglichdcondbcbdnbeeppgdph", name: "Trust Wallet", kind: "Wallet", color: "#3375bb", description: "Multi-chain self-custodial wallet with Solana support." },
  { id: "jiidiaalihmmhddjgbnbgdfflelocpak", name: "Bitget Wallet", kind: "Wallet", color: "#22d3ee", description: "Multi-chain wallet with Solana support and swaps." },
  { id: "aholpfdialjgjfhomihkjbmgjidlcdno", name: "Exodus Web3 Wallet", kind: "Wallet", color: "#8b5cf6", description: "Browser wallet from Exodus with Solana support." },
  { id: "aeachknmefphepccionboohckonoeemg", name: "Coin98 Wallet", kind: "Wallet", color: "#d9b432", description: "Multi-chain wallet with Solana support." },
];

export const chromeWebStoreUrl = (id: string) => `https://chromewebstore.google.com/detail/${id}`;
/** Everything else: the Chrome Web Store's own search. */
export const CHROME_WEB_STORE_SOLANA_SEARCH = "https://chromewebstore.google.com/search/solana";
