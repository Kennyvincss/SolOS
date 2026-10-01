"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Code2, KeyRound, LayoutDashboard, Package, Plus, Send, UserRound } from "lucide-react";
import { Card, cn } from "./ui";
import { useSession } from "@/lib/client/session";

export interface DevProject {
  id: string;
  kind: "extension" | "mini-app" | "agent" | "wallet-tool" | "widget";
  name: string;
  description: string;
  category: string;
  version: string;
  permissions: string[];
  matches: string[];
  instructions?: string;
  homepage?: string;
  status: "draft" | "in-review" | "changes-requested" | "published";
  createdAt: number;
  updatedAt: number;
}
export interface DevSubmission {
  id: string;
  projectId: string;
  name: string;
  kind: DevProject["kind"];
  version: string;
  notes: string;
  sourceUrl?: string;
  storeId?: string;
  status: "in-review" | "changes-requested" | "published";
  at: number;
}
export interface DevRecord {
  profile: { name: string; handle: string; bio: string; website: string; github: string; x: string };
  projects: DevProject[];
  submissions: DevSubmission[];
  keys: { id: string; name: string; prefix: string; createdAt: number }[];
}

export const KIND_LABEL: Record<DevProject["kind"], string> = { extension: "Extension", "wallet-tool": "Wallet tool", "mini-app": "Mini app", agent: "AI agent", widget: "Data widget" };
export const STATUS_LABEL: Record<string, string> = { draft: "Draft", "in-review": "In review", "changes-requested": "Changes requested", published: "Published" };

/** The signed-in developer's data, with helpers to change it. */
export function useDeveloper() {
  const [data, setData] = useState<DevRecord | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const reload = useCallback(async () => {
    const res = await fetch("/api/developer", { cache: "no-store" }).catch(() => null);
    if (!res) return setError({ status: 0, message: "Couldn't load right now." });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      return setError({ status: res.status, message: b.error ?? "Couldn't load right now." });
    }
    setError(null);
    setData(await res.json());
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const call = useCallback(
    async <T,>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
      const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
      if (!res) return { ok: false, error: "Couldn't reach STRATA. Try again." };
      const json = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) return { ok: false, error: json.error ?? "Something went wrong." };
      reload();
      return { ok: true, data: json };
    },
    [reload],
  );
  return { data, error, reload, call };
}

/**
 * Sign-in / availability gate for developer pages. With a wallet connected,
 * there's no separate sign-in: the wallet is asked once to confirm it's yours
 * (a signature, no transaction) and STRATA remembers it for 30 days.
 */
export function DevGate({ error, children }: { error: { status: number; message: string } | null; children: React.ReactNode }) {
  const s = useSession();
  const [state, setState] = useState<"idle" | "signing" | "declined">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const tried = useRef(false);
  const wallet = s.wallet && !s.wallet.readOnly ? s.wallet : null;
  const needsSignIn = error?.status === 401;

  const confirm = useCallback(async () => {
    setState("signing");
    setProblem(null);
    try {
      await s.signInWithWallet();
      window.location.reload();
    } catch (e) {
      setState("declined");
      const m = e instanceof Error ? e.message : "";
      setProblem(/reject|denied|cancel/i.test(m) ? null : m || "Couldn't confirm with your wallet.");
    }
  }, [s]);

  // A connected wallet signs in by itself, once per visit.
  useEffect(() => {
    if (!needsSignIn || !wallet || tried.current) return;
    tried.current = true;
    confirm();
  }, [needsSignIn, wallet, confirm]);

  if (!error) return <>{children}</>;
  return (
    <Card className="p-8 text-center">
      <Code2 size={26} className="mx-auto text-sol-green" />
      {error.status !== 401 ? (
        <>
          <h2 className="mt-3 text-[18px] font-semibold">Developer dashboard unavailable</h2>
          <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">{error.message}</p>
        </>
      ) : wallet ? (
        <>
          <h2 className="mt-3 text-[18px] font-semibold">{state === "signing" ? `Confirm in ${wallet.name}` : `Continue as ${shortAddress(wallet.address)}`}</h2>
          <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">
            Your projects, API keys and submissions belong to your wallet. {wallet.name} asks you once to confirm it&apos;s yours (a signature — no transaction, no fees); STRATA remembers it for 30 days.
          </p>
          {problem && <p className="mx-auto mt-2 max-w-md text-[12.5px] text-down">{problem}</p>}
          <button onClick={confirm} disabled={state === "signing"} className="btn btn-primary mt-4">
            {state === "signing" ? "Waiting for your wallet…" : `Continue with ${wallet.name}`}
          </button>
        </>
      ) : (
        <>
          <h2 className="mt-3 text-[18px] font-semibold">Connect your wallet to start building</h2>
          <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">Your projects, API keys and submissions belong to your wallet or STRATA account.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => s.setWalletModal(true)} className="btn btn-primary">
              Connect wallet
            </button>
            <Link href="/login" className="btn btn-ghost">
              Other sign-in options
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const NAV = [
  { href: "/developers", label: "Overview", icon: LayoutDashboard },
  { href: "/developers/extensions", label: "My projects", icon: Package },
  { href: "/developers/new", label: "Create", icon: Plus },
  { href: "/developers/keys", label: "API keys", icon: KeyRound },
  { href: "/developers/docs", label: "Documentation", icon: BookOpen },
  { href: "/developers/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/developers/submissions", label: "Submissions", icon: Send },
  { href: "/developers/profile", label: "Developer profile", icon: UserRound },
];

export function DevNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto lg:mx-0 lg:flex-col lg:gap-0.5">
      {NAV.map((n) => {
        const active = n.href === "/developers" ? path === n.href : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition-colors", active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface hover:text-fg")}>
            <n.icon size={15} className={active ? "text-sol-green" : "text-faint"} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The STRATA desktop app's developer tools (load/reload unpacked extensions), if running in it. */
type DevBridge = { dev: (action: string, arg?: unknown) => Promise<unknown> };
export function desktopDev(): DevBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { solanaOSDesktop?: Partial<DevBridge> }).solanaOSDesktop;
  return b && typeof b.dev === "function" ? (b as DevBridge) : null;
}
