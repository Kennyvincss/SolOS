"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { DevGate, useDeveloper, type DevRecord } from "@/components/developer";

export default function DeveloperProfile() {
  const { data, error, call } = useDeveloper();
  const [f, setF] = useState<DevRecord["profile"] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (data && !f) setF(data.profile);
  }, [data, f]);
  const field = (k: keyof DevRecord["profile"], label: string, placeholder = "") => (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-muted">{label}</span>
      <input className="input" value={f?.[k] ?? ""} placeholder={placeholder} onChange={(e) => setF({ ...(f as DevRecord["profile"]), [k]: e.target.value })} />
    </label>
  );
  return (
    <DevGate error={error}>
      <h2 className="mb-1 text-[18px] font-semibold">Developer profile</h2>
      <p className="mb-5 text-[13.5px] text-muted">Shown on your listings in the STRATA Store.</p>
      <Card className="p-5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!f) return;
            const r = await call("/api/developer", "PUT", f);
            setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {field("name", "Name or company", "Acme Labs")}
          {field("handle", "Handle", "acme")}
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12.5px] text-muted">About</span>
            <textarea className="input h-auto py-2" rows={3} maxLength={280} value={f?.bio ?? ""} onChange={(e) => setF({ ...(f as DevRecord["profile"]), bio: e.target.value })} />
          </label>
          {field("website", "Website", "https://")}
          {field("github", "GitHub", "https://github.com/…")}
          {field("x", "X handle", "acme")}
          <div className="flex items-end">
            <button className="btn btn-primary w-full">Save profile</button>
          </div>
          {msg && <p className={msg.ok ? "text-[13px] text-up" : "text-[13px] text-down"}>{msg.text}</p>}
        </form>
      </Card>
    </DevGate>
  );
}
