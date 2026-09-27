"use client";

import { useState } from "react";
import Link from "next/link";
import { Code2, PanelsTopLeft } from "lucide-react";
import { Badge, Card, Monogram, Page, PageHeader, Section, Tabs } from "@/components/ui";
import { InstallControls } from "@/components/extensions/install-button";
import { EXTENSIONS } from "@/lib/extensions/catalog";
import { EXTENSION_CATEGORIES } from "@/lib/extensions/sdk";
import { useStore } from "@/lib/client/store";

export default function ExtensionsPage() {
  const [cat, setCat] = useState<string>("All");
  const installed = useStore((s) => s.installed);
  const submissions = useStore((s) => s.submissions.filter((x) => x.type === "extension"));
  const list = EXTENSIONS.filter((e) => cat === "All" || e.category === cat);
  return (
    <Page wide>
      <PageHeader
        title="Extensions"
        subtitle="Add tools to your Solana OS. Every extension declares the permissions it needs, and you can enable, disable or remove it at any time."
        actions={
          <>
            <Link href="/workspace" className="btn btn-ghost btn-sm">
              <PanelsTopLeft size={14} /> Workspace ({installed.filter((i) => i.enabled).length})
            </Link>
            <Link href="/developers#extensions" className="btn btn-soft btn-sm">
              <Code2 size={14} /> Build an extension
            </Link>
          </>
        }
      />
      <Tabs value={cat} onChange={setCat} options={[{ value: "All", label: "All" }, ...EXTENSION_CATEGORIES.map((c) => ({ value: c, label: c }))]} className="mb-6" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((e) => (
          <Link key={e.id} href={`/extensions/${e.id}`} className="card card-hover flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <Monogram name={e.name} color={e.color} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{e.name}</span>
                  {e.verified && <Badge tone="green">Verified</Badge>}
                </div>
                <div className="text-[12px] text-faint">
                  {e.author} · {e.category}
                </div>
              </div>
            </div>
            <p className="line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted">{e.description}</p>
            {e.requires && <p className="text-[11.5px] text-warn">Needs: {e.requires}</p>}
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] text-faint">{e.permissions.length} permissions</span>
              <InstallControls ext={e} compact />
            </div>
          </Link>
        ))}
      </div>
      {submissions.length > 0 && (
        <Section title="Your submissions" subtitle="Pending review">
          <Card className="divide-y divide-line p-2">
            {submissions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2.5 text-[13.5px]">
                {s.name} <Badge tone="warn">Pending review</Badge>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </Page>
  );
}
