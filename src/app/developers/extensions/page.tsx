"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, FolderOpen, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { DevGate, KIND_LABEL, STATUS_LABEL, desktopDev, useDeveloper } from "@/components/developer";
import { downloadStarter } from "@/lib/developer/download";
import { timeAgo } from "@/lib/format";

type Unpacked = { id: string; name: string; version: string; unpacked?: boolean };

export default function MyProjects() {
  const { data, error, call } = useDeveloper();
  const dev = typeof window === "undefined" ? null : desktopDev();
  const [loaded, setLoaded] = useState<Unpacked[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshLoaded = useCallback(async () => {
    const b = (window as unknown as { solanaOSDesktop?: { extensions?: () => Promise<Unpacked[] | null> } }).solanaOSDesktop;
    const list = (await b?.extensions?.()) ?? [];
    setLoaded(list.filter((x) => x.unpacked));
  }, []);
  useEffect(() => {
    refreshLoaded();
  }, [refreshLoaded]);

  return (
    <DevGate error={error}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold">My projects</h2>
        <Link href="/developers/new" className="btn btn-primary btn-sm">
          <Plus size={14} /> New project
        </Link>
      </div>
      {msg && (
        <p className="mb-3 flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[13px] text-muted">
          {msg}
          <button onClick={() => setMsg(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </p>
      )}

      {dev && (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FolderOpen size={18} className="text-sol-green" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">Test in this browser</div>
              <div className="text-[12.5px] text-muted">Unzip a starter (or your own extension) and load the folder. It stays loaded in this profile until you remove it.</div>
            </div>
            <button
              onClick={async () => {
                const r = (await dev.dev("loadUnpacked")) as Unpacked | null;
                if (r) setMsg(`Loaded ${r.name} ${r.version}. Find it under the puzzle-piece button.`);
                refreshLoaded();
              }}
              className="btn btn-primary btn-sm"
            >
              Load unpacked…
            </button>
          </div>
          {loaded.length > 0 && (
            <div className="mt-3 divide-y divide-line rounded-xl border border-line">
              {loaded.map((x) => (
                <div key={x.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate">
                    {x.name} <span className="text-faint">v{x.version}</span>
                  </span>
                  <button onClick={async () => (await dev.dev("reload", x.id), setMsg(`Reloaded ${x.name}.`), refreshLoaded())} className="btn btn-ghost btn-sm">
                    <RefreshCw size={13} /> Reload
                  </button>
                  <button onClick={async () => (await dev.dev("unload", x.id), refreshLoaded())} className="btn btn-ghost btn-sm text-down">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {data && data.projects.length === 0 ? (
        <Card>
          <EmptyState title="No projects yet" body="Create an extension, mini app, AI agent, wallet tool or data widget." action={<Link href="/developers/new" className="btn btn-primary btn-sm">Create a project</Link>} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(data?.projects ?? []).map((p) => (
            <Card key={p.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    <Badge>{KIND_LABEL[p.kind]}</Badge>
                  </div>
                  <div className="mt-0.5 text-[12px] text-faint">
                    v{p.version} · {p.category} · updated {timeAgo(p.updatedAt)}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted">{STATUS_LABEL[p.status]}</span>
              </div>
              <p className="mt-2 line-clamp-2 flex-1 text-[13px] text-muted">{p.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => downloadStarter(p)} className="btn btn-soft btn-sm">
                  <Download size={13} /> Starter
                </button>
                <Link href={`/developers/submissions?project=${p.id}`} className="btn btn-ghost btn-sm">
                  <Send size={13} /> Submit
                </Link>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${p.name}? Submissions keep their history.`)) return;
                    const r = await call(`/api/developer/projects?id=${p.id}`, "DELETE");
                    if (!r.ok) setMsg(r.error);
                  }}
                  className="btn btn-ghost btn-sm ml-auto text-faint hover:text-down"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DevGate>
  );
}
