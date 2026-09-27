"use client";

import { useEffect, useState } from "react";
import type { ActivityItem, Sourced } from "@/lib/types";
import type { FollowedWallet } from "./store";
import { apiGet } from "./fetch";

export interface FeedItem extends ActivityItem {
  wallet: FollowedWallet;
}

/** Merge recent activity of all followed wallets into one feed, newest first. */
export function useFollowingFeed(followed: FollowedWallet[], perWallet = 6) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const key = followed.map((f) => f.address).join(",");
  useEffect(() => {
    if (!followed.length) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(followed.slice(0, 20).map((w) => apiGet<Sourced<ActivityItem[]>>(`/api/wallets/${w.address}/activity?limit=${perWallet}`).then((r) => r.data.map((a) => ({ ...a, wallet: w })))))
      .then((res) => {
        if (cancelled) return;
        const ok = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
        setErrors(res.flatMap((r, i) => (r.status === "rejected" ? [`${followed[i].label}: ${(r.reason as Error).message}`] : [])));
        setItems(ok.sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0)));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, perWallet]);
  return { items, loading, errors };
}
