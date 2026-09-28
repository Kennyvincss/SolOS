/** What kind of page a URL is (for history and bookmarks). Same labels as the desktop app. */
export type PageType = "token" | "wallet" | "transaction" | "app" | "market" | "nft" | "research" | "search" | "ai" | "strata" | "website";

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  type: PageType;
  folderId: string | null;
  favorite: boolean;
  order: number;
  createdAt: number;
  updatedAt?: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  order: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  type: PageType;
  at: number;
  /** For searches and AI questions: what was typed. */
  query?: string;
}

export interface ReadingItem {
  id: string;
  url: string;
  title: string;
  type?: PageType;
  read: boolean;
  addedAt: number;
}

export const TYPE_LABEL: Record<PageType, string> = {
  token: "Token",
  wallet: "Wallet",
  transaction: "Transaction",
  app: "App",
  market: "Market",
  nft: "NFT collection",
  research: "Research",
  search: "Search",
  ai: "STRATA AI",
  strata: "STRATA",
  website: "Website",
};

export const DEFAULT_FOLDERS: BookmarkFolder[] = [
  { id: "f-trading", name: "Trading", order: 0 },
  { id: "f-defi", name: "DeFi", order: 1 },
  { id: "f-research", name: "Research", order: 2 },
  { id: "f-wallets", name: "Wallets", order: 3 },
  { id: "f-markets", name: "Markets", order: 4 },
  { id: "f-apps", name: "Apps", order: 5 },
];

export function folderForType(type: PageType): string | null {
  return ({ token: "f-trading", wallet: "f-wallets", transaction: "f-research", market: "f-markets", research: "f-research", app: "f-apps", nft: "f-apps" } as Partial<Record<PageType, string>>)[type] ?? null;
}
