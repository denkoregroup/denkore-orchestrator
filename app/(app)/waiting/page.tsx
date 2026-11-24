import type { Metadata } from "next";
import { LatestRuns, RunDecisions } from "@/components/waiting/run-reports";
import { WaitingBoard } from "@/components/waiting/waiting-board";
import { getHubSummary } from "@/lib/data/hub";

export const metadata: Metadata = { title: "Waiting on you · Denkore" };

export default async function WaitingPage() {
  const { data, reports } = await getHubSummary();
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <RunDecisions reports={reports} />
      <WaitingBoard data={data} />
      <LatestRuns reports={reports} />
    </section>
  );
}
