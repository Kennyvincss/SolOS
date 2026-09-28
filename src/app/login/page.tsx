"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Wallet } from "lucide-react";
import { Card, ErrorState, InfoNote } from "@/components/ui";
import { LogoMark } from "@/components/shell/logo";
import { apiPost } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";

function Login() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useSession();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(params.get("error"));
  const caps = s.capabilities?.auth;

  if (s.user) {
    return (
      <Card className="p-6 text-center">
        <div className="text-[15px]">Signed in as {s.user.name}</div>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/" className="btn btn-primary">
            Go home
          </Link>
          <button onClick={() => s.signOut()} className="btn btn-ghost">
            Sign out
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-7">
      <div className="space-y-2.5">
        <button
          className="btn btn-ghost h-11 w-full"
          disabled={caps ? !caps.google : false}
          onClick={() => {
            window.location.href = "/api/auth/google";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
        <button
          className="btn btn-ghost h-11 w-full"
          disabled={busy === "wallet"}
          onClick={async () => {
            setErr(null);
            if (!s.wallet) return s.setWalletModal(true);
            setBusy("wallet");
            try {
              await s.signInWithWallet();
              router.push("/");
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "wallet" ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
          {s.wallet ? `Sign in with ${s.wallet.name}` : "Continue with wallet"}
        </button>
      </div>
      <div className="my-5 flex items-center gap-3 text-[12px] text-faint">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setMsg(null);
          setBusy("email");
          try {
            const r = await apiPost<{ sent: boolean; devLink?: string }>("/api/auth/email", { email });
            if (r.sent) setMsg(`We sent a sign-in link to ${email}. It expires in 15 minutes.`);
            if (r.devLink) setDevLink(r.devLink);
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(null);
          }
        }}
        className="space-y-2.5"
      >
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input h-11" placeholder="you@example.com" autoComplete="email" aria-label="Email" />
        <button className="btn btn-primary h-11 w-full" disabled={busy === "email" || (caps ? !caps.email : false)}>
          {busy === "email" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Continue with email
        </button>
      </form>
      {msg && <p className="mt-3 text-[13px] text-up">{msg}</p>}
      {devLink && (
        <InfoNote className="mt-3">
          Development mode (no email provider configured): <a href={devLink} className="underline">open your sign-in link</a>.
        </InfoNote>
      )}
      {err && <div className="mt-3"><ErrorState message={err} /></div>}
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="glow-bg flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 py-10 md:min-h-dvh">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={40} />
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">Sign in to STRATA</h1>
          <p className="mt-1 text-[13.5px] text-muted">Keep your watchlist, follows and extensions with your account. Browsing never requires signing in.</p>
        </div>
        <Suspense>
          <Login />
        </Suspense>
        <p className="mt-4 text-center text-[12px] text-faint">
          <Link href="/" className="hover:text-fg">
            Continue without an account →
          </Link>
        </p>
      </div>
    </div>
  );
}
