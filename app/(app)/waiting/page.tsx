import type { Metadata } from "next";
import { LatestRuns, RunDecisions } from "@/components/waiting/run-reports";
import { WaitingBoard } from "@/components/waiting/waiting-board";
import { getLatestRunReports } from "@/lib/data/run-reports";
import { getWaiting } from "@/lib/data/waiting";

export const metadata: Metadata = { title: "Waiting on you · Denkore" };

export default async function WaitingPage() {
  const [data, reports] = await Promise.all([getWaiting(), getLatestRunReports()]);
  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Waiting on you</h1>
      <p className="text-muted">
        Open pull requests across your projects, read from GitHub when you open this page, and what your scheduled runs
        reported.
      </p>
      <RunDecisions reports={reports} />
      <WaitingBoard data={data} />
      <LatestRuns reports={reports} />
    </section>
  );
}
