"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Send } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { DevGate, KIND_LABEL, STATUS_LABEL, useDeveloper } from "@/components/developer";
import { timeAgo } from "@/lib/format";

function Submissions() {
  const params = useSearchParams();
  const { data, error, call } = useDeveloper();
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [storeId, setStoreId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const p = params.get("project");
    if (p) setProjectId(p);
  }, [params]);
  useEffect(() => {
    if (!projectId && data?.projects[0]) setProjectId(data.projects[0].id);
  }, [data, projectId]);
  const project = data?.projects.find((p) => p.id === projectId);

  return (
    <DevGate error={error}>
      <h2 className="mb-1 text-[18px] font-semibold">Submit to the STRATA Store</h2>
      <p className="mb-5 text-[13.5px] text-muted">Submissions are reviewed for safety (permissions, wallet access, what the code does) before they&apos;re listed.</p>
      {data && data.projects.length === 0 ? (
        <Card className="p-5 text-[13.5px] text-muted">Create a project first, then submit it here.</Card>
      ) : (
        <Card className="mb-6 p-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await call("/api/developer/submissions", "POST", { projectId, notes, sourceUrl, storeId });
              setMsg(r.ok ? { ok: true, text: `${project?.name} was submitted. It's now in review.` } : { ok: false, text: r.error });
              if (r.ok) setNotes("");
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">Project</span>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {(data?.projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({KIND_LABEL[p.kind]} v{p.version})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">Source code link (optional)</span>
              <input className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://github.com/you/project" />
            </label>
            {(project?.kind === "extension" || project?.kind === "wallet-tool") && (
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-muted">Chrome Web Store ID (optional)</span>
                <input className="input font-mono" value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="32 letters a–p" />
              </label>
            )}
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12.5px] text-muted">Notes for reviewers</span>
              <textarea className="input h-auto py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What it does, why it needs each permission, test accounts…" maxLength={1000} />
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-primary">
                <Send size={14} /> Submit for review
              </button>
            </div>
            {msg && <p className={msg.ok ? "text-[13px] text-up sm:col-span-2" : "text-[13px] text-down sm:col-span-2"}>{msg.text}</p>}
          </form>
        </Card>
      )}

      <h3 className="mb-3 text-[15px] font-semibold">Your submissions</h3>
      {data && data.submissions.length === 0 ? (
        <Card>
          <EmptyState icon={<Send size={20} />} title="No submissions yet" />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {(data?.submissions ?? []).map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              {s.status === "published" ? <CheckCircle2 size={17} className="text-up" /> : <Clock size={17} className="text-warn" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {s.name} <span className="text-faint">v{s.version}</span>
                </div>
                <div className="text-[12px] text-faint">
                  {KIND_LABEL[s.kind]} · submitted {timeAgo(s.at)}
                  {s.sourceUrl ? " · source attached" : ""}
                </div>
              </div>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11.5px] text-muted">{STATUS_LABEL[s.status]}</span>
            </div>
          ))}
        </Card>
      )}
    </DevGate>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense>
      <Submissions />
    </Suspense>
  );
}
