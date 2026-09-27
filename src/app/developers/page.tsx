"use client";

import { useState } from "react";
import { z } from "zod";
import { CheckCircle2, Code2, LayoutGrid, Puzzle } from "lucide-react";
import { Badge, Card, Page, PageHeader, Section, Tabs, InfoNote } from "@/components/ui";
import { useActions, useStore } from "@/lib/client/store";
import { manifestSchema, PERMISSIONS } from "@/lib/extensions/sdk";
import { APP_CATEGORIES } from "@/lib/types";
import { timeAgo } from "@/lib/format";

const appSchema = z.object({
  name: z.string().min(2).max(40),
  tagline: z.string().min(5).max(90),
  description: z.string().min(20).max(600),
  category: z.enum(APP_CATEGORIES),
  website: z.string().url(),
  twitter: z.string().max(30).optional().or(z.literal("")),
  github: z.string().url().optional().or(z.literal("")),
  programIds: z.string().max(500).optional(),
  developer: z.string().min(2).max(60),
  contact: z.string().email(),
});

const EXAMPLE_MANIFEST = JSON.stringify(
  {
    id: "acme.jito-tip-tracker",
    name: "Jito Tip Tracker",
    version: "1.0.0",
    author: "Acme Labs",
    description: "Shows current Jito tip levels and alerts you when tips spike.",
    category: "Network",
    icon: "Activity",
    color: "#7ee787",
    permissions: ["network:read", "notifications"],
    widget: { size: "sm" },
    entry: "https://acme.example/solana-os/widget.html",
  },
  null,
  2,
);

const API = [
  ["GET", "/api/search?q=", "Unified search: intent + grouped results"],
  ["GET", "/api/tokens?list=trending|top_traded|new|movers|mints", "Token lists"],
  ["GET", "/api/tokens/{mint}", "Token market data"],
  ["GET", "/api/tokens/{mint}/history?range=1D|7D|30D|90D|1Y", "Price history"],
  ["GET", "/api/tokens/{mint}/holders", "Top holders (resolved owners)"],
  ["GET", "/api/wallets/{address}", "Portfolio from on-chain balances"],
  ["GET", "/api/wallets/{address}/activity", "Recent transactions, explained"],
  ["GET", "/api/tx/{signature}", "Plain-English transaction explanation"],
  ["GET", "/api/security?q=", "Risk indicators for a mint, wallet, program or domain"],
  ["POST", "/api/security/tx", "Decode + simulate a transaction before signing"],
  ["GET", "/api/apps", "App registry + live metrics"],
  ["GET", "/api/defi", "Protocols, yields, DEX volume"],
  ["GET", "/api/news", "Aggregated news with sources"],
  ["GET", "/api/network", "Slot, TPS, priority fees"],
  ["POST", "/api/ai/chat", "Solana AI (NDJSON stream)"],
  ["POST", "/api/ai/ask", "Solana AI (single response)"],
];

function SubmitApp() {
  const { submit } = useActions();
  const [f, setF] = useState<Record<string, string>>({ category: "DeFi" });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-muted">{label}</span>
      <input className="input" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </label>
  );
  return (
    <Card className="p-5">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const r = appSchema.safeParse(f);
          if (!r.success) return setErrors(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
          setErrors([]);
          submit({ type: "app", name: r.data.name, payload: r.data });
          setDone(true);
          setF({ category: "DeFi" });
        }}
      >
        {field("name", "App name")}
        {field("developer", "Developer / company")}
        {field("tagline", "Tagline")}
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-muted">Category</span>
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {APP_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[12.5px] text-muted">Description</span>
          <textarea className="input h-auto py-2" rows={3} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        {field("website", "Website", { type: "url", placeholder: "https://" })}
        {field("twitter", "X handle (optional)")}
        {field("github", "GitHub (optional)", { placeholder: "https://github.com/…" })}
        {field("programIds", "Program IDs (comma separated)")}
        {field("contact", "Contact email", { type: "email" })}
        <div className="flex items-end">
          <button className="btn btn-primary w-full">Submit for review</button>
        </div>
      </form>
      {errors.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-[12.5px] text-down">
          {errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {done && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-up"><CheckCircle2 size={14} /> Submitted. It&apos;s now pending review.</p>}
      <p className="mt-3 text-[11.5px] text-faint">Listings are reviewed before they appear in the App Store. Usage metrics are never self-reported; they come from independent data providers.</p>
    </Card>
  );
}

function SubmitExtension() {
  const { submit } = useActions();
  const [json, setJson] = useState(EXAMPLE_MANIFEST);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  return (
    <Card className="p-5">
      <textarea value={json} onChange={(e) => (setJson(e.target.value), setDone(false))} rows={14} className="input h-auto py-3 font-mono text-[12px]" spellCheck={false} aria-label="Extension manifest" />
      <div className="mt-3 flex gap-2">
        <button
          className="btn btn-primary"
          onClick={() => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(json);
            } catch (e) {
              return setErrors([`Invalid JSON: ${(e as Error).message}`]);
            }
            const r = manifestSchema.safeParse(parsed);
            if (!r.success) return setErrors(r.error.issues.map((i) => `${i.path.join(".") || "manifest"}: ${i.message}`));
            setErrors([]);
            submit({ type: "extension", name: r.data.name, payload: r.data });
            setDone(true);
          }}
        >
          Validate & submit
        </button>
        <button className="btn btn-ghost" onClick={() => setJson(EXAMPLE_MANIFEST)}>
          Reset example
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-[12.5px] text-down">
          {errors.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {done && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-up"><CheckCircle2 size={14} /> Manifest is valid and submitted for review.</p>}
    </Card>
  );
}

export default function DevelopersPage() {
  const [tab, setTab] = useState<"dashboard" | "app" | "extension" | "api" | "sdk">("dashboard");
  const subs = useStore((s) => s.submissions);
  return (
    <Page>
      <PageHeader title="Developer Platform" subtitle="Submit apps and extensions, integrate with the Solana OS API, and build widgets and plugins with the Extension SDK." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "dashboard", label: "Dashboard" },
          { value: "app", label: "Submit an app" },
          { value: "extension", label: "Submit an extension" },
          { value: "api", label: "API" },
          { value: "sdk", label: "Extension SDK" },
        ]}
        className="mb-6"
      />
      {tab === "dashboard" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: LayoutGrid, t: "Apps", n: subs.filter((s) => s.type === "app").length, go: "app" as const },
              { icon: Puzzle, t: "Extensions", n: subs.filter((s) => s.type === "extension").length, go: "extension" as const },
              { icon: Code2, t: "API endpoints", n: API.length, go: "api" as const },
            ].map((c) => (
              <Card key={c.t} className="p-5" onClick={() => setTab(c.go)}>
                <c.icon size={18} className="text-muted" />
                <div className="mt-3 text-[24px] font-semibold tabular">{c.n}</div>
                <div className="text-[13px] text-muted">{c.t}</div>
              </Card>
            ))}
          </div>
          <Section title="Your submissions">
            <Card className="p-2">
              {!subs.length && <p className="p-4 text-[13px] text-muted">Nothing submitted yet.</p>}
              {subs.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2.5 text-[13.5px]">
                  <span>
                    {s.name} <span className="text-faint">· {s.type}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] text-faint">{timeAgo(s.at)}</span>
                    <Badge tone="warn">Pending review</Badge>
                  </span>
                </div>
              ))}
            </Card>
            <p className="mt-2 text-[11.5px] text-faint">Submissions are validated here and queued on this device. A review backend is the next integration point.</p>
          </Section>
        </>
      )}
      {tab === "app" && <SubmitApp />}
      {tab === "extension" && (
        <div id="extensions">
          <SubmitExtension />
        </div>
      )}
      {tab === "api" && (
        <Card className="overflow-x-auto p-4">
          <table className="w-full min-w-[560px] text-[13px]">
            <tbody>
              {API.map(([m, path, d]) => (
                <tr key={path} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3">
                    <Badge tone={m === "GET" ? "green" : "purple"}>{m}</Badge>
                  </td>
                  <td className="pr-4 font-mono text-[12px]">{path}</td>
                  <td className="text-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] text-faint">Every data response includes a <code className="font-mono">meta</code> object with the provider, whether it is <code className="font-mono">live</code> or <code className="font-mono">demo</code>, and when it was fetched.</p>
        </Card>
      )}
      {tab === "sdk" && (
        <div className="space-y-4">
          <Card className="p-5 text-[14px] leading-relaxed text-muted">
            <p>
              Extensions are widgets that run inside Solana OS and talk to it only through the <code className="font-mono text-fg">ExtensionHost</code> API. Every capability is gated by a permission declared in the manifest and granted by the user on install. Extensions never receive private keys and cannot sign transactions.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[12px] text-fg">{`export default function Widget({ host }: { host: ExtensionHost }) {
  const [status, setStatus] = useState(null);
  useEffect(() => { host.network.status().then(setStatus); }, [host]);
  // host.search(q) · host.wallet.portfolio(addr) · host.tokens.get(mint)
  // host.prefs.get/set · host.notifications.push({...}) · host.ai.ask(prompt)
  return <div>Slot {status?.data.slot}</div>;
}`}</pre>
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Permissions</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.entries(PERMISSIONS).map(([k, v]) => (
                <div key={k} className="text-[13px]">
                  <code className="font-mono text-[12px] text-sol-green">{k}</code>
                  <div className="text-muted">{v}</div>
                </div>
              ))}
            </div>
          </Card>
          <InfoNote>Built-in extensions run in-process today. Third-party extensions will load their <code className="font-mono">entry</code> URL in a sandboxed iframe and call the same host API over postMessage, so extension code doesn&apos;t change when the transport does.</InfoNote>
        </div>
      )}
    </Page>
  );
}
