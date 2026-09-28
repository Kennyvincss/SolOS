"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MonitorSmartphone, X } from "lucide-react";
import { useSession } from "@/lib/client/session";
import { registerThisDevice, takeInbox, thisDevice } from "@/lib/client/devices";

type Received = { id: string; url: string; title: string; fromName: string };

/** Registers this browser/phone with the account and shows tabs sent from your other devices. */
export function DeviceSync() {
  const session = useSession();
  const signedIn = Boolean(session.user);
  const [items, setItems] = useState<Received[]>([]);

  useEffect(() => {
    if (!signedIn || !thisDevice()) return;
    let registered = false;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (!registered) registered = await registerThisDevice();
      if (!registered) return;
      const got = await takeInbox();
      if (!stopped && got.length) setItems((cur) => [...cur, ...got].slice(-5));
    };
    tick();
    const t = setInterval(tick, 60_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [signedIn]);

  if (!items.length) return null;
  return (
    <div className="fixed bottom-20 right-4 z-[60] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4">
      {items.map((it) => (
        <div key={it.id} className="card flex items-start gap-3 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
          <MonitorSmartphone size={18} className="mt-0.5 shrink-0 text-sol-green" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-faint">Tab from {it.fromName}</div>
            <div className="truncate text-[13.5px] font-medium">{it.title || it.url}</div>
            <a href={it.url} target="_blank" rel="noopener noreferrer" onClick={() => setItems((c) => c.filter((x) => x.id !== it.id))} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-sol-green hover:underline">
              Open <ExternalLink size={11} />
            </a>
          </div>
          <button onClick={() => setItems((c) => c.filter((x) => x.id !== it.id))} className="text-faint hover:text-fg" aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
