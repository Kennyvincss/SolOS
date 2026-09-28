"use client";

import { useEffect, useState } from "react";
import { Card, Stat } from "@/components/ui";
import { DevGate, KIND_LABEL, STATUS_LABEL } from "@/components/developer";

interface Analytics {
  days: string[];
  keys: { id: string; name: string; prefix: string; daily: number[]; total: number }[];
  projects: { total: number; byStatus: Record<string, number>; byKind: Record<string, number> };
  submissions: number;
}

export default function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  useEffect(() => {
    fetch("/api/developer/analytics")
      .then(async (r) => (r.ok ? setA(await r.json()) : setError({ status: r.status, message: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't load analytics." })))
      .catch(() => setError({ status: 0, message: "Couldn't load analytics." }));
  }, []);
  const totals = a ? a.days.map((_, i) => a.keys.reduce((n, k) => n + (k.daily[i] ?? 0), 0)) : [];
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((x, y) => x + y, 0);
  return (
    <DevGate error={error}>
      <h2 className="mb-5 text-[18px] font-semibold">Analytics</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <Stat label="API requests, 30 days" value={a ? sum.toLocaleString() : "…"} />
        </Card>
        <Card className="p-4">
          <Stat label="Today" value={a ? (totals.at(-1) ?? 0).toLocaleString() : "…"} />
        </Card>
        <Card className="p-4">
          <Stat label="Projects / submissions" value={a ? `${a.projects.total} / ${a.submissions}` : "…"} />
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <div className="mb-4 text-[14px] font-semibold">Requests per day</div>
        {a && sum === 0 ? (
          <p className="text-[13px] text-muted">No keyed requests yet. Send your API key with requests to see them here.</p>
        ) : (
          <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Requests per day, last 30 days">
            {totals.map((n, i) => (
              <div key={i} className="group relative flex-1">
                <div className="rounded-t-[3px] bg-[var(--green)] opacity-80 transition-opacity group-hover:opacity-100" style={{ height: `${Math.max(2, (n / max) * 150)}px` }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] opacity-0 group-hover:opacity-100">
                  {a?.days[i].slice(4, 6)}/{a?.days[i].slice(6)} · {n}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold">By API key</div>
          {a?.keys.length ? (
            <div className="divide-y divide-line">
              {a.keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between py-2 text-[13.5px]">
                  <span>
                    {k.name} <span className="font-mono text-[11.5px] text-faint">{k.prefix}…</span>
                  </span>
                  <span className="tabular-nums">{k.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">No keys yet.</p>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3 text-[14px] font-semibold">Projects</div>
          {a && a.projects.total ? (
            <div className="space-y-1.5 text-[13.5px]">
              {Object.entries(a.projects.byKind).map(([k, n]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted">{KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k}</span>
                  <span>{n}</span>
                </div>
              ))}
              <div className="my-2 border-t border-line" />
              {Object.entries(a.projects.byStatus).map(([k, n]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted">{STATUS_LABEL[k] ?? k}</span>
                  <span>{n}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">No projects yet.</p>
          )}
        </Card>
      </div>
    </DevGate>
  );
}
