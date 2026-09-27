"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Badge, Card, Page, PageHeader, Section, Segmented, Toggle } from "@/components/ui";
import { useActions, useStore, type NotificationCategory, DEFAULT_STATE } from "@/lib/client/store";
import { useSession } from "@/lib/client/session";
import { useApi } from "@/lib/client/fetch";
import { shortAddr } from "@/lib/format";

const NOTIF: { key: NotificationCategory; label: string; hint: string }[] = [
  { key: "wallet", label: "Wallet activity", hint: "Followed wallets and large transactions" },
  { key: "price", label: "Token price movements", hint: "Your price alerts" },
  { key: "portfolio", label: "Portfolio changes", hint: "Big moves in your holdings" },
  { key: "security", label: "Security warnings", hint: "Risky approvals and suspicious tokens" },
  { key: "app", label: "New projects & app launches", hint: "From apps and projects you follow" },
  { key: "news", label: "News", hint: "Major Solana headlines" },
  { key: "extension", label: "Extension updates", hint: "Alerts sent by installed extensions" },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="text-[14px]">{label}</div>
        {hint && <div className="text-[12.5px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const theme = useStore((s) => s.theme);
  const prefs = useStore((s) => s.notifPrefs);
  const { set } = useActions();
  const session = useSession();
  const status = useApi<{ dataMode: string; ai: string; auth: Record<string, boolean>; customRpc: boolean }>("/api/status");

  return (
    <Page>
      <PageHeader title="Settings" />
      <Section title="Account" className="mt-0">
        <Card className="divide-y divide-line px-5">
          <Row label={session.user ? session.user.name : "Not signed in"} hint={session.user ? `Signed in with ${session.user.provider}${session.user.email ? ` · ${session.user.email}` : ""}${session.user.wallet ? ` · ${shortAddr(session.user.wallet)}` : ""}` : "Sign in to keep your settings tied to your account."}>
            {session.user ? (
              <button onClick={() => session.signOut()} className="btn btn-ghost btn-sm">
                <LogOut size={14} /> Sign out
              </button>
            ) : (
              <Link href="/login" className="btn btn-primary btn-sm">
                Sign in
              </Link>
            )}
          </Row>
          <Row label="Wallet" hint={session.wallet ? `${session.wallet.name} · ${shortAddr(session.wallet.address)}` : session.address ? `Watching ${shortAddr(session.address)}` : "No wallet connected"}>
            <button onClick={() => session.setWalletModal(true)} className="btn btn-ghost btn-sm">
              Manage
            </button>
          </Row>
          {session.address && !session.wallet && (
            <Row label="Stop watching" hint="Remove the read-only address">
              <button onClick={() => session.watch(null)} className="btn btn-ghost btn-sm">
                Remove
              </button>
            </Row>
          )}
        </Card>
      </Section>

      <Section title="Appearance">
        <Card className="px-5">
          <Row label="Theme" hint="Dark is the default">
            <Segmented value={theme} onChange={(t) => set((s) => ({ ...s, theme: t }))} options={["dark", "light", "system"]} />
          </Row>
        </Card>
      </Section>

      <Section title="Notifications" id="notifications">
        <Card className="divide-y divide-line px-5">
          {NOTIF.map((n) => (
            <Row key={n.key} label={n.label} hint={n.hint}>
              <Toggle checked={prefs[n.key]} onChange={(v) => set((s) => ({ ...s, notifPrefs: { ...s.notifPrefs, [n.key]: v } }))} label={n.label} />
            </Row>
          ))}
        </Card>
        <p className="mt-2 text-[12px] text-faint">Alerts are evaluated while Solana OS is open in a tab. Push delivery when closed requires a server-side webhook provider.</p>
      </Section>

      <Section title="Privacy">
        <Card className="px-5">
          <Row label="Public profile" hint="Choose what others can see on your profile">
            <Link href="/profile" className="btn btn-ghost btn-sm">
              Edit profile
            </Link>
          </Row>
        </Card>
      </Section>

      <Section title="Data sources">
        <Card className="divide-y divide-line px-5">
          <Row label="Data mode" hint="auto = live providers with labelled demo fallback">
            <Badge tone={status.data?.dataMode === "demo" ? "warn" : "green"}>{status.data?.dataMode ?? "…"}</Badge>
          </Row>
          <Row label="Solana RPC" hint="Set SOLANA_RPC_URL to use Helius, Triton or your own node">
            <Badge>{status.data?.customRpc ? "Custom" : "Public endpoint"}</Badge>
          </Row>
          <Row label="Solana AI" hint="Powered by Groq. Set GROQ_API_KEY to enable">
            <Badge tone={status.data?.ai === "offline" ? "neutral" : "green"}>{status.data?.ai === "groq" ? "Groq" : "Offline mode"}</Badge>
          </Row>
          <Row label="Market data" hint="Jupiter (tokens, prices), GeckoTerminal (charts), DefiLlama (TVL, yields)">
            <Badge>Public APIs</Badge>
          </Row>
        </Card>
      </Section>

      <Section title="Local data">
        <Card className="px-5">
          <Row label="Reset Solana OS on this device" hint="Clears watchlist, follows, alerts, extensions and notifications">
            <button
              onClick={() => {
                if (confirm("Reset all Solana OS data on this device?")) set(() => ({ ...DEFAULT_STATE, profile: { ...DEFAULT_STATE.profile, joinedAt: Date.now() } }));
              }}
              className="btn btn-ghost btn-sm text-down"
            >
              Reset
            </button>
          </Row>
        </Card>
      </Section>
    </Page>
  );
}
