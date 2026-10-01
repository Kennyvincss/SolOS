"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/lib/client/session";

// The wallet dialog loads the first time it's opened.
const WalletModalDialog = dynamic(() => import("./wallet-modal").then((m) => m.WalletModal), { ssr: false });

export function WalletModal() {
  const open = useSession().walletModal;
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (open) setUsed(true);
  }, [open]);
  return used || open ? <WalletModalDialog /> : null;
}
