"use client";

import Link from "next/link";
import { ExternalLink, Rss } from "lucide-react";
import { Badge, Card, DataBadge, EmptyState, Monogram, Page, Section, SkeletonRows, Stat, cn } from "@/components/ui";
import { NewsRow, TokenRow } from "@/components/domain";
import { getApp, domainOf, appLogo } from "@/lib/catalog/apps";
import { useApi } from "@/lib/client/fetch";
import { useActions, useStore } from "@/lib/client/store";
import type { AppMetrics, DataMeta, NewsItem, Sourced, Token } from "@/lib/types";
import { fmtUsd } from "@/lib/format";

export function ProjectView({ slug }: { slug: string }) {
  const app = getApp(slug)!;
  const metrics = useApi<{ metrics: Record<string, AppMetrics>; meta: DataMeta }>("/api/apps");
  const token = useApi<Sourced<Token>>(app.token ? `/api/tokens/${app.token.mint}` : null);
  const news = useApi<Sourced<NewsItem[]>>("/api/news");
  const following = useStore((s) => s.followsEntities.includes(`project:${slug}`));
  const { toggleFollowEntity } = useActions();
  const m = metrics.data?.metrics[slug];
  const name = app.name.split(" ")[0].replace(/[^a-z0-9]/gi, "");
  const updates = news.data?.data.filter((n) => new RegExp(`\\b${name}\\b`, "i").test(`${n.title} ${n.summary ?? ""}`)).slice(0, 6) ?? [];

  return (
    <Page>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Monogram name={app.name} color={app.color} src={appLogo(app.slug)} size={72} />
        <div className="flex-1">
          <div className="text-[13px] text-muted">Project</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{app.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge>{app.category}</Badge>
            {m?.llamaCategory && <Badge>{m.llamaCategory}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => toggleFollowEntity(`project:${slug}`)} className={cn("btn btn-sm", following ? "btn-soft" : "btn-primary")}>
            <Rss size={14} /> {following ? "Following" : "Follow"}
          </button>
          <Link href={`/apps/${slug}`} className="btn btn-ghost btn-sm">
            App page
          </Link>
        </div>
      </div>
      <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-muted">{app.description}</p>

      <Card className="mt-6 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="TVL" value={m?.tvlUsd !== undefined ? fmtUsd(m.tvlUsd, { compact: true }) : "—"} />
        <Stat label="24h volume" value={m?.volume24h !== undefined ? fmtUsd(m.volume24h, { compact: true }) : "—"} />
        <Stat label="Launched" value={app.launched ?? "—"} />
        <Stat label="Funding" value={<span className="text-faint">—</span>} sub={<span className="text-faint">No verified source</span>} />
        <div className="col-span-2 sm:col-span-4">{metrics.data && <DataBadge meta={metrics.data.meta} />}</div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold">Token</h3>
          {!app.token && <p className="mt-2 text-[13px] text-muted">This project has no token listed.</p>}
          {token.loading && <SkeletonRows rows={1} />}
          {token.data && (
            <div className="-mx-2 mt-2">
              <TokenRow t={token.data.data} right="mcap" />
            </div>
          )}
          <h3 className="mt-5 text-[15px] font-semibold">Team & developers</h3>
          <p className="mt-1 text-[13.5px] text-muted">{app.developer}</p>
          {app.github && (
            <a href={app.github} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-sol-green">
              Open-source code <ExternalLink size={11} />
            </a>
          )}
          <h3 className="mt-5 text-[15px] font-semibold">Security</h3>
          <p className="mt-1 text-[13.5px] text-muted">{app.audits ? `Audited by ${app.audits.join(", ")}.` : "No audits listed in the registry."}</p>
        </Card>
        <Card className="p-5">
          <h3 className="text-[15px] font-semibold">Community</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={app.website} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
              {domainOf(app.website)}
            </a>
            {app.twitter && (
              <a href={`https://x.com/${app.twitter}`} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                𝕏 @{app.twitter}
              </a>
            )}
            {app.discord && (
              <a href={app.discord} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                Discord
              </a>
            )}
            {app.docs && (
              <a href={app.docs} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">
                Docs
              </a>
            )}
          </div>
          <h3 className="mt-5 text-[15px] font-semibold">Users & activity</h3>
          <p className="mt-1 text-[13px] text-muted">Active-user counts require an indexer; TVL and volume above come from DefiLlama.</p>
        </Card>
      </div>

      <Section title="Recent updates" subtitle="News that mentions this project" action={<DataBadge meta={news.data?.meta} />}>
        <Card className="p-4 sm:p-5">
          {news.loading && <SkeletonRows rows={3} />}
          {news.data && !updates.length && <EmptyState title="No recent coverage" />}
          <div className="-mx-2 divide-y divide-line">
            {updates.map((n) => (
              <NewsRow key={n.id} n={n} />
            ))}
          </div>
        </Card>
      </Section>
    </Page>
  );
}
