import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { listRuns, RUNS_LIMIT } from "@/lib/data/runs";
import { formatUsd } from "@/lib/format";
import { NEEDS_OWNER_STATES, runStateLabel } from "@/lib/runs/labels";

export const metadata: Metadata = { title: "Runs · Denkore" };

export default async function RunsPage() {
  const runs = await listRuns();

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Runs</h1>
        <Link href="/prompt" className="flex min-h-12 items-center rounded-md border border-border px-4 font-medium">
          Start a run
        </Link>
      </div>

      {runs.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-muted">
          No runs yet. Start one from the Prompt page.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {runs.map(({ run, project, costUsd }) => {
              const needsYou = NEEDS_OWNER_STATES.includes(run.state);
              return (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="block min-h-12 space-y-1 rounded-lg border border-border p-4 hover:border-foreground"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{project?.registry_id ?? "Unknown project"}</span>
                      <span className="text-sm text-muted">
                        <LocalTime iso={run.created_at} />
                      </span>
                    </span>
                    <span className={`block ${needsYou ? "font-semibold text-accent" : ""}`}>
                      {runStateLabel(run.state)}
                    </span>
                    <span className="block truncate text-sm text-muted">{run.prompt}</span>
                    <span className="block text-sm text-muted">Cost so far: {formatUsd(costUsd)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {runs.length === RUNS_LIMIT && (
            <p className="text-sm text-muted">Showing the {RUNS_LIMIT} newest runs.</p>
          )}
        </>
      )}
    </section>
  );
}
