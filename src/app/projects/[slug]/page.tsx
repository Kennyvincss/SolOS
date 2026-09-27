import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { APPS, getApp } from "@/lib/catalog/apps";
import { ProjectView } from "./view";

export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const app = getApp((await params).slug);
  return app ? { title: `${app.name} project`, description: app.description } : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const app = getApp((await params).slug);
  if (!app) notFound();
  return <ProjectView slug={app.slug} />;
}
