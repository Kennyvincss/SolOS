"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Settings, Trash2 } from "lucide-react";
import { Card, EmptyState, Page, PageHeader, Tabs, cn } from "@/components/ui";
import { useActions, useStore, type NotificationCategory } from "@/lib/client/store";
import { timeAgo } from "@/lib/format";

const CATS: { value: NotificationCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "wallet", label: "Wallets" },
  { value: "price", label: "Prices" },
  { value: "security", label: "Security" },
  { value: "portfolio", label: "Portfolio" },
  { value: "app", label: "Apps" },
  { value: "news", label: "News" },
  { value: "extension", label: "Extensions" },
];

export default function NotificationsPage() {
  const [cat, setCat] = useState<NotificationCategory | "all">("all");
  const items = useStore((s) => s.notifications);
  const { markRead, clearNotifications } = useActions();
  const list = items.filter((n) => cat === "all" || n.category === cat);
  return (
    <Page>
      <PageHeader
        title="Notifications"
        subtitle="Alerts from followed wallets, price alerts, extensions and security warnings."
        actions={
          <>
            <button onClick={() => markRead()} className="btn btn-ghost btn-sm" disabled={!items.some((n) => !n.read)}>
              <CheckCheck size={14} /> Mark all read
            </button>
            <button onClick={clearNotifications} className="btn btn-ghost btn-sm" disabled={!items.length} aria-label="Clear all">
              <Trash2 size={14} />
            </button>
            <Link href="/settings#notifications" className="btn btn-ghost btn-sm" aria-label="Notification settings">
              <Settings size={14} />
            </Link>
          </>
        }
      />
      <Tabs value={cat} onChange={setCat} options={CATS} className="mb-4" />
      <Card className="p-2">
        {!list.length ? (
          <EmptyState icon={<Bell size={20} />} title="You're all caught up" body="Follow wallets, set price alerts or install extensions like Whale Alerts to get notified here." action={<Link href="/wallets" className="btn btn-soft btn-sm">Follow a wallet</Link>} />
        ) : (
          list.map((n) => {
            const inner = (
              <>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-sol-green")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14px] font-medium">{n.title}</span>
                    <span className="shrink-0 text-[11.5px] text-faint">{timeAgo(n.at)}</span>
                  </div>
                  <p className="line-clamp-2 text-[13px] text-muted">{n.body}</p>
                  {n.source && <p className="mt-0.5 text-[11.5px] text-faint">{n.source}</p>}
                </div>
              </>
            );
            return n.href ? (
              <Link key={n.id} href={n.href} onClick={() => markRead(n.id)} className="flex gap-3 rounded-xl px-3 py-3 hover:bg-surface-2">
                {inner}
              </Link>
            ) : (
              <button key={n.id} onClick={() => markRead(n.id)} className="flex w-full gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2">
                {inner}
              </button>
            );
          })
        )}
      </Card>
    </Page>
  );
}
