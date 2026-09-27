"use client";

import Link from "next/link";
import { Puzzle } from "lucide-react";
import { Card, EmptyState, Page, PageHeader, cn } from "@/components/ui";
import { ExtensionWidget } from "@/components/extensions/widgets";
import { getExtension } from "@/lib/extensions/catalog";
import { useStore } from "@/lib/client/store";

export default function WorkspacePage() {
  const installed = useStore((s) => s.installed);
  const active = installed.filter((i) => i.enabled).map((i) => getExtension(i.id)).filter(Boolean);
  return (
    <Page wide>
      <PageHeader
        title="Workspace"
        subtitle="Your installed extensions, side by side."
        actions={
          <Link href="/extensions" className="btn btn-soft btn-sm">
            <Puzzle size={14} /> Add extensions
          </Link>
        }
      />
      {!active.length ? (
        <Card>
          <EmptyState icon={<Puzzle size={20} />} title="No extensions enabled" body="Install tools like Whale Alerts, Token Scanner or Network Monitor from the Extensions store." action={<Link href="/extensions" className="btn btn-primary btn-sm">Browse extensions</Link>} />
        </Card>
      ) : (
        <div className="grid auto-rows-min gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((m) => (
            <div key={m!.id} className={cn(m!.widget.size === "lg" && "md:col-span-2")}>
              <ExtensionWidget manifest={m!} />
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
