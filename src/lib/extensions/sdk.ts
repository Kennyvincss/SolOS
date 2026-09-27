/**
 * Solana OS Extension SDK — v0.1
 *
 * Extensions are sandboxed widgets that talk to Solana OS only through the
 * `ExtensionHost` API. Every host capability is gated by a permission that
 * the extension declares in its manifest and the user grants on install.
 *
 * Today, built-in extensions run in-process as React components. The same
 * manifest + host contract is what third-party extensions will target when
 * they run inside sandboxed iframes (the host API is serialisable: every call
 * is `(method, args) => Promise<result>`), so extension code does not change
 * when the transport does.
 */
import { z } from "zod";

export const PERMISSIONS = {
  search: "Search the Solana OS index",
  "wallet:read": "See your connected wallet address and balances",
  "tokens:read": "Read token prices and metadata",
  "portfolio:read": "Read your portfolio",
  "prefs:read": "Read its own settings",
  "prefs:write": "Save its own settings",
  notifications: "Send you notifications",
  ai: "Ask Solana AI questions",
  "programs:read": "Read on-chain accounts",
  "network:read": "Read Solana network status",
  "news:read": "Read news headlines",
  "markets:read": "Read prediction market data",
  "defi:read": "Read DeFi protocols and yields",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const EXTENSION_CATEGORIES = ["Wallets", "Trading", "Portfolio", "Security", "DeFi", "NFTs", "Markets", "News", "AI", "Network"] as const;

export const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "lowercase letters, numbers, dots and dashes"),
  name: z.string().min(2).max(40),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver, e.g. 1.0.0"),
  author: z.string().min(2).max(60),
  description: z.string().min(10).max(280),
  category: z.enum(EXTENSION_CATEGORIES),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]])).max(12),
  widget: z.object({ size: z.enum(["sm", "md", "lg"]) }),
  homepage: z.string().url().optional(),
  /** For third-party extensions: the sandboxed entry URL loaded in an iframe. */
  entry: z.string().url().optional(),
  settings: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["text", "number", "boolean", "address"]),
        default: z.union([z.string(), z.number(), z.boolean()]).optional(),
      }),
    )
    .optional(),
});

export type ExtensionManifest = z.infer<typeof manifestSchema> & {
  builtin?: boolean;
  verified?: boolean;
  /** Present when the extension needs a data provider that isn't configured yet. */
  requires?: string;
};

export interface HostNotification {
  title: string;
  body: string;
  href?: string;
  category: "wallet" | "price" | "security" | "extension" | "news" | "portfolio";
}

/** Capabilities exposed to extensions. All methods are async and serialisable. */
export interface ExtensionHost {
  readonly manifest: ExtensionManifest;
  search(query: string): Promise<unknown>;
  wallet: {
    connected(): Promise<string | null>;
    portfolio(address: string): Promise<unknown>;
    activity(address: string): Promise<unknown>;
  };
  tokens: {
    get(mintOrSymbol: string): Promise<unknown>;
    trending(): Promise<unknown>;
    movers(): Promise<unknown>;
  };
  portfolio: { mine(): Promise<unknown> };
  prefs: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
  notifications: { push(n: HostNotification): Promise<void> };
  ai: { ask(prompt: string): Promise<string> };
  programs: { account(address: string): Promise<unknown> };
  network: { status(): Promise<unknown> };
  news: { latest(): Promise<unknown> };
  markets: { list(): Promise<unknown> };
  defi: { overview(): Promise<unknown> };
}

export class PermissionError extends Error {
  constructor(ext: string, perm: Permission) {
    super(`Extension "${ext}" is not allowed to use "${perm}". Add it to the manifest's permissions.`);
    this.name = "PermissionError";
  }
}

export interface HostDeps {
  fetchJson: (path: string, init?: RequestInit) => Promise<unknown>;
  getConnectedWallet: () => string | null;
  getPref: (extId: string, key: string) => unknown;
  setPref: (extId: string, key: string, value: unknown) => void;
  notify: (extId: string, n: HostNotification) => void;
}

/** Build a permission-checked host for one extension. */
export function createHost(manifest: ExtensionManifest, deps: HostDeps): ExtensionHost {
  const granted = new Set(manifest.permissions);
  const need = (p: Permission) => {
    if (!granted.has(p)) throw new PermissionError(manifest.id, p);
  };
  const q = encodeURIComponent;
  return {
    manifest,
    async search(query) {
      need("search");
      return deps.fetchJson(`/api/search?q=${q(query)}`);
    },
    wallet: {
      async connected() {
        need("wallet:read");
        return deps.getConnectedWallet();
      },
      async portfolio(address) {
        need("wallet:read");
        return deps.fetchJson(`/api/wallets/${q(address)}`);
      },
      async activity(address) {
        need("wallet:read");
        return deps.fetchJson(`/api/wallets/${q(address)}/activity`);
      },
    },
    tokens: {
      async get(id) {
        need("tokens:read");
        return deps.fetchJson(`/api/tokens/${q(id)}`);
      },
      async trending() {
        need("tokens:read");
        return deps.fetchJson(`/api/tokens?list=trending`);
      },
      async movers() {
        need("tokens:read");
        return deps.fetchJson(`/api/tokens?list=movers`);
      },
    },
    portfolio: {
      async mine() {
        need("portfolio:read");
        const w = deps.getConnectedWallet();
        if (!w) return null;
        return deps.fetchJson(`/api/wallets/${q(w)}`);
      },
    },
    prefs: {
      async get<T>(key: string) {
        need("prefs:read");
        return deps.getPref(manifest.id, key) as T | undefined;
      },
      async set(key, value) {
        need("prefs:write");
        deps.setPref(manifest.id, key, value);
      },
    },
    notifications: {
      async push(n) {
        need("notifications");
        deps.notify(manifest.id, n);
      },
    },
    ai: {
      async ask(prompt) {
        need("ai");
        const r = (await deps.fetchJson(`/api/ai/ask`, { method: "POST", body: JSON.stringify({ prompt }) })) as { text: string };
        return r.text;
      },
    },
    programs: {
      async account(address) {
        need("programs:read");
        return deps.fetchJson(`/api/security?q=${q(address)}`);
      },
    },
    network: {
      async status() {
        need("network:read");
        return deps.fetchJson(`/api/network`);
      },
    },
    news: {
      async latest() {
        need("news:read");
        return deps.fetchJson(`/api/news`);
      },
    },
    markets: {
      async list() {
        need("markets:read");
        return deps.fetchJson(`/api/markets`);
      },
    },
    defi: {
      async overview() {
        need("defi:read");
        return deps.fetchJson(`/api/defi`);
      },
    },
  };
}
