import { fail, handle, ok } from "@/lib/api";
import { isAddress } from "@/lib/solana/address";
import { getPortfolio } from "@/lib/services/wallets";
import { walletPnl } from "@/lib/services/pnl";

export const maxDuration = 60;

/** 7d / 30d / all-time trading PnL from the wallet's on-chain swaps. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await params;
    if (!isAddress(address)) return fail("Invalid Solana address");
    const { data: p } = await getPortfolio(address);
    const prices = new Map<string, number>();
    const holdings = new Map<string, number>();
    for (const h of p.holdings) {
      if (h.priceUsd !== undefined) prices.set(h.mint, h.priceUsd);
      holdings.set(h.mint, h.amount);
    }
    return ok(await walletPnl(address, prices, holdings), 120);
  });
}
