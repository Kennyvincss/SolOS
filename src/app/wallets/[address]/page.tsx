"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BellRing, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { Address, Card, ErrorState, Page, PageHeader, Skeleton, share, Badge } from "@/components/ui";
import { PortfolioView } from "@/components/portfolio";
import { AlertModal, FollowButton } from "@/components/wallet-tools";
import { RiskList } from "@/components/domain";
import { useApi } from "@/lib/client/fetch";
import { useSession } from "@/lib/client/session";
import { useStore } from "@/lib/client/store";
import type { RiskReport } from "@/lib/types";
import { shortAddr } from "@/lib/format";
import { BookmarkButton } from "@/components/library";

type AccountType = { type: "wallet" | "mint" | "program" | "other" | "missing"; name?: string; ownerName?: string; owner?: string; demo?: boolean };

export default function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const router = useRouter();
  const s = useSession();
  const [alertOpen, setAlertOpen] = useState(false);
  const acct = useApi<AccountType>(`/api/account/${address}`);
  const label = useStore((st) => st.followed.find((f) => f.address === address)?.label);
  const type = acct.data?.type;
  const risk = useApi<RiskReport>(type === "program" ? `/api/security?q=${address}` : null);

  useEffect(() => {
    if (type === "mint") router.replace(`/tokens/${address}`);
  }, [type, address, router]);

  const isMine = s.address === address;
  const demo = address === "demo";

  return (
    <Page>
      <PageHeader
        eyebrow={type === "program" ? "Program" : demo ? "Demo wallet" : "Wallet"}
        title={
          <span className="flex items-center gap-3">
            {label ?? (demo ? "Demo wallet" : shortAddr(address, 6))}
            {isMine && <Badge tone="green">You</Badge>}
          </span>
        }
        subtitle={!demo && <Address value={address} chars={10} />}
        actions={
          !demo && type !== "program" ? (
            <>
              <FollowButton address={address} />
              <button onClick={() => setAlertOpen(true)} className="btn btn-ghost btn-sm">
                <BellRing size={14} /> Set alert
              </button>
              <BookmarkButton title={`Wallet ${shortAddr(address)}`} />
              <button onClick={() => share(`Wallet ${shortAddr(address)}`)} className="btn btn-ghost btn-sm" aria-label="Share">
                <Share2 size={14} />
              </button>
              <Link href={`/ai?q=${encodeURIComponent(`Analyze wallet ${address}`)}`} className="btn btn-ghost btn-sm">
                <Sparkles size={14} /> Analyze
              </Link>
              <Link href={`/security?q=${address}`} className="btn btn-ghost btn-sm" aria-label="Security check">
                <ShieldCheck size={14} />
              </Link>
            </>
          ) : null
        }
      />
      {acct.loading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {acct.error && <ErrorState message={acct.error} onRetry={acct.reload} />}
      {type === "missing" && (
        <Card className="mb-4 p-4 text-[13px] text-muted">
          This address holds no SOL right now, so it has no account of its own on Solana. Its tokens, activity and trading history are still shown below.
        </Card>
      )}
      {type === "program" && (
        <Card className="p-5">
          <div className="mb-3 text-[15px] font-medium">{acct.data?.name ?? "Unrecognized program"}</div>
          {risk.loading ? <Skeleton className="h-32 w-full" /> : risk.data ? <RiskList report={risk.data} /> : risk.error ? <p className="text-[13px] text-muted">{risk.error}</p> : null}
        </Card>
      )}
      {type === "other" && (
        <Card className="mb-4 p-4 text-[13px] text-muted">
          This account is owned by {acct.data?.ownerName ?? shortAddr(acct.data?.owner)} rather than being a regular wallet (for example a token account or protocol account). Balances below are what it holds directly.
        </Card>
      )}
      {(type === "wallet" || type === "other" || type === "missing") && <PortfolioView address={address} own={isMine} />}
      <AlertModal address={address} open={alertOpen} onClose={() => setAlertOpen(false)} />
    </Page>
  );
}
