import type { Metadata } from "next";
import { HarborHeader } from "@/components/waiting/harbor-header";
import { LatestRuns, RunDecisions } from "@/components/waiting/run-reports";
import { WaitingBoard } from "@/components/waiting/waiting-board";
import { getLatestRunReports } from "@/lib/data/run-reports";
import { getWaiting } from "@/lib/data/waiting";

export const metadata: Metadata = { title: "Waiting on you · Denkore" };

export default async function WaitingPage() {
  const [data, reports] = await Promise.all([getWaiting(), getLatestRunReports()]);
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <HarborHeader now={new Date().toISOString()} data={data} reports={reports} />
      <RunDecisions reports={reports} />
      <WaitingBoard data={data} />
      <LatestRuns reports={reports} />
    </section>
  );
}
