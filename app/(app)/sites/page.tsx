import type { Metadata } from "next";
import { SiteList } from "@/components/sites/site-list";
import { listSites } from "@/lib/site-health/queries";

export const metadata: Metadata = { title: "Sites · Denkore" };

export default async function SitesPage() {
  const { sites, truncated } = await listSites();

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Sites</h1>
      <p className="text-muted">The latest audit of each site you check. Open one to see what to fix and what changed.</p>
      <SiteList sites={sites} truncated={truncated} />
    </section>
  );
}
