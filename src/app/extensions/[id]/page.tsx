"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Badge, Card, InfoNote, Monogram, Page, Section } from "@/components/ui";
import { InstallControls } from "@/components/extensions/install-button";
import { ExtensionWidget } from "@/components/extensions/widgets";
import { getExtension } from "@/lib/extensions/catalog";
import { PERMISSIONS } from "@/lib/extensions/sdk";
import { useStore } from "@/lib/client/store";

export default function ExtensionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ext = getExtension(decodeURIComponent(id));
  const installed = useStore((s) => s.installed.some((i) => i.id === ext?.id));
  if (!ext) notFound();
  return (
    <Page>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Monogram name={ext.name} color={ext.color} size={72} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{ext.name}</h1>
            {ext.verified && <Badge tone="green">Verified</Badge>}
          </div>
          <p className="mt-1 text-[14.5px] text-muted">{ext.description}</p>
          <p className="mt-1 text-[12.5px] text-faint">
            {ext.author} · v{ext.version} · {ext.category}
          </p>
        </div>
        <InstallControls ext={ext} />
      </div>
      {ext.requires && <InfoNote className="mt-5">This extension needs {ext.requires}. Until one is configured it shows an explanation instead of data.</InfoNote>}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Section title="Preview" className="mt-0">
          <ExtensionWidget manifest={ext} />
          {!installed && <p className="mt-2 text-[12px] text-faint">Install it to add this widget to your workspace.</p>}
        </Section>
        <Section title="Permissions" className="mt-0">
          <Card className="p-4">
            <ul className="space-y-2.5">
              {ext.permissions.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[13px]">
                  <KeyRound size={14} className="mt-0.5 shrink-0 text-muted" />
                  <span>
                    {PERMISSIONS[p]}
                    <span className="block font-mono text-[11px] text-faint">{p}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">Extensions can only use what they declare. They never receive your keys and cannot sign transactions.</p>
          </Card>
          <Link href="/developers#extensions" className="mt-3 inline-block text-[12.5px] text-muted hover:text-fg">
            How extensions work →
          </Link>
        </Section>
      </div>
    </Page>
  );
}
