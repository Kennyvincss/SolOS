"use client";

import { useState } from "react";
import { Page, PageHeader, Section, Tabs } from "@/components/ui";
import { AppCard } from "@/components/domain";
import { APPS } from "@/lib/catalog/apps";

export default function PaymentsPage() {
  const [tab, setTab] = useState<"all" | "Stablecoins" | "Merchants" | "Infrastructure">("all");
  const apps = APPS.filter((a) => a.category === "Payments" || a.subcategories?.includes("Payments")).filter((a) => tab === "all" || a.subcategories?.some((s) => s === tab || (tab === "Merchants" && s === "Checkout") || (tab === "Infrastructure" && (s === "Standard" || s === "Infrastructure"))));
  return (
    <Page wide>
      <PageHeader title="Payments" subtitle="Solana Pay, stablecoins, merchants and payment infrastructure." />
      <Section title="Discover payments" className="mt-0" action={<Tabs value={tab} onChange={setTab} options={[{ value: "all", label: "All" }, { value: "Stablecoins", label: "Stablecoins" }, { value: "Merchants", label: "Merchants" }, { value: "Infrastructure", label: "Infrastructure" }]} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <AppCard key={a.slug} app={a} />
          ))}
        </div>
      </Section>
    </Page>
  );
}
