"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Laptop, Monitor, Send, Smartphone, Trash2 } from "lucide-react";
import { Badge, Card } from "./ui";
import { listDevices, removeDevice, sendTab, type DeviceInfo } from "@/lib/client/devices";
import { timeAgo } from "@/lib/format";

const ICON = { desktop: Monitor, laptop: Laptop, mobile: Smartphone, browser: Globe };

/** Your STRATA devices: see them, remove old ones, send a link to one. */
export function DevicesSection() {
  const [state, setState] = useState<{ devices: DeviceInfo[] } | { error: "signed-out" | "unavailable" } | null>(null);
  const [url, setUrl] = useState("");
  const [to, setTo] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const load = useCallback(() => listDevices().then(setState), []);
  useEffect(() => {
    load();
  }, [load]);

  if (!state) return <Card className="p-5 text-[13px] text-muted">Loading your devices…</Card>;
  if ("error" in state)
    return (
      <Card className="p-5 text-[13.5px] text-muted">
        {state.error === "signed-out" ? (
          <>
            <Link href="/login" className="text-fg underline">
              Sign in
            </Link>{" "}
            on each device to send tabs between your desktop, laptop and phone.
          </>
        ) : (
          "Sending tabs between devices isn't available right now."
        )}
      </Card>
    );
  const others = state.devices.filter((d) => !d.current);
  return (
    <Card className="divide-y divide-line px-5">
      {state.devices.length === 0 && <p className="py-4 text-[13.5px] text-muted">No devices yet. Open STRATA on your computer or phone while signed in.</p>}
      {state.devices.map((d) => {
        const I = ICON[d.type] ?? Globe;
        return (
          <div key={d.id} className="flex items-center gap-3 py-3.5">
            <I size={18} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px]">
                <span className="truncate">{d.name}</span>
                {d.current && <Badge tone="green">This device</Badge>}
              </div>
              <div className="text-[12.5px] text-muted">
                {d.app === "desktop" ? "STRATA desktop" : d.app === "mobile" ? "STRATA phone app" : "Web"} · active {timeAgo(d.lastSeen)}
              </div>
            </div>
            {!d.current && (
              <button onClick={async () => (await removeDevice(d.id), load())} className="btn btn-ghost btn-sm" aria-label={`Remove ${d.name}`}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
      {others.length > 0 && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const target = to || others[0].id;
            const u = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
            const ok = await sendTab(target, u, u);
            setSent(ok ? `Sent to ${others.find((d) => d.id === target)?.name}` : "Couldn't send. Try again.");
            if (ok) setUrl("");
          }}
          className="flex flex-wrap items-center gap-2 py-3.5"
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Send a link to a device" className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[13.5px] outline-none" />
          <select value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-xl border border-line bg-surface px-2 text-[13px] outline-none" aria-label="Device">
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!url.trim()} className="btn btn-primary btn-sm h-9 disabled:opacity-40">
            <Send size={14} /> Send
          </button>
          {sent && <span className="w-full text-[12.5px] text-muted">{sent}</span>}
        </form>
      )}
    </Card>
  );
}
