import type { AppCategory, SearchIntent } from "../types";
import { APP_CATEGORIES } from "../types";
import { extractSolanaId } from "../solana/address";

/**
 * Natural-language intent detection for the universal search and command bar.
 * Rules are ordered from most to least specific. Anything phrased as a
 * question that doesn't map to a page is routed to Solana AI.
 */

const CATEGORY_ALIASES: Record<string, AppCategory> = {
  defi: "DeFi", lending: "DeFi", borrow: "DeFi", staking: "DeFi", yield: "DeFi", dex: "Trading", dexs: "Trading",
  trading: "Trading", perps: "Trading", perpetuals: "Trading", swap: "Trading", payments: "Payments", payment: "Payments",
  nft: "NFTs", nfts: "NFTs", gaming: "Gaming", games: "Gaming", game: "Gaming", ai: "AI",
  agents: "AI", social: "Social", rwa: "RWA", rwas: "RWA", depin: "DePIN", wallet: "Wallets", wallets: "Wallets",
  developer: "Developer Tools", developers: "Developer Tools", "dev tools": "Developer Tools", infrastructure: "Infrastructure",
  infra: "Infrastructure", rpc: "Infrastructure", dao: "DAOs", daos: "DAOs", security: "Security", multisig: "Security",
};

export function detectIntent(raw: string): SearchIntent {
  const q = raw.trim();
  const lower = q.toLowerCase();
  const id = extractSolanaId(q);

  if (id?.type === "signature") {
    return { type: "explain_tx", label: "Transaction", href: `/tx/${id.value}`, entity: id.value, aiPrompt: `Explain transaction ${id.value}` };
  }
  if (id?.type === "address") {
    const wantsSecurity = /\b(safe|scam|rug|risk|security|check|legit)\b/.test(lower);
    if (wantsSecurity) return { type: "security", label: "Security check", href: `/security?q=${id.value}`, entity: id.value };
    return { type: "analyze_wallet", label: "Address", href: `/wallets/${id.value}`, entity: id.value, aiPrompt: `Analyze wallet ${id.value}` };
  }

  if (/\b(my )?(portfolio|holdings|my wallet|my balance|net worth)\b/.test(lower) && /\bmy\b|portfolio/.test(lower)) {
    return { type: "portfolio", label: "Your portfolio", href: "/portfolio", aiPrompt: "Show me my portfolio" };
  }
  if (/\b(trending|hot|popular|top) (tokens?|coins?|memecoins?)\b|\btokens?.*\btrending\b|\btrending\b.*\btoday\b|what'?s trending/.test(lower)) {
    return { type: "trending_tokens", label: "Trending tokens", href: "/tokens?tab=trending", aiPrompt: q };
  }
  if (/\b(whale|whales|smart money|smart wallets?|big wallets?)\b/.test(lower)) {
    return { type: "whales", label: "Smart wallet activity", href: "/discover#smart-wallets", aiPrompt: q };
  }
  if (/\b(new|newest|latest|recent)\b.*\b(apps?|projects?|protocols?|launch(es)?)\b/.test(lower)) {
    return { type: "new_apps", label: "New on Solana", href: "/discover#new", aiPrompt: q };
  }
  if (/\b(today|happening|news|latest)\b/.test(lower) && !/\btokens?\b/.test(lower)) {
    return { type: "today", label: "Today on Solana", href: "/news", aiPrompt: q };
  }
  if (/\b(vs\.?|versus|compare|comparison|better than)\b/.test(lower)) {
    return { type: "compare", label: "Comparison", aiPrompt: q };
  }
  if (/\b(yield|apy|apr|earn|interest|lend(ing)?|stake|staking)\b/.test(lower) || /what can i do with/.test(lower)) {
    return { type: "yield", label: "Earn on Solana", href: "/defi", aiPrompt: q };
  }
  if (/\b(safe|scam|rug|risk|audit|drainer|phishing)\b/.test(lower)) {
    return { type: "security", label: "Security", href: "/security", aiPrompt: q };
  }
  for (const [alias, cat] of Object.entries(CATEGORY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(lower) && /\b(apps?|protocols?|projects?|tools?|platforms?)\b/.test(lower)) {
      return { type: "category", label: `${cat} apps`, href: `/apps?category=${encodeURIComponent(cat)}`, category: cat };
    }
  }
  const exactCat = APP_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (exactCat) return { type: "category", label: `${exactCat} apps`, href: `/apps?category=${encodeURIComponent(exactCat)}`, category: exactCat };

  const questionLike = /\?$/.test(q) || /^(what|why|how|who|when|where|which|is|are|can|should|does|do|explain|tell me|help)\b/.test(lower) || q.split(/\s+/).length >= 6;
  if (questionLike) return { type: "question", label: "Ask Solana AI", href: `/ai?q=${encodeURIComponent(q)}`, aiPrompt: q };

  return { type: "lookup", label: "Results" };
}
