/** Every destination in Solana OS. Drives the sidebar, command bar and search. */
export interface PageDef {
  href: string;
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  section: "core" | "explore" | "finance" | "you";
  nav?: boolean;
}

export const PAGES: PageDef[] = [
  { href: "/", title: "Home", description: "Your Solana OS home", icon: "Home", keywords: ["start", "dashboard"], section: "core", nav: true },
  { href: "/search", title: "Search", description: "Search everything on Solana", icon: "Search", keywords: ["find", "lookup"], section: "core", nav: true },
  { href: "/discover", title: "Discover", description: "Trending, new, movers and smart wallet activity", icon: "Compass", keywords: ["trending", "new", "movers", "explore"], section: "core", nav: true },
  { href: "/apps", title: "App Store", description: "Discover Solana applications", icon: "LayoutGrid", keywords: ["apps", "dapps", "store", "applications"], section: "core", nav: true },
  { href: "/extensions", title: "Extensions", description: "Add tools to your Solana OS", icon: "Puzzle", keywords: ["plugins", "widgets", "tools", "add-ons"], section: "core", nav: true },
  { href: "/ai", title: "Solana AI", description: "Ask anything about Solana", icon: "Sparkles", keywords: ["assistant", "chat", "ask", "gpt"], section: "core", nav: true },
  { href: "/tokens", title: "Tokens", description: "Prices, charts and token pages", icon: "Coins", keywords: ["prices", "coins", "charts", "memecoins"], section: "explore", nav: true },
  { href: "/wallets", title: "Wallets", description: "Explore and follow any public wallet", icon: "Wallet", keywords: ["explorer", "address", "follow", "whales"], section: "explore", nav: true },
  { href: "/tx", title: "Transaction Explainer", description: "Understand any transaction in plain English", icon: "ReceiptText", keywords: ["signature", "explain", "tx"], section: "explore" },
  { href: "/defi", title: "DeFi", description: "Swapping, lending, staking and yield", icon: "Landmark", keywords: ["yield", "lending", "staking", "apy", "liquidity"], section: "finance", nav: true },
  { href: "/rwa", title: "RWA", description: "Tokenized stocks, treasuries and credit", icon: "Building2", keywords: ["real world assets", "stocks", "treasuries"], section: "finance", nav: true },
  { href: "/payments", title: "Payments", description: "Solana Pay, stablecoins and merchants", icon: "CreditCard", keywords: ["pay", "stablecoin", "merchant", "qr"], section: "finance", nav: true },
  { href: "/news", title: "News", description: "Solana ecosystem news", icon: "Newspaper", keywords: ["headlines", "articles"], section: "explore", nav: true },
  { href: "/security", title: "Security", description: "Check tokens, wallets, programs, sites and transactions", icon: "ShieldCheck", keywords: ["scam", "rug", "risk", "audit", "check"], section: "explore", nav: true },
  { href: "/portfolio", title: "Portfolio", description: "Your assets, allocation and activity", icon: "PieChart", keywords: ["holdings", "balance", "pnl", "net worth"], section: "you", nav: true },
  { href: "/feed", title: "Feed", description: "Following, trending and community", icon: "Rss", keywords: ["social", "following", "community"], section: "you" },
  { href: "/workspace", title: "Workspace", description: "Your installed extensions", icon: "PanelsTopLeft", keywords: ["widgets", "installed"], section: "you" },
  { href: "/browser", title: "Browser", description: "Open Solana apps safely inside Solana OS", icon: "Globe", keywords: ["browse", "open app", "web"], section: "explore" },
  { href: "/notifications", title: "Notifications", description: "Alerts and updates", icon: "Bell", keywords: ["alerts", "inbox"], section: "you", nav: true },
  { href: "/profile", title: "Profile", description: "Your public profile", icon: "UserRound", keywords: ["account", "me"], section: "you" },
  { href: "/developers", title: "Developers", description: "Submit apps and extensions, APIs and SDK", icon: "Code2", keywords: ["build", "api", "sdk", "submit"], section: "you" },
  { href: "/settings", title: "Settings", description: "Preferences, privacy and data sources", icon: "Settings", keywords: ["preferences", "theme", "privacy"], section: "you", nav: true },
];
