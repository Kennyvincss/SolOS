"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, KeyRound, Plus, Puzzle } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { DevGate, KIND_LABEL, STATUS_LABEL, desktopDev, useDeveloper } from "@/components/developer";
import { timeAgo } from "@/lib/format";

export default function DeveloperOverview() {
  const { data, error } = useDeveloper();
  const [requests, setRequests] = useState<number | null>(null);
  const [devMode, setDevMode] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/developer/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((a: { keys: { total: number }[] } | null) => setRequests(a ? a.keys.reduce((n, k) => n + k.total, 0) : null))
      .catch(() => setRequests(null));
    const d = desktopDev();
    if (d) d.dev("status").then((s) => setDevMode(Boolean((s as { developerMode?: boolean })?.developerMode)));
  }, []);
  return (
    <DevGate error={error}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <Stat label="Projects" value={data?.projects.length ?? "…"} />
        </Card>
        <Card className="p-4">
          <Stat label="API keys" value={data?.keys.length ?? "…"} />
        </Card>
        <Card className="p-4">
          <Stat label="API requests (30 days)" value={requests ?? "—"} />
        </Card>
        <Card className="p-4">
          <Stat label="Submissions" value={data?.submissions.length ?? "…"} />
        </Card>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {[
          { href: "/developers/new", icon: Plus, title: "Create a project", body: "Extension, mini app, AI agent, wallet tool or data widget — with a starter you can run right away." },
          { href: "/developers/keys", icon: KeyRound, title: "Get an API key", body: "Call the STRATA API (tokens, wallets, transactions, security, AI) and see your usage." },
          { href: "/developers/docs", icon: BookOpen, title: "Read the docs", body: "API reference, extension guide, wallet access, AI agents and widgets." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="card card-hover block p-5">
            <c.icon size={18} className="text-sol-green" />
            <div className="mt-3 text-[15px] font-semibold">{c.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{c.body}</p>
          </Link>
        ))}
      </div>

      <Card className="mt-6 flex flex-wrap items-center gap-3 p-5">
        <Puzzle size={20} className="text-sol-green" />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold">Test in the STRATA browser</div>
          <p className="text-[13px] text-muted">
            {devMode === null
              ? "Open this page in the STRATA desktop app to load your extension straight from a folder."
              : devMode
                ? "Developer mode is on. Load your unpacked extension from My projects."
                : "Turn on Developer mode to load unpacked extensions."}
          </p>
        </div>
        {devMode === false && (
          <button onClick={async () => (await desktopDev()?.dev("setMode", true), setDevMode(true))} className="btn btn-primary btn-sm">
            Turn on developer mode
          </button>
        )}
      </Card>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Recent projects</h2>
          <Link href="/developers/extensions" className="flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            All projects <ArrowRight size={13} />
          </Link>
        </div>
        {data && data.projects.length === 0 ? (
          <Card className="p-6 text-center text-[13.5px] text-muted">
            No projects yet.{" "}
            <Link href="/developers/new" className="text-fg underline">
              Create your first one
            </Link>
            .
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {(data?.projects ?? []).slice(0, 5).map((p) => (
              <Link key={p.id} href="/developers/extensions" className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{p.name}</div>
                  <div className="text-[12px] text-faint">
                    {KIND_LABEL[p.kind]} · v{p.version} · updated {timeAgo(p.updatedAt)}
                  </div>
                </div>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted">{STATUS_LABEL[p.status]}</span>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </DevGate>
  );
}
