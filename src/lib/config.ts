/**
 * Server-side configuration. Everything is optional: with no environment at
 * all Solana OS still runs, using public endpoints and falling back to
 * clearly-labelled demo data when an upstream is unreachable.
 */
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

/**
 * SOLANA_RPC_URL should be a full URL, but a bare Helius API key (a UUID) is
 * accepted too. Anything else falls back to the public endpoint.
 */
export function normalizeRpcUrl(value: string | undefined): string {
  if (!value) return PUBLIC_RPC;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return `https://mainnet.helius-rpc.com/?api-key=${value}`;
  }
  console.warn("[solana-os] SOLANA_RPC_URL is not a URL; using the public Solana RPC instead");
  return PUBLIC_RPC;
}

export type DataModeSetting = "auto" | "live" | "demo";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const config = {
  /** auto = live with labelled demo fallback; live = never fall back; demo = never call upstreams. */
  dataMode: (env("DATA_MODE") as DataModeSetting | undefined) ?? "auto",
  rpcUrl: normalizeRpcUrl(env("SOLANA_RPC_URL")),
  jupiterApi: env("JUPITER_API_URL") ?? "https://lite-api.jup.ag",
  jupiterApiKey: env("JUPITER_API_KEY"),
  geckoTerminalApi: env("GECKOTERMINAL_API_URL") ?? "https://api.geckoterminal.com/api/v2",
  llamaApi: env("DEFILLAMA_API_URL") ?? "https://api.llama.fi",
  llamaYieldsApi: env("DEFILLAMA_YIELDS_URL") ?? "https://yields.llama.fi",
  newsFeeds: (env("NEWS_FEEDS") ??
    [
      "Solana|https://solana.com/news/rss.xml",
      "CoinDesk|https://www.coindesk.com/arc/outboundfeeds/rss/",
      "Decrypt|https://decrypt.co/feed",
      "The Block|https://www.theblock.co/rss.xml",
      "Blockworks|https://blockworks.co/feed",
    ].join(","))
    .split(",")
    .map((s) => {
      const [name, url] = s.split("|");
      return { name: name.trim(), url: (url ?? name).trim() };
    }),
  groqKey: env("GROQ_API_KEY"),
  /** Optional. When unset, Solana AI picks a tool-capable model from the ones your Groq key can use. */
  groqModel: env("GROQ_MODEL"),
  groqApiUrl: env("GROQ_API_URL") ?? "https://api.groq.com/openai/v1",
  authSecret: env("AUTH_SECRET"),
  appUrl: env("APP_URL") ?? (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined),
  googleClientId: env("GOOGLE_CLIENT_ID"),
  googleClientSecret: env("GOOGLE_CLIENT_SECRET"),
  resendApiKey: env("RESEND_API_KEY"),
  emailFrom: env("EMAIL_FROM") ?? "Solana OS <login@example.com>",
  isProd: process.env.NODE_ENV === "production",
};

export function capabilities() {
  return {
    dataMode: config.dataMode,
    ai: config.groqKey ? ("groq" as const) : ("offline" as const),
    auth: {
      wallet: true,
      google: Boolean(config.googleClientId && config.googleClientSecret),
      email: Boolean(config.resendApiKey) || !config.isProd,
    },
  };
}

