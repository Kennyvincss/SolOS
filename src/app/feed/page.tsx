"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Heart, MessageCircle, Send, Share2 } from "lucide-react";
import { Card, DataBadge, EmptyState, Monogram, Page, PageHeader, SkeletonRows, Tabs, cn, share } from "@/components/ui";
import { AppCard, NewsRow, TokenRow } from "@/components/domain";
import { FollowingFeed } from "@/components/wallet-tools";
import { useApi } from "@/lib/client/fetch";
import { useActions, useStore, type Post } from "@/lib/client/store";
import { useSession } from "@/lib/client/session";
import { APPS } from "@/lib/catalog/apps";
import type { NewsItem, Sourced, Token } from "@/lib/types";
import { timeAgo } from "@/lib/format";

type Tab = "trending" | "following" | "new" | "wallets" | "apps" | "news" | "community";

function Actions({ id, title, href }: { id: string; title: string; href: string }) {
  const liked = useStore((s) => s.liked.includes(id));
  const saved = useStore((s) => s.bookmarks.includes(id));
  const { toggleLike, toggleBookmark } = useActions();
  return (
    <div className="mt-2 flex gap-4 text-[12.5px] text-faint">
      <button onClick={() => toggleLike(id)} className={cn("flex items-center gap-1 hover:text-fg", liked && "text-down")} aria-pressed={liked}>
        <Heart size={14} className={liked ? "fill-current" : ""} /> Like
      </button>
      <button onClick={() => toggleBookmark(id)} className={cn("flex items-center gap-1 hover:text-fg", saved && "text-sol-green")} aria-pressed={saved}>
        <Bookmark size={14} className={saved ? "fill-current" : ""} /> Save
      </button>
      <button onClick={() => share(title, new URL(href, location.origin).toString())} className="flex items-center gap-1 hover:text-fg">
        <Share2 size={14} /> Share
      </button>
    </div>
  );
}

function PostCard({ p }: { p: Post }) {
  const [c, setC] = useState("");
  const [open, setOpen] = useState(false);
  const { addComment } = useActions();
  const session = useSession();
  return (
    <div className="py-4">
      <div className="flex items-center gap-2.5">
        <Monogram name={p.author} size={30} rounded="full" color="#14f195" />
        <div className="text-[13.5px] font-medium">{p.author}</div>
        <span className="text-[12px] text-faint">{timeAgo(p.at)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed">{p.text}</p>
      <div className="flex items-center gap-4">
        <Actions id={`post:${p.id}`} title="Solana OS post" href="/feed" />
        <button onClick={() => setOpen((v) => !v)} className="mt-2 flex items-center gap-1 text-[12.5px] text-faint hover:text-fg">
          <MessageCircle size={14} /> {p.comments.length || ""} Comment
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-l border-line pl-4">
          {p.comments.map((x) => (
            <div key={x.id} className="text-[13px]">
              <span className="font-medium">{x.author}</span> <span className="text-muted">{x.text}</span>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!c.trim()) return;
              addComment(p.id, c.trim().slice(0, 500), session.user?.name ?? "You");
              setC("");
            }}
            className="flex gap-2"
          >
            <input value={c} onChange={(e) => setC(e.target.value)} className="input h-9 text-[13px]" placeholder="Write a comment" />
            <button className="btn btn-soft btn-sm h-9">Reply</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Community() {
  const posts = useStore((s) => s.posts);
  const { addPost } = useActions();
  const session = useSession();
  const [text, setText] = useState("");
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          addPost(text.trim().slice(0, 1000), session.user?.name ?? "You");
          setText("");
        }}
        className="flex gap-2"
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="input h-auto py-2.5" placeholder="Share something with the Solana community…" />
        <button className="btn btn-primary self-end" aria-label="Post" disabled={!text.trim()}>
          <Send size={15} />
        </button>
      </form>
      <p className="mt-2 text-[11.5px] text-faint">Community posts are stored on this device until the social backend is connected. Nothing is published anywhere yet.</p>
      <div className="divide-y divide-line">
        {posts.map((p) => (
          <PostCard key={p.id} p={p} />
        ))}
      </div>
      {!posts.length && <EmptyState title="No posts yet" body="Start the conversation." />}
    </div>
  );
}

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("trending");
  const trending = useApi<Sourced<Token[]>>(tab === "trending" ? "/api/tokens?list=trending&limit=15" : null);
  const fresh = useApi<Sourced<Token[]>>(tab === "new" ? "/api/tokens?list=new&limit=15" : null);
  const news = useApi<Sourced<NewsItem[]>>(tab === "news" ? "/api/news" : null);
  const followsEntities = useStore((s) => s.followsEntities);
  const { toggleFollowEntity } = useActions();

  return (
    <Page>
      <PageHeader title="Feed" subtitle="Follow wallets, projects and apps. See what's happening across Solana." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "trending", label: "Trending on Solana" },
          { value: "following", label: "Following" },
          { value: "new", label: "New projects" },
          { value: "wallets", label: "Wallet activity" },
          { value: "apps", label: "Apps" },
          { value: "news", label: "News" },
          { value: "community", label: "Community" },
        ]}
        className="mb-5"
      />
      <Card className="p-4 sm:p-5">
        {tab === "trending" && (
          <>
            <div className="mb-2 flex justify-end">
              <DataBadge meta={trending.data?.meta} />
            </div>
            {trending.loading && <SkeletonRows rows={6} />}
            <div className="-mx-2 divide-y divide-line">
              {trending.data?.data.map((t, i) => (
                <div key={t.mint} className="py-1">
                  <TokenRow t={t} rank={i + 1} right="volume" />
                  <div className="px-2">
                    <Actions id={`token:${t.mint}`} title={t.symbol} href={`/tokens/${t.mint}`} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "new" && (
          <>
            {fresh.loading && <SkeletonRows rows={6} />}
            <p className="mb-2 text-[12px] text-warn">Newly launched tokens are extremely risky. Check risk indicators before interacting.</p>
            <div className="-mx-2">{fresh.data?.data.map((t) => <TokenRow key={t.mint} t={t} right="liquidity" />)}</div>
          </>
        )}
        {(tab === "following" || tab === "wallets") && (
          <>
            <FollowingFeed limit={40} />
            {tab === "following" && followsEntities.length > 0 && (
              <div className="mt-6">
                <div className="mb-2 text-[12px] font-medium uppercase tracking-wider text-faint">Projects you follow</div>
                <div className="flex flex-wrap gap-2">
                  {followsEntities.map((e) => {
                    const app = APPS.find((a) => `project:${a.slug}` === e || `app:${a.slug}` === e);
                    return app ? (
                      <Link key={e} href={`/projects/${app.slug}`} className="chip">
                        {app.name}
                      </Link>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </>
        )}
        {tab === "apps" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {APPS.filter((a) => a.featured).map((a) => {
              const id = `app:${a.slug}`;
              const on = followsEntities.includes(id);
              return (
                <div key={a.slug}>
                  <AppCard app={a} compact />
                  <button onClick={() => toggleFollowEntity(id)} className={cn("mt-1.5 text-[12px]", on ? "text-sol-green" : "text-faint hover:text-fg")}>
                    {on ? "✓ Following" : "+ Follow"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {tab === "news" && (
          <>
            {news.loading && <SkeletonRows rows={5} />}
            <div className="-mx-2 divide-y divide-line">
              {news.data?.data.slice(0, 20).map((n) => (
                <div key={n.id}>
                  <NewsRow n={n} />
                  <div className="px-2 pb-2">
                    <Actions id={`news:${n.id}`} title={n.title} href={n.url} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "community" && <Community />}
      </Card>
    </Page>
  );
}
