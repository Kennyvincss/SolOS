"use client";

import Link from "next/link";
import { ArrowRight, Bell, Compass, Globe, LayoutGrid, PieChart, Puzzle, ReceiptText, ShieldCheck, Sparkles, Wallet, Search as SearchIcon, Code2, Target } from "lucide-react";
import { SearchBox, SuggestionChips } from "@/components/search-box";
import { Card, DataBadge, EmptyState, Page, Section, Skeleton, SkeletonRows, Change, cn } from "@/components/ui";
import { AppCard, NewsRow, TokenRow } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import { APPS } from "@/lib/catalog/apps";
import type { AppMetrics, AppEntry, NewsItem, Portfolio, Sourced, Token } from "@/lib/types";
import { fmtUsd } from "@/lib/format";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const PILLARS = [
  { icon: SearchIcon, title: "Search the ecosystem", body: "Tokens, wallets, transactions, apps and news from one box.", href: "/search" },
  { icon: LayoutGrid, title: "Discover apps", body: "A curated store of Solana applications with live metrics.", href: "/apps" },
  { icon: Sparkles, title: "Talk to Solana AI", body: "Answers grounded in live on-chain and market data, with sources.", href: "/ai" },
  { icon: Wallet, title: "Connect your wallet", body: "Portfolio, activity and alerts. Browsing never requires one.", href: "/portfolio" },
  { icon: ReceiptText, title: "Understand transactions", body: "Any signature, explained in plain English.", href: "/tx" },
  { icon: ShieldCheck, title: "Stay safe", body: "Transparent risk indicators before you sign or buy.", href: "/security" },
  { icon: Puzzle, title: "Install extensions", body: "Whale alerts, scanners and trackers in your workspace.", href: "/extensions" },
  { icon: Target, title: "Explore DeFi & RWAs", body: "Yields, lending, staking and tokenized real-world assets.", href: "/defi" },
  { icon: Code2, title: "Build on Solana", body: "Submit apps and extensions, use the SDK and APIs.", href: "/developers" },
];

function Trending() {
  const { data, loading, error } = useApi<Sourced<Token[]>>("/api/tokens?list=trending&limit=8", { refreshMs: 60_000 });
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">🔥 Trending tokens</h2>
        <DataBadge meta={data?.meta} />
      </div>
      {loading && <SkeletonRows rows={6} />}
      {error && <div className="py-6 text-center text-[13px] text-muted">{error}</div>}
      {data && (
        <div className="-mx-2">
          {data.data.slice(0, 6).map((t, i) => (
            <TokenRow key={t.mint} t={t} rank={i + 1} />
          ))}
        </div>
      )}
      <Link href="/tokens" className="mt-2 flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        All tokens <ArrowRight size={13} />
      </Link>
    </Card>
  );
}

function LatestNews() {
  const { data, loading } = useApi<Sourced<NewsItem[]>>("/api/news");
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">📰 Latest news</h2>
        <DataBadge meta={data?.meta} />
      </div>
      {loading && <SkeletonRows rows={4} />}
      <div className="-mx-2 divide-y divide-line">
        {data?.data.slice(0, 5).map((n) => (
          <NewsRow key={n.id} n={n} compact />
        ))}
      </div>
    </Card>
  );
}

function PortfolioSummary({ address }: { address: string }) {
  const { data, loading, error } = useApi<Sourced<Portfolio>>(`/api/wallets/${address}`, { refreshMs: 60_000 });
  return (
    <Card href="/portfolio" className="p-5">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span className="flex items-center gap-1.5">
          <PieChart size={14} /> Portfolio
        </span>
        <DataBadge meta={data?.meta} />
      </div>
      {loading && <Skeleton className="mt-3 h-9 w-40" />}
      {error && <div className="mt-3 text-[13px] text-muted">{error}</div>}
      {data && (
        <>
          <div className="mt-2 text-[32px] font-semibold tabular tracking-[-0.02em]">{data.data.totalUsd !== undefined ? fmtUsd(data.data.totalUsd) : "—"}</div>
          <div className="text-[13px]">
            <Change value={data.data.change24hPct} /> <span className="text-muted">today</span>
          </div>
          <div className="mt-4 flex -space-x-2">
            {data.data.holdings.slice(0, 6).map((h) => (
              <span key={h.mint} className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold">
                {h.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.icon} alt="" className="h-full w-full object-cover" />
                ) : (
                  h.symbol?.slice(0, 2)
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Watchlist() {
  const mints = useStore((s) => s.watchlist);
  const { data, loading } = useApi<Sourced<Token[]>>(mints.length ? `/api/tokens?list=mints&mints=${mints.slice(0, 12).join(",")}` : null, { refreshMs: 60_000 });
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Your watchlist</h2>
        <DataBadge meta={data?.meta} />
      </div>
      {!mints.length && <EmptyState title="Nothing on your watchlist" body="Star tokens to track them here." />}
      {loading && <SkeletonRows rows={3} />}
      <div className="-mx-2">
        {data?.data.slice(0, 6).map((t) => (
          <TokenRow key={t.mint} t={t} />
        ))}
      </div>
    </Card>
  );
}

function WalletAlertsCard() {
  const unread = useStore((s) => s.notifications.filter((n) => !n.read && n.category === "wallet"));
  const followed = useStore((s) => s.followed.length);
  return (
    <Card href="/notifications" className="p-5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        <Bell size={14} /> Wallet alerts
      </div>
      <div className="mt-2 text-[26px] font-semibold tabular">{unread.length}</div>
      <div className="text-[13px] text-muted">{unread.length === 1 ? "new transaction" : "new transactions"} from {followed} followed {followed === 1 ? "wallet" : "wallets"}</div>
      {unread[0] && <div className="mt-3 line-clamp-2 text-[12.5px] text-muted">{unread[0].title}: {unread[0].body}</div>}
    </Card>
  );
}

function RecommendedApps() {
  const favorites = useStore((s) => s.favorites);
  const added = useStore((s) => s.addedApps);
  const { data } = useApi<{ metrics: Record<string, AppMetrics> }>("/api/apps");
  const liked = new Set([...favorites, ...added]);
  const cats = new Set(APPS.filter((a) => liked.has(a.slug)).map((a) => a.category));
  let recs: AppEntry[] = APPS.filter((a) => !liked.has(a.slug) && cats.has(a.category));
  const reason = recs.length ? "Based on apps you use" : "Featured";
  if (recs.length < 4) recs = [...recs, ...APPS.filter((a) => a.featured && !liked.has(a.slug) && !recs.includes(a))];
  return (
    <Section title="Recommended apps" subtitle={reason} action={<Link href="/apps" className="text-[13px] text-muted hover:text-fg">App Store →</Link>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recs.slice(0, 6).map((a) => (
          <AppCard key={a.slug} app={a} metrics={data?.metrics[a.slug]} />
        ))}
      </div>
    </Section>
  );
}

function PersonalHome() {
  const s = useSession();
  const name = s.user?.name ?? (s.wallet ? "there" : "there");
  return (
    <Page>
      <div className="animate-fade-up mb-6 flex flex-col gap-5 sm:mb-8">
        <div>
          <div className="text-[13px] text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.02em] sm:text-[36px]">
            {greeting()}, {name}
          </h1>
        </div>
        <SearchBox size="md" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {s.address ? (
          <PortfolioSummary address={s.address} />
        ) : (
          <Card className="flex flex-col justify-between p-5">
            <div className="text-[13px] text-muted">Portfolio</div>
            <div>
              <div className="text-[15px] font-medium">Connect a wallet to see your portfolio</div>
              <button onClick={() => s.setWalletModal(true)} className="btn btn-primary btn-sm mt-3">
                <Wallet size={14} /> Connect
              </button>
            </div>
          </Card>
        )}
        <WalletAlertsCard />
        <Card href="/discover" className="p-5">
          <div className="flex items-center gap-1.5 text-[13px] text-muted">
            <Compass size={14} /> Discover
          </div>
          <div className="mt-2 text-[15px] font-medium leading-snug">See what&apos;s trending, new and moving on Solana right now.</div>
          <div className="mt-3 flex items-center gap-1 text-[13px] text-sol-green">
            Open Discover <ArrowRight size={13} />
          </div>
        </Card>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Watchlist />
        <Trending />
      </div>
      <RecommendedApps />
      <Section title="News">
        <LatestNews />
      </Section>
    </Page>
  );
}

function Landing() {
  return (
    <div className="glow-bg">
      <Page className="pt-10 sm:pt-20">
        <section className="animate-fade-up mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[12px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-sol-green" /> The front door to the Solana ecosystem
          </span>
          <h1 className="text-gradient text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[64px]">
            Everything Solana.
            <br />
            One place.
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted sm:text-[18px]">Search, discover, use and understand the entire Solana ecosystem.</p>
          <div className="mt-8 w-full">
            <SearchBox autoFocus />
          </div>
          <div className="mt-5">
            <SuggestionChips />
          </div>
          <p className="mt-6 text-[12px] text-faint">
            Press <kbd className="rounded border border-line px-1">⌘K</kbd> anywhere. Paste any address, token or transaction.
          </p>
        </section>

        <section className="mt-16 grid gap-3 sm:mt-24 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Link key={p.title} href={p.href} className="card card-hover animate-fade-up group p-5" style={{ animationDelay: `${i * 30}ms` }}>
              <p.icon size={20} className="text-muted transition-colors group-hover:text-sol-green" strokeWidth={1.7} />
              <div className="mt-4 text-[15px] font-semibold">{p.title}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-muted">{p.body}</div>
            </Link>
          ))}
        </section>

        <div className="mt-10 grid gap-3 lg:grid-cols-2">
          <Trending />
          <LatestNews />
        </div>
        <Section title="Featured apps" action={<Link href="/apps" className="text-[13px] text-muted hover:text-fg">App Store →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {APPS.filter((a) => a.featured).map((a) => (
              <AppCard key={a.slug} app={a} />
            ))}
          </div>
        </Section>
        <section className="mt-16 flex flex-col items-center rounded-3xl border border-line bg-surface/60 px-6 py-12 text-center">
          <Globe size={22} className="text-muted" />
          <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em]">Use Solana. Build on Solana.</h2>
          <p className="mt-2 max-w-lg text-[14px] text-muted">Explore without an account. Connect a wallet only when you want your own portfolio, alerts or transactions.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/ai" className="btn btn-primary">
              <Sparkles size={15} /> Ask Solana AI
            </Link>
            <Link href="/login" className="btn btn-ghost">
              Sign in
            </Link>
          </div>
        </section>
      </Page>
    </div>
  );
}

export default function HomePage() {
  const s = useSession();
  const personalized = Boolean(s.user || s.wallet);
  return <div className={cn(!s.ready && "")}>{personalized ? <PersonalHome /> : <Landing />}</div>;
}
