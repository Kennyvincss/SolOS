import "server-only";
import type { AiEvent, ChatTurn } from "./protocol";
import { classifyAddress } from "../services/account";
import { runTool, TOOL_LABELS, type ToolContext, type ToolName, type ToolOutput } from "./tools";
import { detectIntent } from "../search/intent";
import { extractSolanaId } from "../solana/address";
import { fmtPct, fmtUsd, shortAddr } from "../format";
import { APP_CATEGORIES } from "../types";
import { idsInUrl } from "../library/classify";

/**
 * Offline STRATA AI: used when no language model is configured
 * (GROQ_API_KEY unset). It maps the question to the same data tools and
 * writes a templated answer. It's honest about being template-based.
 */

type Plan = { tool: ToolName; input: Record<string, unknown> }[];

async function plan(q: string, ctx: ToolContext): Promise<Plan> {
  const lower = q.toLowerCase();
  // "this token / wallet / transaction / page": use the page the user is viewing.
  const aboutPage = /\b(this|that|the page|current page|here)\b/i.test(q) && ctx.user?.pageUrl;
  const pageIds = aboutPage ? idsInUrl(ctx.user!.pageUrl!) : {};
  const id = extractSolanaId(q) ?? (pageIds.signature ? { type: "signature" as const, value: pageIds.signature } : pageIds.address ? { type: "address" as const, value: pageIds.address } : null);
  const intent = detectIntent(q);
  if (id?.type === "signature") return [{ tool: "explain_transaction", input: { signature: id.value } }];
  if (id?.type === "address") {
    if (intent.type === "security") return [{ tool: "check_security", input: { target: id.value } }];
    // Token contract addresses and programs aren't wallets.
    const kind = await classifyAddress(id.value).catch(() => null);
    if (kind?.type === "mint") return [{ tool: "get_token", input: { token: id.value } }];
    if (kind?.type === "program" || kind?.type === "other") return [{ tool: "check_security", input: { target: id.value } }];
    return [
      { tool: "get_wallet_portfolio", input: { address: id.value } },
      { tool: "get_wallet_activity", input: { address: id.value } },
    ];
  }
  const install = q.match(/\b(?:install|add|get|download)\s+(?:the\s+)?(.+?)(?:\s+(?:extension|wallet|add-?on))?\s*[?.!]*$/i);
  if (install && /\b(extension|wallet|phantom|solflare|backpack|install)\b/i.test(q)) return [{ tool: "install_extension", input: { name: install[1].replace(/\b(extension|wallet)\b/gi, "").trim() || install[1] } }];
  if (/\b(wallets?|address(es)?)\s+(i'?m|i am)\s+following\b|\bfollowed wallets?\b/i.test(q)) {
    const f = ctx.user?.followed ?? [];
    if (!f.length) return [{ tool: "open_page", input: { path: "/wallets", label: "Explore Wallets" } }];
    return f.slice(0, 3).flatMap((w) => [{ tool: "get_wallet_portfolio" as ToolName, input: { address: w.address } }]);
  }
  const open = q.match(/\b(?:open|go to|take me to|show me)\s+(?:the\s+)?(extensions|portfolio|security|news|defi|apps|app store|settings|profile|feed|notifications|wallets|payments|rwa)\b/i);
  if (open) {
    const map: Record<string, string> = { "app store": "/apps", apps: "/apps", wallets: "/wallets" };
    const k = open[1].toLowerCase();
    return [{ tool: "open_page", input: { path: map[k] ?? `/${k}`, label: open[1] } }];
  }
  const domain = q.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i);
  if (domain && /\b(safe|scam|legit|check|phish|risk)\b/.test(lower)) return [{ tool: "check_security", input: { target: domain[0] } }];

  switch (intent.type) {
    case "portfolio":
      return ctx.wallet ? [{ tool: "get_wallet_portfolio", input: { address: "me" } }, { tool: "get_wallet_activity", input: { address: "me" } }] : [];
    case "trending_tokens":
      return [{ tool: "get_token_list", input: { list: "trending", limit: 10 } }];
    case "whales":
      return [{ tool: "get_token_list", input: { list: "top_traded", limit: 10 } }];
    case "new_apps":
      return [{ tool: "get_token_list", input: { list: "new", limit: 8 } }, { tool: "find_apps", input: {} }];
    case "today":
      return [{ tool: "get_news", input: {} }, { tool: "get_token_list", input: { list: "trending", limit: 5 } }, { tool: "get_network_status", input: {} }];
    case "yield": {
      const asset = lower.match(/\b(usdc|usdt|sol|jitosol|msol|pyusd|jup)\b/)?.[1];
      return [{ tool: "get_defi_yields", input: asset ? { asset } : {} }];
    }
    case "compare": {
      const names = q.split(/\b(?:vs\.?|versus|compare|and|with|to)\b|,/i).map((s) => s.replace(/[?.!]/g, "").trim()).filter((s) => s && s.length < 40);
      return [{ tool: "get_protocols", input: { names: names.slice(0, 4) } }];
    }
    case "category":
      return [{ tool: "find_apps", input: { category: intent.category } }];
    case "security":
      return [];
  }
  if (/\bgainers?|pumping|up the most\b/.test(lower)) return [{ tool: "get_token_list", input: { list: "gainers", limit: 10 } }];
  if (/\blosers?|dumping|down the most\b/.test(lower)) return [{ tool: "get_token_list", input: { list: "losers", limit: 10 } }];
  if (/\b(most active|most traded|volume)\b/.test(lower)) return [{ tool: "get_token_list", input: { list: "top_traded", limit: 10 } }];
  if (/\b(network|tps|fees?|congest)/.test(lower)) return [{ tool: "get_network_status", input: {} }];
  const cat = APP_CATEGORIES.find((c) => lower.includes(c.toLowerCase()));
  if (cat && /\bapps?|projects?|tools?\b/.test(lower)) return [{ tool: "find_apps", input: { category: cat } }];
  const sym = q.match(/\$([A-Za-z0-9]{2,10})\b/)?.[1] ?? q.match(/\b(SOL|JUP|BONK|JTO|PYTH|RAY|WIF|ORCA|RENDER|HNT|USDC|USDT|KMNO|DRIFT)\b/)?.[1];
  if (sym) return [{ tool: "get_token", input: { token: sym } }];
  return [{ tool: "search_solana", input: { query: q } }];
}

function write(tool: ToolName, out: ToolOutput): string {
  const r = out.result as Record<string, unknown>;
  const demo = r.dataMode === "demo" ? "\n\n> These figures are **sample figures**: live data is temporarily unavailable." : "";
  switch (tool) {
    case "get_token": {
      if (r.found === false) return "I couldn't find that token.";
      return `**${r.name} (${r.symbol})** is trading at **${fmtUsd(r.priceUsd as number)}**, ${fmtPct(r.change24h as number)} over 24h and ${fmtPct(r.change7d as number)} over 7 days. Market cap ${fmtUsd(r.marketCap as number, { compact: true })}, 24h volume ${fmtUsd(r.volume24h as number, { compact: true })}, liquidity ${fmtUsd(r.liquidity as number, { compact: true })}.\n\n[Open the ${r.symbol} page](${r.link}) for the chart, holders and risk indicators.${demo}`;
    }
    case "get_token_list": {
      const tokens = (r.tokens as { symbol: string; change24h?: number; volume24h?: number; link: string }[]) ?? [];
      if (!tokens.length) return "No tokens returned right now.";
      return `Here's the current **${String(r.list).replace("_", " ")}** list (${r.dataMode === "demo" ? "sample figures" : "live"}):\n\n${tokens.slice(0, 8).map((t, i) => `${i + 1}. [${t.symbol}](${t.link}) — ${fmtPct(t.change24h)} 24h, volume ${fmtUsd(t.volume24h, { compact: true })}`).join("\n")}\n\nTrending reflects attention and trading activity, not quality. Check each token's risk indicators before trading.${demo}`;
    }
    case "get_wallet_portfolio": {
      const holdings = (r.holdings as { symbol: string; valueUsd?: number; amount: number }[]) ?? [];
      return `Wallet [${shortAddr(r.address as string)}](${r.link}) holds **${r.totalUsd !== undefined ? fmtUsd(r.totalUsd as number) : "an unpriced balance"}** across ${holdings.length} assets${r.change24hPct !== undefined ? ` (${fmtPct(r.change24hPct as number)} today)` : ""}.\n\n${holdings.slice(0, 6).map((h) => `- **${h.symbol}**: ${h.amount}${h.valueUsd !== undefined ? ` (${fmtUsd(h.valueUsd)})` : ""}`).join("\n")}${demo}`;
    }
    case "get_wallet_activity": {
      const items = (r.activity as { summary: string; link: string }[]) ?? [];
      return items.length ? `**Recent activity**\n\n${items.slice(0, 6).map((a) => `- [${a.summary}](${a.link})`).join("\n")}` : "No recent transactions found.";
    }
    case "explain_transaction":
      return `**What happened:** ${r.headline}\n\n${(r.details as string[]).map((d) => `- ${d}`).join("\n")}\n\n[Full breakdown](${r.link})`;
    case "check_security": {
      const ind = (r.indicators as { label: string; level: string; value?: string; explanation: string }[]) ?? [];
      return `**Risk indicators** (rule-based, not a guarantee):\n\n${ind.map((i) => `- **${i.label}** — ${i.level.toUpperCase()}${i.value ? ` (${i.value})` : ""}: ${i.explanation}`).join("\n")}`;
    }
    case "find_apps": {
      const apps = (r.apps as { name: string; tagline: string; link: string }[]) ?? [];
      return `**Solana apps**\n\n${apps.slice(0, 8).map((a) => `- [${a.name}](${a.link}) — ${a.tagline}`).join("\n")}`;
    }
    case "get_news": {
      const items = (r.items as { title: string; source: string; url: string }[]) ?? [];
      return `**Latest Solana news**\n\n${items.slice(0, 6).map((n) => `- [${n.title}](${n.url}) — _${n.source}_`).join("\n")}${demo}`;
    }
    case "get_defi_yields": {
      const pools = (r.pools as { project: string; symbol: string; apy?: number; tvlUsd: number }[]) ?? [];
      return `**Yield opportunities on Solana** (sorted by total value locked):\n\n${pools.slice(0, 8).map((p) => `- **${p.project}** ${p.symbol}: ${p.apy !== undefined ? `${p.apy.toFixed(2)}% APY` : "APY n/a"}, TVL ${fmtUsd(p.tvlUsd, { compact: true })}`).join("\n")}\n\nAPYs are variable and include smart-contract risk. This is information, not financial advice. [Compare in the DeFi hub](/defi)${demo}`;
    }
    case "get_protocols": {
      const p = (r.protocols as { name: string; category: string; tvlUsdOnSolana?: number; change7d?: number }[]) ?? [];
      return `**Protocol comparison**:\n\n| Protocol | Category | TVL on Solana | 7d |\n|---|---|---|---|\n${p.map((x) => `| ${x.name} | ${x.category} | ${fmtUsd(x.tvlUsdOnSolana, { compact: true })} | ${fmtPct(x.change7d)} |`).join("\n")}${demo}`;
    }
    case "identify_address":
      return `That address is a **${r.kind}**. [Open it](${r.link}).`;
    case "get_network_status":
      return `**Network**: slot ${Number(r.slot).toLocaleString()}, epoch ${r.epoch} (${Math.round(Number(r.epochProgress) * 100)}% complete)${r.tps ? `, ~${Math.round(Number(r.tps)).toLocaleString()} TPS` : ""}.`;
    case "open_page":
      return `Opening [${out.action?.label ?? "the page"}](${out.action?.href ?? "/"}).`;
    case "install_extension":
      return r.alreadyInstalled ? `**${r.name}** is already installed.` : `${r.note ?? ""} [Open ${r.name} on the Extensions page](${out.action?.href ?? "/extensions"}).`;
    case "search_solana": {
      const groups = (r.groups as { type: string; results: { title: string; link: string; detail?: string }[] }[]) ?? [];
      if (!groups.length) return "I couldn't find anything matching that on STRATA.";
      return groups.slice(0, 4).map((g) => `**${g.type}**\n${g.results.slice(0, 4).map((x) => `- [${x.title}](${x.link})${x.detail ? ` — ${x.detail}` : ""}`).join("\n")}`).join("\n\n");
    }
  }
}

export async function* offlineChat(history: ChatTurn[], ctx: ToolContext, reason: "no-key" | "busy" = "no-key"): AsyncGenerator<AiEvent> {
  yield { type: "meta", engine: "offline" };
  const q = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  // Summaries need the language model; without it, show what the page says.
  const u = ctx.user;
  if (/\b(summari[sz]e|tl;?dr|what does this page)\b/i.test(q) && u?.pageText && !idsInUrl(u.pageUrl ?? "").signature) {
    const excerpt = u.pageText.replace(/\s+\n/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l.length > 40).slice(0, 6);
    const text = `**${u.pageTitle || "This page"}**\n\n${u.pageDescription ? `${u.pageDescription}\n\n` : ""}${excerpt.map((l) => `- ${l.slice(0, 220)}`).join("\n")}${reason === "busy" ? "\n\n> STRATA AI is busy, so this is the page's own text. Ask again in a minute for a real summary." : ""}`;
    for (let i = 0; i < text.length; i += 24) yield { type: "text", delta: text.slice(i, i + 24) };
    yield { type: "done" };
    return;
  }
  const steps = await plan(q, ctx);
  const intent = detectIntent(q);

  if (!steps.length) {
    if (intent.type === "portfolio") {
      yield { type: "text", delta: "Connect your wallet (bottom of the sidebar) and I'll show your portfolio. Or paste any public wallet address to analyze it." };
    } else {
      yield { type: "text", delta: "Paste a token mint, wallet address, program id, website or transaction signature and I'll run the security checks. You can also open the [Security Center](/security)." };
    }
    yield { type: "done" };
    return;
  }
  const sources = [];
  const parts: string[] = [];
  for (const [i, s] of steps.entries()) {
    const id = `offline-${i}`;
    yield { type: "tool", id, name: s.tool, label: TOOL_LABELS[s.tool], status: "running" };
    try {
      const out = await runTool(s.tool, s.input, ctx);
      yield { type: "tool", id, name: s.tool, label: TOOL_LABELS[s.tool], status: "done" };
      if (out.card) yield { type: "card", card: out.card };
      if (out.action) yield { type: "action", action: out.action };
      sources.push(...out.sources);
      parts.push(write(s.tool, out));
    } catch (e) {
      yield { type: "tool", id, name: s.tool, label: TOOL_LABELS[s.tool], status: "error", error: e instanceof Error ? e.message : "failed" };
      parts.push("I couldn't load that right now. Please try again in a moment.");
    }
  }
  const note =
    reason === "busy"
      ? "> STRATA AI is busy, so here's a quick answer from the data. Ask again in a minute for a fuller one."
      : "";
  const text = parts.join("\n\n") + (note ? "\n\n" + note : "");
  // Stream in small chunks so the UI behaves the same as with a model.
  for (let i = 0; i < text.length; i += 24) yield { type: "text", delta: text.slice(i, i + 24) };
  if (sources.length) yield { type: "sources", sources };
  yield { type: "done" };
}
