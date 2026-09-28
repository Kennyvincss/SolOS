"use client";

import { useEffect, useRef } from "react";
import { useActions, useStore, type AlertKind } from "@/lib/client/store";
import type { ActivityItem, Sourced, Token } from "@/lib/types";
import { apiGet } from "@/lib/client/fetch";
import { fmtUsd } from "@/lib/format";

/**
 * Client-side alert engine. While STRATA is open it polls followed
 * wallets and price alerts and turns matches into notifications. For alerts
 * while the app is closed, connect a webhook provider (e.g. Helius webhooks)
 * on the server — the rule format is the same.
 */

const POLL_MS = 90_000;

function matches(kind: ActivityItem["kind"], wanted: AlertKind[]): boolean {
  if (kind === "swap") return wanted.includes("buy") || wanted.includes("sell");
  if (kind === "transfer_in") return wanted.includes("large_transfer") || wanted.includes("new_token");
  if (kind === "transfer_out") return wanted.includes("large_transfer");
  if (kind === "program" || kind === "stake") return wanted.includes("protocol");
  return false;
}

export function Watchers() {
  const followed = useStore((s) => s.followed);
  const alerts = useStore((s) => s.walletAlerts);
  const priceAlerts = useStore((s) => s.priceAlerts);
  const { notify, setLastSeen, set } = useActions();
  const state = useRef({ followed, alerts, priceAlerts });
  state.current = { followed, alerts, priceAlerts };

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const { followed, alerts, priceAlerts } = state.current;
      for (const w of followed.slice(0, 10)) {
        if (w.address === "demo") continue;
        try {
          const r = await apiGet<Sourced<ActivityItem[]>>(`/api/wallets/${w.address}/activity?limit=5`);
          const items = r.data;
          if (!items.length || stopped) continue;
          const newest = items[0].signature;
          if (w.lastSeenSig && w.lastSeenSig !== newest) {
            const rule = alerts.find((a) => a.address === w.address);
            const fresh = items.slice(0, Math.max(0, items.findIndex((i) => i.signature === w.lastSeenSig))).filter((i) => i.status === "success");
            for (const it of fresh) {
              if (rule && !matches(it.kind, rule.kinds)) continue;
              notify({ category: "wallet", title: w.label, body: it.summary, href: `/tx/${it.signature}`, source: "Followed wallet" });
            }
          }
          setLastSeen(w.address, newest);
        } catch {
          /* try again next tick */
        }
      }
      for (const a of priceAlerts.filter((p) => !p.triggered)) {
        try {
          const r = await apiGet<Sourced<Token>>(`/api/tokens/${a.mint}`);
          const p = r.data.priceUsd;
          if (p === undefined || r.meta.mode === "demo") continue;
          if ((a.direction === "above" && p >= a.price) || (a.direction === "below" && p <= a.price)) {
            notify({ category: "price", title: `${a.symbol} is ${a.direction} ${fmtUsd(a.price)}`, body: `Now ${fmtUsd(p)} (Jupiter price).`, href: `/tokens/${a.mint}`, source: "Price alert" });
            set((s) => ({ ...s, priceAlerts: s.priceAlerts.map((x) => (x.id === a.id ? { ...x, triggered: true } : x)) }));
          }
        } catch {
          /* ignore */
        }
      }
    };
    const first = setTimeout(tick, 4000);
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [notify, setLastSeen, set]);

  return null;
}

export function ThemeSync() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      const t = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = t;
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}
