"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Trash2 } from "lucide-react";
import { Card, CopyButton, EmptyState, InfoNote } from "@/components/ui";
import { DevGate, useDeveloper } from "@/components/developer";
import { timeAgo } from "@/lib/format";

export default function ApiKeys() {
  const { data, error, call } = useDeveloper();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <DevGate error={error}>
      <h2 className="mb-1 text-[18px] font-semibold">API keys</h2>
      <p className="mb-5 text-[13.5px] text-muted">
        Send your key as <code className="rounded bg-surface-2 px-1">x-strata-key</code> (or <code className="rounded bg-surface-2 px-1">Authorization: Bearer …</code>) to see your usage in Analytics. See the{" "}
        <Link href="/developers/docs" className="underline">
          docs
        </Link>
        .
      </p>

      {secret && (
        <Card className="mb-4 border-[color-mix(in_srgb,var(--green)_40%,transparent)] p-4">
          <div className="text-[13.5px] font-semibold">Your new key</div>
          <p className="text-[12.5px] text-muted">Copy it now. For your security it won&apos;t be shown again.</p>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 font-mono text-[12.5px]">
            <span className="min-w-0 flex-1 break-all">{secret}</span>
            <CopyButton text={secret} />
          </div>
        </Card>
      )}

      <Card className="mb-5 p-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            const r = await call<{ secret: string }>("/api/developer/keys", "POST", { name: name.trim() || "API key" });
            if (!r.ok) return setErr(r.error);
            setSecret(r.data.secret);
            setName("");
          }}
          className="flex gap-2"
        >
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. Whale Watcher production)" maxLength={40} />
          <button className="btn btn-primary">Create key</button>
        </form>
        {err && <p className="mt-2 text-[13px] text-down">{err}</p>}
      </Card>

      {data && data.keys.length === 0 ? (
        <Card>
          <EmptyState icon={<KeyRound size={20} />} title="No API keys yet" body="The public API works without a key; a key lets you track usage per project." />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {(data?.keys ?? []).map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRound size={16} className="text-faint" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{k.name}</div>
                <div className="font-mono text-[12px] text-faint">
                  {k.prefix}… · created {timeAgo(k.createdAt)}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (confirm(`Revoke “${k.name}”? Apps using it will get 401 errors.`)) await call(`/api/developer/keys?id=${k.id}`, "DELETE");
                }}
                className="btn btn-ghost btn-sm text-down"
              >
                <Trash2 size={13} /> Revoke
              </button>
            </div>
          ))}
        </Card>
      )}
      <InfoNote className="mt-4">Keys are stored hashed. Anyone with a key can make requests counted against your account, so keep keys out of public code (use them from your server or extension background).</InfoNote>
    </DevGate>
  );
}
