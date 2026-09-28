"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Code2, Download, ExternalLink, Loader2, PanelsTopLeft, Search, Trash2 } from "lucide-react";
import { Badge, Card, Monogram, Page, PageHeader, Section, Tabs } from "@/components/ui";
import { InstallControls } from "@/components/extensions/install-button";
import { EXTENSIONS } from "@/lib/extensions/catalog";
import { EXTENSION_CATEGORIES } from "@/lib/extensions/sdk";
import { BROWSER_EXTENSIONS, CHROME_WEB_STORE_SOLANA_SEARCH, chromeWebStoreUrl } from "@/lib/extensions/browser";
import { useAppShell, useDesktopExtensions } from "@/lib/client/desktop";
import { useStore } from "@/lib/client/store";
import { appLogo } from "@/lib/catalog/apps";

const RELEASES_URL = "https://github.com/Kennyvincss/SolOS/releases";

function BrowserExtensions() {
  const shell = useAppShell();
  const desktop = useDesktopExtensions();

  const intro =
    shell === "desktop"
      ? "Real Chrome extensions. Install one and it appears next to the address bar and works on every site, exactly like in Chrome."
      : shell === "mobile"
        ? "Phones can't run browser extensions. In the Solana OS app, sites connect to your Phantom or Solflare app instead: pick it in any site's “Connect wallet” list."
        : "Real Chrome extensions. Add them to Chrome, Brave or Edge from the Chrome Web Store, or get the Solana OS desktop app to install them here with one click.";

  return (
    <Section
      id="browser"
      title="Browser extensions"
      subtitle={intro}
      action={
        shell === "mobile" ? undefined : (
          <a href={CHROME_WEB_STORE_SOLANA_SEARCH} target={shell === "desktop" ? undefined : "_blank"} rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <Search size={14} /> Find more Solana extensions
          </a>
        )
      }
    >
      {shell === "web" && (
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm mb-4">
          <Download size={14} /> Get Solana OS for desktop
        </a>
      )}
      {desktop.error && <p className="mb-3 rounded-xl border border-line px-3 py-2 text-[13px] text-down">{desktop.error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BROWSER_EXTENSIONS.map((x) => {
          const installed = desktop.installed.has(x.id);
          const busy = desktop.busy === x.id;
          return (
            <Card key={x.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <Monogram name={x.name} color={x.color} size={44} src={x.app ? appLogo(x.app) : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{x.name}</span>
                    <Badge>{x.kind}</Badge>
                  </div>
                  <div className="text-[12px] text-faint">Chrome Web Store</div>
                </div>
              </div>
              <p className="line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted">{x.description}</p>
              <div className="flex items-center justify-end gap-2">
                {desktop.available ? (
                  installed ? (
                    <>
                      <span className="mr-auto flex items-center gap-1 text-[12.5px] text-sol-green">
                        <Check size={14} /> Installed
                      </span>
                      <button onClick={() => desktop.remove(x.id)} disabled={busy} className="btn btn-ghost btn-sm" aria-label={`Remove ${x.name}`}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Remove
                      </button>
                    </>
                  ) : (
                    <button onClick={() => desktop.install(x.id, x.name)} disabled={busy} className="btn btn-primary btn-sm">
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {busy ? "Installing…" : "Install"}
                    </button>
                  )
                ) : shell === "mobile" ? null : (
                  <a href={chromeWebStoreUrl(x.id)} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                    Chrome Web Store <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

function SolanaOSTools() {
  const [cat, setCat] = useState<string>("All");
  const installed = useStore((s) => s.installed);
  const list = EXTENSIONS.filter((e) => cat === "All" || e.category === cat);
  const enabled = installed.filter((i) => i.enabled).length;
  return (
    <Section
      id="tools"
      title="Solana OS tools"
      subtitle="Built-in tools that run inside Solana OS on any device. Install one and it shows up as a live panel in your Workspace."
      action={
        <Link href="/workspace" className="btn btn-soft btn-sm">
          <PanelsTopLeft size={14} /> Open Workspace ({enabled}) <ArrowRight size={13} />
        </Link>
      }
    >
      <Tabs value={cat} onChange={setCat} options={[{ value: "All", label: "All" }, ...EXTENSION_CATEGORIES.map((c) => ({ value: c, label: c }))]} className="mb-4" />
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
    </Section>
  );
}

export default function ExtensionsPage() {
  const submissions = useStore((s) => s.submissions.filter((x) => x.type === "extension"));
  return (
    <Page wide>
      <PageHeader
        title="Extensions"
        subtitle="Wallets and tools for Solana: real browser extensions for the Solana OS desktop browser, and Solana OS tools that live in your Workspace."
        actions={
          <Link href="/developers#extensions" className="btn btn-soft btn-sm">
            <Code2 size={14} /> Build an extension
          </Link>
        }
      />
      <BrowserExtensions />
      <SolanaOSTools />
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
