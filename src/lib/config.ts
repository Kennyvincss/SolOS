/**
 * Server-side configuration. Everything is optional: with no environment at
 * all Solana OS still runs, using public endpoints and falling back to
 * clearly-labelled demo data when an upstream is unreachable.
 */
export type DataModeSetting = "auto" | "live" | "demo";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const config = {
  /** auto = live with labelled demo fallback; live = never fall back; demo = never call upstreams. */
  dataMode: (env("DATA_MODE") as DataModeSetting | undefined) ?? "auto",
  rpcUrl: env("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
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
  groqModel: env("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
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
    customRpc: config.rpcUrl !== "https://api.mainnet-beta.solana.com",
  };
}

