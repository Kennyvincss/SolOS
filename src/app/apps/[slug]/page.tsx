import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { APPS, getApp } from "@/lib/catalog/apps";
import { AppDetail } from "./view";

export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const app = getApp((await params).slug);
  return app ? { title: app.name, description: app.tagline } : {};
}

export default async function AppPage({ params }: { params: Promise<{ slug: string }> }) {
  const app = getApp((await params).slug);
  if (!app) notFound();
  return <AppDetail slug={app.slug} />;
}
