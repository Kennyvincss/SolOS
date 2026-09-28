"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, LayoutGrid, Puzzle, Wallet, Gauge } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { DevGate, useDeveloper, type DevProject } from "@/components/developer";
import { EXTENSION_PERMISSIONS, KINDS, type Kind } from "@/lib/developer/templates";
import { downloadStarter } from "@/lib/developer/download";

const ICON: Record<Kind, typeof Puzzle> = { extension: Puzzle, "wallet-tool": Wallet, "mini-app": LayoutGrid, agent: Bot, widget: Gauge };
const CATEGORIES = ["Trading", "Wallets", "DeFi", "Security", "Research", "NFTs", "Markets", "Portfolio", "News", "AI", "Developer tools"];

export default function CreateProject() {
  const { error, call } = useDeveloper();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("extension");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Trading");
  const [version, setVersion] = useState("1.0.0");
  const [permissions, setPermissions] = useState<string[]>(["storage"]);
  const [matches, setMatches] = useState("https://jup.ag/*");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isExt = kind === "extension" || kind === "wallet-tool";

  return (
    <DevGate error={error}>
      <h2 className="mb-1 text-[18px] font-semibold">Create a project</h2>
      <p className="mb-5 text-[13.5px] text-muted">Pick what you're building. You'll get a starter project that runs in STRATA right away.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KINDS.map((k) => {
          const I = ICON[k.id];
          return (
            <button key={k.id} onClick={() => setKind(k.id)} className={cn("card relative p-4 text-left transition-colors", kind === k.id ? "border-[color-mix(in_srgb,var(--green)_60%,transparent)] bg-[color-mix(in_srgb,var(--green)_6%,transparent)]" : "hover:border-line-strong")}>
              {kind === k.id && <Check size={15} className="absolute right-3 top-3 text-sol-green" />}
              <I size={18} className="text-sol-green" />
              <div className="mt-2 text-[14.5px] font-semibold">{k.title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{k.body}</p>
            </button>
          );
        })}
      </div>

      <Card className="mt-6 p-5">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            const body = {
              kind,
              name: name.trim(),
              description: description.trim(),
              category,
              version: version.trim(),
              permissions: isExt ? permissions : [],
              matches: isExt ? matches.split(/[\s,]+/).filter(Boolean).slice(0, 20) : [],
              ...(kind === "agent" ? { instructions: instructions.trim() } : {}),
            };
            const r = await call<DevProject>("/api/developer/projects", "POST", body);
            setBusy(false);
            if (!r.ok) return setErr(r.error);
            downloadStarter(r.data);
            router.push("/developers/extensions");
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Whale Watcher" required minLength={2} maxLength={40} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12.5px] text-muted">What does it do?</span>
            <textarea className="input h-auto py-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One or two sentences users will see in the STRATA Store." required minLength={10} maxLength={280} />
          </label>
          {isExt && (
            <>
              <div className="sm:col-span-2">
                <span className="mb-2 block text-[12.5px] text-muted">Permissions</span>
                <div className="flex flex-wrap gap-2">
                  {EXTENSION_PERMISSIONS.map((p) => {
                    const on = permissions.includes(p.id);
                    return (
                      <button type="button" key={p.id} onClick={() => setPermissions(on ? permissions.filter((x) => x !== p.id) : [...permissions, p.id])} className={cn("rounded-full border px-3 py-1 text-[12.5px] transition-colors", on ? "border-transparent bg-fg text-bg" : "border-line text-muted hover:text-fg")}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[12.5px] text-muted">Runs on these sites</span>
                <input className="input" value={matches} onChange={(e) => setMatches(e.target.value)} placeholder="https://jup.ag/*, https://*.raydium.io/*" />
              </label>
            </>
          )}
          {kind === "agent" && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12.5px] text-muted">Agent instructions</span>
              <textarea className="input h-auto py-2" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="You watch my followed wallets and tell me when one buys a new token, with its risk check." />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[12.5px] text-muted">Version</span>
            <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} pattern="\d+\.\d+\.\d+" />
          </label>
          <div className="flex items-end">
            <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50">
              {busy ? "Creating…" : "Create and download starter"}
            </button>
          </div>
          {err && <p className="text-[13px] text-down sm:col-span-2">{err}</p>}
        </form>
      </Card>
    </DevGate>
  );
}
