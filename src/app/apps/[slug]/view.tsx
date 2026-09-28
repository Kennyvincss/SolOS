"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Code2, Download, ExternalLink, Globe, Heart, ImageOff, MessageCircle, Plus, Share2, ShieldCheck, Star } from "lucide-react";
import { Address, Badge, Card, DataBadge, Monogram, Page, Section, Stat, cn, share } from "@/components/ui";
import { AppCard } from "@/components/domain";
import { getApp, appsByCategory, domainOf, appLogo } from "@/lib/catalog/apps";
import { useApi } from "@/lib/client/fetch";
import { useActions, useStore } from "@/lib/client/store";
import { useSession } from "@/lib/client/session";
import { useAppShell } from "@/lib/client/desktop";
import type { AppMetrics, DataMeta } from "@/lib/types";
import { fmtUsd, timeAgo } from "@/lib/format";
import { BookmarkButton } from "@/components/library";

function Reviews({ slug }: { slug: string }) {
  const reviews = useStore((s) => s.reviews[slug] ?? []);
  const { addReview } = useActions();
  const session = useSession();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Reviews</h3>
        {reviews.length > 0 && (
          <span className="flex items-center gap-1 text-[13px] text-muted">
            <Star size={13} className="fill-warn text-warn" /> {avg.toFixed(1)} · {reviews.length}
          </span>
        )}
      </div>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addReview(slug, { rating, text: text.trim().slice(0, 600), author: session.user?.name ?? "You" });
          setText("");
        }}
      >
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button type="button" key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star size={18} className={n <= rating ? "fill-warn text-warn" : "text-faint"} />
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="input h-auto py-2" placeholder="Share your experience with this app" />
        <button className="btn btn-soft btn-sm" disabled={!text.trim()}>
          Post review
        </button>
      </form>
      <div className="mt-4 divide-y divide-line">
        {reviews.map((r) => (
          <div key={r.id} className="py-3">
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span className="flex items-center gap-1">
                {Array.from({ length: r.rating }).map((_, i) => (
                  <Star key={i} size={11} className="fill-warn text-warn" />
                ))}
                <span className="ml-1">{r.author}</span>
              </span>
              <span>{timeAgo(r.at)}</span>
            </div>
            <p className="mt-1 text-[13.5px]">{r.text}</p>
          </div>
        ))}
        {!reviews.length && <p className="py-3 text-[13px] text-muted">No reviews yet. Reviews are stored on this device until account sync is enabled.</p>}
      </div>
    </Card>
  );
}

export function AppDetail({ slug }: { slug: string }) {
  const app = getApp(slug)!;
  const { data } = useApi<{ metrics: Record<string, AppMetrics>; meta: DataMeta }>("/api/apps");
  const m = data?.metrics[slug];
  const fav = useStore((s) => s.favorites.includes(slug));
  const added = useStore((s) => s.addedApps.includes(slug));
  const { toggleFavorite, toggleAddedApp } = useActions();
  const related = appsByCategory(app.category).filter((a) => a.slug !== slug).slice(0, 3);
  const openUrl = app.appUrl ?? app.website;
  const shell = useAppShell();

  return (
    <Page>
      <div className="animate-fade-up flex flex-col gap-5 sm:flex-row sm:items-start">
        <Monogram name={app.name} color={app.color} src={appLogo(app.slug)} size={88} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{app.name}</h1>
            <Badge>{app.category}</Badge>
            {app.subcategories?.map((s) => (
              <Badge key={s}>{s}</Badge>
            ))}
          </div>
          <p className="mt-1 text-[15px] text-muted">{app.tagline}</p>
          <p className="mt-1 text-[13px] text-faint">by {app.developer}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {shell === "desktop" ? (
              // In the desktop app, open a real browser tab so wallet extensions work.
              <a href={openUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Open App
              </a>
            ) : shell === "mobile" ? (
              // In the phone app, open it in place; its wallet connections work there.
              <a href={openUrl} className="btn btn-primary">
                Open App
              </a>
            ) : (
              <Link href={`/browser?url=${encodeURIComponent(openUrl)}`} className="btn btn-primary">
                Open App
              </Link>
            )}
            {app.download && (
              <a href={app.download} target="_blank" rel="noopener noreferrer" className="btn btn-soft">
                <Download size={15} /> Get the app
              </a>
            )}
            <button onClick={() => toggleAddedApp(slug)} className={cn("btn", added ? "btn-soft" : "btn-ghost")}>
              {added ? <Check size={15} /> : <Plus size={15} />} {added ? "Added to STRATA" : "Add to STRATA"}
            </button>
            <button onClick={() => toggleFavorite(slug)} className={cn("btn btn-ghost", fav && "text-down")} aria-pressed={fav}>
              <Heart size={15} className={fav ? "fill-current" : ""} /> {fav ? "Favorited" : "Favorite"}
            </button>
            <BookmarkButton title={app.name} className="h-10" />
            <button onClick={() => share(app.name)} className="btn btn-ghost" aria-label="Share">
              <Share2 size={15} /> Share
            </button>
          </div>
        </div>
      </div>

      <Card className="mt-6 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="TVL on Solana" value={m?.tvlUsd !== undefined ? fmtUsd(m.tvlUsd, { compact: true }) : "—"} sub={m?.change7d !== undefined && <span className={m.change7d >= 0 ? "text-up" : "text-down"}>{m.change7d.toFixed(1)}% 7d</span>} />
        <Stat label="24h volume" value={m?.volume24h !== undefined ? fmtUsd(m.volume24h, { compact: true }) : "—"} />
        <Stat label="Launched" value={app.launched ?? "—"} />
        <Stat label="Token" value={app.token ? <Link href={`/tokens/${app.token.mint}`} className="hover:text-sol-green">${app.token.symbol}</Link> : "—"} />
        <div className="col-span-2 sm:col-span-4">
          {data ? (
            m ? <DataBadge meta={data.meta} /> : <span className="text-[12px] text-faint">No public usage metrics tracked for this app yet.</span>
          ) : null}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">About</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{app.description}</p>
          </Card>
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Screenshots</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid aspect-[9/16] place-items-center rounded-xl border border-dashed border-line text-faint sm:aspect-video">
                  <ImageOff size={18} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-faint">The developer hasn&apos;t submitted screenshots yet. Developers can add them from the Developer Platform.</p>
          </Card>
          <Reviews slug={slug} />
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Links</h3>
            <div className="mt-3 space-y-2 text-[13.5px]">
              <a href={app.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sol-green">
                <Globe size={14} /> {domainOf(app.website)} <ExternalLink size={11} className="text-faint" />
              </a>
              {app.twitter && (
                <a href={`https://x.com/${app.twitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sol-green">
                  <span className="w-3.5 text-center font-semibold">𝕏</span> @{app.twitter}
                </a>
              )}
              {app.discord && (
                <a href={app.discord} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sol-green">
                  <MessageCircle size={14} /> Discord
                </a>
              )}
              {app.github && (
                <a href={app.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sol-green">
                  <Code2 size={14} /> GitHub
                </a>
              )}
              {app.docs && (
                <a href={app.docs} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sol-green">
                  <BookOpen size={14} /> Docs
                </a>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck size={15} /> Security
            </h3>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <span className="text-muted">Audits</span>
                <span className="text-right">{app.audits?.join(", ") ?? <span className="text-faint">Not listed</span>}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Bug bounty</span>
                <span>{app.bugBounty ?? <span className="text-faint">Not listed</span>}</span>
              </div>
              <Link href={`/security?q=${encodeURIComponent(app.website)}`} className="mt-1 inline-block text-[12.5px] text-sol-green">
                Check website →
              </Link>
            </div>
          </Card>
          {app.programs && (
            <Card className="p-5">
              <h3 className="text-[15px] font-semibold">Programs</h3>
              <div className="mt-3 space-y-2.5">
                {app.programs.map((p) => (
                  <div key={p.id} className="text-[13px]">
                    <div>{p.name}</div>
                    <Address value={p.id} href={`/wallets/${p.id}`} className="text-muted" />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-faint">Network: Solana mainnet</p>
            </Card>
          )}
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Developer</h3>
            <p className="mt-2 text-[13.5px]">{app.developer}</p>
            <Link href={`/projects/${slug}`} className="mt-2 inline-block text-[12.5px] text-sol-green">
              Project profile →
            </Link>
          </Card>
        </div>
      </div>

      {related.length > 0 && (
        <Section title={`More in ${app.category}`}>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((a) => (
              <AppCard key={a.slug} app={a} metrics={data?.metrics[a.slug]} compact />
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}
