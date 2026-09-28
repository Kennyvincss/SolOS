import type { Metadata } from "next";
import { DevNav } from "@/components/developer";
import { Page } from "@/components/ui";

export const metadata: Metadata = { title: "Developers" };

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return (
    <Page wide>
      <div className="mb-6">
        <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-faint">STRATA Developers</div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em]">Build for the onchain browser</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">Extensions, mini apps, AI agents, wallet tools and data widgets for STRATA — test them in the browser and publish to the STRATA Store.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <DevNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </Page>
  );
}
