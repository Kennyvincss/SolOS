"use client";

import { Suspense } from "react";
import { Overview } from "@/components/overview";
import { LiteHome } from "@/components/lite/home";
import { useMode } from "@/lib/client/mode";

/** Home: STRATA Lite (search-first, the default) or the Pro dashboard. */
export default function HomePage() {
  const mode = useMode();
  return (
    <>
      <div className="lite-only">
        <LiteHome />
      </div>
      <div className="pro-only">
        {mode === "pro" && (
          <Suspense>
            <Overview />
          </Suspense>
        )}
      </div>
    </>
  );
}
