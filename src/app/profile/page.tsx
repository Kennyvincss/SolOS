"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { AppCard } from "@/components/domain";
import { Address, Badge, Card, Monogram, Page, PageHeader, Section, Toggle } from "@/components/ui";
import { useActions, useStore, type UserState } from "@/lib/client/store";
import { useSession } from "@/lib/client/session";
import { APPS } from "@/lib/catalog/apps";
import { getExtension } from "@/lib/extensions/catalog";

const VIS: { key: keyof UserState["profile"]["visibility"]; label: string }[] = [
  { key: "wallet", label: "Connected wallet" },
  { key: "favorites", label: "Favorite apps" },
  { key: "followed", label: "Followed wallets" },
  { key: "watchlist", label: "Watchlist" },
  { key: "extensions", label: "Installed extensions" },
  { key: "activity", label: "Public on-chain activity" },
];

export default function ProfilePage() {
  const session = useSession();
  const st = useStore((s) => s);
  const { set } = useActions();
  const p = st.profile;
  const handle = p.handle || session.user?.name?.replace(/\s+/g, "").toLowerCase() || "you";
  const setProfile = (patch: Partial<UserState["profile"]>) => set((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  const favorites = APPS.filter((a) => st.favorites.includes(a.slug));

  return (
    <Page>
      <PageHeader title="Profile" subtitle="You control exactly what is public." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <Monogram name={handle} size={64} rounded="full" color="#14f195" src={session.user?.avatar} />
              <div className="min-w-0 flex-1">
                <div className="text-[22px] font-semibold">@{handle}</div>
                <div className="text-[13px] text-muted">Joined {new Date(p.joinedAt || Date.now()).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                {p.visibility.wallet && session.address && session.address !== "demo" && <Address value={session.address} className="mt-1 text-muted" />}
              </div>
            </div>
            {p.bio && <p className="mt-4 text-[14px] text-muted">{p.bio}</p>}
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              <Badge>{st.followed.length} followed wallets</Badge>
              <Badge>{st.watchlist.length} on watchlist</Badge>
              <Badge>{st.installed.length} extensions</Badge>
            </div>
          </Card>
          {p.visibility.favorites && (
            <Section title="Favorite apps" className="mt-0">
              {favorites.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {favorites.map((a) => (
                    <AppCard key={a.slug} app={a} compact />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted">No favorites yet. Tap ♥ on any app.</p>
              )}
            </Section>
          )}
          {p.visibility.extensions && (
            <Section title="Installed extensions">
              <div className="flex flex-wrap gap-2">
                {st.installed.map((i) => {
                  const e = getExtension(i.id);
                  return e ? (
                    <Link key={i.id} href={`/extensions/${i.id}`} className="chip">
                      {e.name}
                    </Link>
                  ) : null;
                })}
              </div>
            </Section>
          )}
          {p.visibility.followed && (
            <Section title="Followed wallets">
              <div className="flex flex-wrap gap-2">
                {st.followed.map((f) => (
                  <Link key={f.address} href={`/wallets/${f.address}`} className="chip">
                    {f.label}
                  </Link>
                ))}
                {!st.followed.length && <p className="text-[13px] text-muted">None.</p>}
              </div>
            </Section>
          )}
          {p.visibility.activity && session.address && (
            <Link href={`/wallets/${session.address}`} className="inline-block text-[13px] text-sol-green">
              View public on-chain activity →
            </Link>
          )}
        </div>
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h3 className="text-[15px] font-semibold">Edit</h3>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">Handle</span>
              <input className="input" value={p.handle} onChange={(e) => setProfile({ handle: e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) })} placeholder={handle} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-muted">Bio</span>
              <textarea className="input h-auto py-2" rows={3} value={p.bio} onChange={(e) => setProfile({ bio: e.target.value.slice(0, 200) })} />
            </label>
          </Card>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Eye size={15} /> What&apos;s public
            </h3>
            <div className="mt-2 divide-y divide-line">
              {VIS.map((v) => (
                <div key={v.key} className="flex items-center justify-between py-2.5 text-[13.5px]">
                  {v.label}
                  <Toggle checked={p.visibility[v.key]} onChange={(on) => setProfile({ visibility: { ...p.visibility, [v.key]: on } })} label={v.label} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-faint">Profiles are private to this device until public profiles launch. These settings decide what will be shared.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}
