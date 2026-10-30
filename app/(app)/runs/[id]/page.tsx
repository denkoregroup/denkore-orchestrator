import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventList } from "@/components/event-list";
import { LocalTime } from "@/components/local-time";
import { getRun } from "@/lib/data/runs";
import { formatUsd } from "@/lib/format";
import { NEEDS_OWNER_STATES, runStateLabel, STEP_LABELS, STEP_STATUS_LABELS } from "@/lib/runs/labels";

export const metadata: Metadata = { title: "Run · Denkore" };

export default async function RunPage(props: PageProps<"/runs/[id]">) {
  const { id } = await props.params;
  const detail = await getRun(id);
  if (!detail) notFound();
  const { run, project, steps, events, costUsd } = detail;
  const needsYou = NEEDS_OWNER_STATES.includes(run.state);

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted">
          <Link href="/runs" className="underline">
            All runs
          </Link>
        </p>
        <h1 className="text-xl font-semibold">{project?.registry_id ?? "Unknown project"}</h1>
        <p className={needsYou ? "font-semibold text-accent" : ""}>{runStateLabel(run.state)}</p>
        {run.state !== "escalated" && needsYou && (
          <p>
            <Link href="/approvals" className="flex min-h-12 items-center underline">
              Review it on the Approvals page
            </Link>
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Started</dt>
          <dd>
            <LocalTime iso={run.created_at} />
          </dd>
          <dt className="text-muted">Cost so far</dt>
          <dd>{formatUsd(costUsd)}</dd>
          <dt className="text-muted">Test retries</dt>
          <dd>
            {run.test_failures} used of {run.max_test_retries}
          </dd>
        </dl>
      </header>

      <section aria-labelledby="prompt-heading" className="space-y-1">
        <h2 id="prompt-heading" className="font-semibold">
          What you asked for
        </h2>
        <p className="whitespace-pre-wrap rounded-lg border border-border p-3">{run.prompt}</p>
      </section>

      <section aria-labelledby="steps-heading" className="space-y-2">
        <h2 id="steps-heading" className="font-semibold">
          Steps
        </h2>
        {steps.length === 0 ? (
          <p className="text-muted">No steps have started yet.</p>
        ) : (
          <ol className="divide-y divide-border rounded-lg border border-border">
            {steps.map((step) => (
              <li key={step.id} className="space-y-1 p-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">
                    {STEP_LABELS[step.step]}
                    {step.attempt > 1 && <span className="text-muted"> · try {step.attempt}</span>}
                  </span>
                  <span className={step.status === "failed" ? "text-accent" : "text-muted"}>
                    {STEP_STATUS_LABELS[step.status]}
                  </span>
                </p>
                <p className="text-sm text-muted">
                  Cost: {step.cost_usd === null ? "not reported" : formatUsd(step.cost_usd)}
                </p>
                {step.pr_url && (
                  <p className="text-sm">
                    <a href={step.pr_url} className="flex min-h-12 items-center underline" rel="noreferrer">
                      Open the pull request
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="events-heading" className="space-y-2">
        <h2 id="events-heading" className="font-semibold">
          History
        </h2>
        {events.length === 0 ? (
          <p className="text-muted">Nothing has been recorded for this run yet.</p>
        ) : (
          <EventList events={events} />
        )}
      </section>
    </article>
  );
}
