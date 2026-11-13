import type { Metadata } from "next";
import { ProspectList } from "@/components/prospects/prospect-list";
import { SitesTabs } from "@/components/sites/sites-tabs";
import { PROSPECTS } from "@/lib/site-check/copy";
import { listProspects } from "@/lib/site-health/queries";
import { CheckForm } from "./check-form";

export const metadata: Metadata = { title: "Prospects · Denkore" };

// The quick check runs inside the form's server action, so the page's limit is the action's.
export const maxDuration = 60;

export default async function ProspectsPage() {
  const reports = await listProspects();

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <SitesTabs current="prospects" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{PROSPECTS.heading}</h1>
        <p className="text-muted">{PROSPECTS.intro}</p>
      </div>
      <CheckForm />
      <section aria-labelledby="recent-heading" className="space-y-3">
        <h2 id="recent-heading" className="font-semibold">
          {PROSPECTS.recent}
        </h2>
        <ProspectList reports={reports} />
      </section>
    </section>
  );
}
