"use client";

import { PieChart, Wallet } from "lucide-react";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui";
import { PortfolioView } from "@/components/portfolio";
import { useSession } from "@/lib/client/session";
import { shortAddr } from "@/lib/format";

export default function PortfolioPage() {
  const s = useSession();
  return (
    <Page>
      <PageHeader
        title="Portfolio"
        subtitle={s.address ? (s.wallet ? `${s.wallet.name} · ${shortAddr(s.address, 6)}` : s.address === "demo" ? "Demo wallet (sample data)" : `Watching ${shortAddr(s.address, 6)} (read-only)`) : "Your assets, allocation, positions and activity."}
        actions={
          s.address && (
            <button onClick={() => s.setWalletModal(true)} className="btn btn-ghost btn-sm">
              <Wallet size={14} /> {s.wallet ? "Wallet" : "Change"}
            </button>
          )
        }
      />
      {s.address ? (
        <PortfolioView address={s.address} own />
      ) : (
        <Card>
          <EmptyState
            icon={<PieChart size={20} />}
            title="Connect a wallet to see your portfolio"
            body="STRATA reads your public balances. It never asks for your seed phrase. You can also watch any public address or try the demo wallet."
            action={
              <button onClick={() => s.setWalletModal(true)} className="btn btn-primary">
                <Wallet size={15} /> Connect wallet
              </button>
            }
          />
        </Card>
      )}
    </Page>
  );
}
