"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Shown in the system browser after Google sign-in started from the desktop app. */
function Handoff() {
  const token = useSearchParams().get("token") ?? "";
  const link = `solanaos-desktop://auth?token=${encodeURIComponent(token)}`;
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!token) return;
    window.location.href = link;
    setOpened(true);
  }, [token, link]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[24px] font-semibold">{token ? "Signed in with Google" : "Sign-in link missing"}</h1>
      <p className="text-[14px] text-muted">
        {token ? "Return to the Solana OS app to continue. If your browser asks, allow it to open Solana OS." : "Start again from the Solana OS app."}
      </p>
      {token && (
        <a href={link} className="btn btn-primary">
          {opened ? "Open Solana OS again" : "Open Solana OS"}
        </a>
      )}
      <p className="text-[12px] text-faint">You can close this tab afterwards. The link expires in 2 minutes.</p>
    </div>
  );
}

export default function DesktopHandoffPage() {
  return (
    <Suspense>
      <Handoff />
    </Suspense>
  );
}
