"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getWallets } from "@wallet-standard/app";
import bs58 from "bs58";
import { StoreProvider, useActions, useStore } from "./store";
import { apiGet, apiPost } from "./fetch";

/**
 * Session + wallet layer.
 *
 * Wallets are discovered through the Wallet Standard, so Phantom, Solflare,
 * Backpack and any other standard-compliant wallet appear automatically.
 * Browsing never requires a wallet; "watch mode" lets people load any public
 * address read-only.
 */

export interface User {
  uid: string;
  name: string;
  provider: "wallet" | "google" | "email";
  email?: string;
  wallet?: string;
  avatar?: string;
}

export interface Capabilities {
  dataMode: string;
  ai: "groq" | "offline";
  auth: { wallet: boolean; google: boolean; email: boolean };
}

interface WalletInfo {
  name: string;
  icon: string;
}

interface ConnectedWallet {
  name: string;
  icon?: string;
  address: string;
  readOnly: boolean;
}

interface SessionValue {
  user: User | null;
  capabilities: Capabilities | null;
  ready: boolean;
  wallets: WalletInfo[];
  wallet: ConnectedWallet | null;
  /** The address the app should treat as "mine": connected wallet, else watch address, else signed-in wallet. */
  address: string | null;
  connect: (name: string) => Promise<void>;
  disconnect: () => Promise<void>;
  watch: (address: string | null) => void;
  signInWithWallet: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  walletModal: boolean;
  setWalletModal: (v: boolean) => void;
}

const Ctx = createContext<SessionValue | null>(null);

type StdWallet = ReturnType<ReturnType<typeof getWallets>["get"]>[number];
type Feature<T> = T | undefined;

function solanaWallets(): StdWallet[] {
  return getWallets()
    .get()
    .filter((w) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features);
}

function WalletLayer({ children, user, capabilities, ready, refresh }: { children: ReactNode; user: User | null; capabilities: Capabilities | null; ready: boolean; refresh: () => Promise<void> }) {
  const [wallets, setWallets] = useState<StdWallet[]>([]);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [walletModal, setWalletModal] = useState(false);
  const watchAddress = useStore((s) => s.watchAddress);
  const { set } = useActions();

  useEffect(() => {
    const api = getWallets();
    const update = () => setWallets(solanaWallets());
    update();
    const off1 = api.on("register", update);
    const off2 = api.on("unregister", update);
    return () => {
      off1();
      off2();
    };
  }, []);

  const find = useCallback((name: string) => solanaWallets().find((w) => w.name === name), []);

  const connect = useCallback(
    async (name: string, silent = false) => {
      const w = find(name);
      if (!w) throw new Error(`${name} is not installed`);
      const feature = w.features["standard:connect"] as Feature<{ connect: (i?: { silent?: boolean }) => Promise<{ accounts: readonly { address: string }[] }> }>;
      const res = await feature!.connect(silent ? { silent: true } : undefined);
      const account = res.accounts[0] ?? w.accounts[0];
      if (!account) throw new Error("No account was shared by the wallet");
      setWallet({ name: w.name, icon: w.icon, address: account.address, readOnly: false });
      try {
        localStorage.setItem("sos:lastWallet", w.name);
      } catch {}
    },
    [find],
  );

  // Silent reconnect to the last used wallet.
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem("sos:lastWallet");
    } catch {}
    if (last && !wallet && wallets.some((w) => w.name === last)) connect(last, true).catch(() => {});
  }, [wallets, wallet, connect]);

  // Follow account switches inside the wallet.
  useEffect(() => {
    if (!wallet || wallet.readOnly) return;
    const w = find(wallet.name);
    const events = w?.features["standard:events"] as Feature<{ on: (e: "change", cb: (p: { accounts?: readonly { address: string }[] }) => void) => () => void }>;
    return events?.on("change", ({ accounts }) => {
      if (accounts && accounts[0]) setWallet((cur) => (cur ? { ...cur, address: accounts[0].address } : cur));
      else if (accounts && !accounts.length) setWallet(null);
    });
  }, [wallet, find]);

  const disconnect = useCallback(async () => {
    if (wallet && !wallet.readOnly) {
      const w = find(wallet.name);
      const f = w?.features["standard:disconnect"] as Feature<{ disconnect: () => Promise<void> }>;
      await f?.disconnect().catch(() => {});
    }
    try {
      localStorage.removeItem("sos:lastWallet");
    } catch {}
    setWallet(null);
  }, [wallet, find]);

  const watch = useCallback((address: string | null) => set((s) => ({ ...s, watchAddress: address ?? undefined })), [set]);

  const signInWithWallet = useCallback(async () => {
    if (!wallet || wallet.readOnly) throw new Error("Connect a wallet first");
    const w = find(wallet.name);
    const f = w?.features["solana:signMessage"] as Feature<{ signMessage: (i: { account: unknown; message: Uint8Array }) => Promise<readonly { signature: Uint8Array }[]> }>;
    if (!f) throw new Error(`${wallet.name} does not support message signing`);
    const account = w!.accounts.find((a) => a.address === wallet.address) ?? w!.accounts[0];
    const { message } = await apiGet<{ message: string }>(`/api/auth/nonce?address=${wallet.address}`);
    const [out] = await f.signMessage({ account, message: new TextEncoder().encode(message) });
    await apiPost("/api/auth/wallet", { address: wallet.address, message, signature: bs58.encode(out.signature) });
    await refresh();
  }, [wallet, find, refresh]);

  const signOut = useCallback(async () => {
    await apiPost("/api/auth/logout", {});
    await refresh();
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      capabilities,
      ready,
      wallets: wallets.map((w) => ({ name: w.name, icon: w.icon })),
      wallet,
      address: wallet?.address ?? watchAddress ?? user?.wallet ?? null,
      connect: (n) => connect(n),
      disconnect,
      watch,
      signInWithWallet,
      signOut,
      refresh,
      walletModal,
      setWalletModal,
    }),
    [user, capabilities, ready, wallets, wallet, watchAddress, connect, disconnect, watch, signInWithWallet, signOut, refresh, walletModal],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [capabilities, setCaps] = useState<Capabilities | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await apiGet<{ user: User | null; capabilities: Capabilities }>("/api/auth/session");
      setUser(r.user);
      setCaps(r.capabilities);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return (
    <StoreProvider uid={user?.uid ?? null}>
      <WalletLayer user={user} capabilities={capabilities} ready={ready} refresh={refresh}>
        {children}
      </WalletLayer>
    </StoreProvider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
