"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Loader2, LogOut, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { useSession } from "@/lib/client/session";
import { Modal, cn } from "../ui";
import { isAddress } from "@/lib/solana/address";
import { useIsDesktop } from "@/lib/client/desktop";
import { shortAddr } from "@/lib/format";

const SUGGESTED = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
];

export function WalletModal() {
  const s = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [watch, setWatch] = useState("");
  const desktop = useIsDesktop();

  const connect = async (name: string) => {
    setErr(null);
    setBusy(name);
    try {
      await s.connect(name);
      s.setWalletModal(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(null);
    }
  };

  const signIn = async () => {
    setErr(null);
    setBusy("signin");
    try {
      await s.signInWithWallet();
      s.setWalletModal(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={s.walletModal} onClose={() => s.setWalletModal(false)} title={s.wallet ? "Your wallet" : "Connect a wallet"}>
      {s.wallet ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            {s.wallet.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.wallet.icon} alt="" className="h-9 w-9 rounded-xl" />
            ) : (
              <WalletIcon size={20} />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{s.wallet.name}</div>
              <div className="font-mono text-[12px] text-muted">{shortAddr(s.wallet.address, 6)}</div>
            </div>
          </div>
          {!s.user?.wallet && (
            <button onClick={signIn} className="btn btn-primary w-full" disabled={busy === "signin"}>
              {busy === "signin" ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Sign in with this wallet
            </button>
          )}
          <p className="text-[12px] leading-relaxed text-muted">Signing in proves you own this address with a free message signature. It never moves funds.</p>
          <div className="flex gap-2">
            <Link href="/portfolio" onClick={() => s.setWalletModal(false)} className="btn btn-soft flex-1">
              Portfolio
            </Link>
            <button onClick={() => s.disconnect().then(() => s.setWalletModal(false))} className="btn btn-ghost flex-1">
              <LogOut size={14} /> Disconnect
            </button>
          </div>
          {err && <p className="text-[12px] text-down">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {s.wallets.length ? (
            <div className="space-y-2">
              {s.wallets.map((w) => (
                <button key={w.name} onClick={() => connect(w.name)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left transition-colors hover:bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.icon} alt="" className="h-9 w-9 rounded-xl" />
                  <span className="flex-1 text-[14px] font-medium">{w.name}</span>
                  {busy === w.name ? <Loader2 size={15} className="animate-spin text-muted" /> : <span className="text-[12px] text-muted">Detected</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-line p-4">
              <div className="text-[14px] font-medium">No Solana wallet detected</div>
              <p className="mt-1 text-[13px] text-muted">
                {desktop
                  ? "Click “Wallets” in the toolbar above to install Phantom, Solflare or Backpack, then open this again."
                  : "Install a wallet extension, or open Solana OS inside your wallet app’s browser on mobile."}
              </p>
              <div className={desktop ? "hidden" : "mt-3 flex flex-wrap gap-2"}>
                {SUGGESTED.map((w) => (
                  <a key={w.name} href={w.url} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                    Get {w.name}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium">
              <Eye size={14} /> Or watch any address
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isAddress(watch)) return setErr("That isn't a valid Solana address");
                s.watch(watch.trim());
                setWatch("");
                s.setWalletModal(false);
              }}
            >
              <input className="input" value={watch} onChange={(e) => setWatch(e.target.value)} placeholder="Paste a public address (read-only)" />
              <button className="btn btn-soft">Watch</button>
            </form>
            <p className="mt-2 text-[12px] text-muted">
              Or try the <button className="underline decoration-dotted underline-offset-2 hover:text-fg" onClick={() => { s.watch("demo"); s.setWalletModal(false); }}>demo wallet</button> (clearly labelled demo data).
            </p>
          </div>
          {err && <p className={cn("text-[12px] text-down")}>{err}</p>}
          <p className="text-[11.5px] leading-relaxed text-faint">Solana OS never asks for your seed phrase and never holds your keys. You can browse everything without connecting.</p>
        </div>
      )}
    </Modal>
  );
}
