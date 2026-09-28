"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Check, UserPlus } from "lucide-react";
import { useActions, useStore, type AlertKind } from "@/lib/client/store";
import { useFollowingFeed } from "@/lib/client/following";
import { Modal, cn, SkeletonRows, EmptyState } from "./ui";
import { ActivityList } from "./domain";
import { timeAgo } from "@/lib/format";

const KINDS: { value: AlertKind; label: string; hint: string }[] = [
  { value: "buy", label: "Buy", hint: "Swaps into a token" },
  { value: "sell", label: "Sell", hint: "Swaps out of a token" },
  { value: "large_transfer", label: "Large transfer", hint: "Transfers in or out" },
  { value: "new_token", label: "New token", hint: "Receives a token" },
  { value: "protocol", label: "Protocol interaction", hint: "Staking, lending, other programs" },
];

export function FollowButton({ address, label }: { address: string; label?: string }) {
  const following = useStore((s) => s.followed.some((f) => f.address === address));
  const { follow, unfollow } = useActions();
  return (
    <button onClick={() => (following ? unfollow(address) : follow(address, label))} className={cn("btn btn-sm", following ? "btn-soft" : "btn-primary")}>
      {following ? <Check size={14} /> : <UserPlus size={14} />} {following ? "Following" : "Follow wallet"}
    </button>
  );
}

export function AlertModal({ address, open, onClose }: { address: string; open: boolean; onClose: () => void }) {
  const existing = useStore((s) => s.walletAlerts.find((a) => a.address === address));
  const following = useStore((s) => s.followed.some((f) => f.address === address));
  const { upsertWalletAlert, follow } = useActions();
  const [kinds, setKinds] = useState<AlertKind[]>(existing?.kinds ?? ["buy", "sell", "large_transfer"]);
  return (
    <Modal open={open} onClose={onClose} title="Wallet alerts">
      <div className="space-y-2">
        {KINDS.map((k) => {
          const on = kinds.includes(k.value);
          return (
            <button key={k.value} onClick={() => setKinds((cur) => (on ? cur.filter((x) => x !== k.value) : [...cur, k.value]))} className={cn("flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left", on ? "border-sol-green/40 bg-sol-green/5" : "border-line")}>
              <span>
                <span className="block text-[14px]">{k.label}</span>
                <span className="block text-[12px] text-muted">{k.hint}</span>
              </span>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full border", on ? "border-sol-green bg-sol-green text-black" : "border-line-strong")}>{on && <Check size={12} />}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted">Alerts are checked while STRATA is open. Setting an alert also follows the wallet.</p>
      <button
        className="btn btn-primary mt-4 w-full"
        onClick={() => {
          if (!following) follow(address);
          upsertWalletAlert({ address, kinds });
          onClose();
        }}
      >
        <BellRing size={15} /> Save alerts
      </button>
    </Modal>
  );
}

export function FollowingFeed({ limit = 30 }: { limit?: number }) {
  const followed = useStore((s) => s.followed);
  const { items, loading, errors } = useFollowingFeed(followed);
  if (!followed.length)
    return <EmptyState title="You're not following any wallets" body="Open any wallet and tap Follow to see its buys, sells and transfers here." action={<Link href="/wallets" className="btn btn-soft btn-sm">Explore wallets</Link>} />;
  return (
    <div>
      {loading && !items.length && <SkeletonRows rows={5} />}
      {items.length > 0 && (
        <div className="divide-y divide-line">
          {items.slice(0, limit).map((it) => (
            <div key={`${it.wallet.address}:${it.signature}`} className="py-1">
              <div className="flex items-center gap-2 pt-2 text-[12px] text-faint">
                <Link href={`/wallets/${it.wallet.address}`} className="font-medium text-muted hover:text-fg">
                  {it.wallet.label}
                </Link>
                <span>· {timeAgo(it.blockTime)}</span>
              </div>
              <ActivityList items={[{ ...it, blockTime: undefined }]} />
            </div>
          ))}
        </div>
      )}
      {!loading && !items.length && <EmptyState title="No recent activity from wallets you follow" />}
      {errors.length > 0 && <p className="mt-2 text-[12px] text-faint">Some wallets could not be loaded: {errors.join("; ")}</p>}
    </div>
  );
}
