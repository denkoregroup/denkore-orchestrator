import { EtTime } from "@/components/sites/et-time";
import type { LatestRunReport } from "@/lib/data/run-reports";
import type { RunReport } from "@/lib/run-reports/schema";

const CHECKS_LABEL = { passing: "checks passing", failing: "checks failing", running: "checks running", none: "no checks" } as const;

function pullUrl(repo: string, number: number) {
  return `https://github.com/${repo}/pull/${number}`;
}

function SessionLink({ report }: { report: RunReport }) {
  if (!report.sessionUrl) return <p className="text-sm text-muted">Answer by number in that run&apos;s chat.</p>;
  return (
    <a href={report.sessionUrl} target="_blank" rel="noopener noreferrer" className="inline-block min-h-12 py-3 text-sm font-medium text-accent hover:underline">
      Answer in the run&apos;s session
    </a>
  );
}

function DecisionCard({ report }: { report: RunReport }) {
  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted">
        <span className="font-medium text-foreground">{report.registryId}</span>
        <span>
          Run finished <EtTime iso={report.finishedAt} />
        </span>
      </div>
      <ol className="space-y-2">
        {report.decisions.map((d) => (
          <li key={d.number} className="break-words">
            <span className="font-semibold">{d.number}.</span> {d.question}
            {d.options && d.options.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-2 text-xs" aria-label={`Options for decision ${d.number}`}>
                {d.options.map((o) => (
                  <li key={o} className="rounded border border-border px-1.5 py-0.5">
                    {o}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <SessionLink report={report} />
    </li>
  );
}

function RunCard({ report }: { report: RunReport }) {
  return (
    <li className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted">
        <span className="font-medium text-foreground">{report.registryId}</span>
        <span>
          <EtTime iso={report.finishedAt} /> · {report.mode === "may-start" ? "could start new work" : "finish only"}
        </span>
      </div>
      <p className="break-words">{report.summary}</p>
      {report.pulls.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Pull requests in this run">
          {report.pulls.map((p) => (
            <li key={p.number} className="break-words">
              <a href={pullUrl(report.repo, p.number)} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                #{p.number} {p.title}
              </a>
              <span className="text-muted">
                {" "}
                · {p.what} · {CHECKS_LABEL[p.checks]}
                {p.ready ? " · ready for you" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted" aria-label="Notes from this run">
          {report.notes.map((n) => (
            <li key={n} className="break-words">
              {n}
            </li>
          ))}
        </ul>
      )}
      {report.sessionUrl && (
        <a href={report.sessionUrl} target="_blank" rel="noopener noreferrer" className="inline-block min-h-12 py-3 text-sm font-medium text-accent hover:underline">
          Open the run&apos;s session
        </a>
      )}
    </li>
  );
}

/** The numbered decisions from each project's newest run. Renders nothing when there are none. */
export function RunDecisions({ reports }: { reports: LatestRunReport[] }) {
  const withDecisions = reports.filter((r) => r.report.decisions.length > 0);
  if (withDecisions.length === 0) return null;
  const decisionCount = withDecisions.reduce((n, r) => n + r.report.decisions.length, 0);
  return (
    <section aria-labelledby="waiting-decisions" className="space-y-2">
      <h2 id="waiting-decisions" className="font-semibold">
        Decisions from your runs ({decisionCount})
      </h2>
      <p className="text-sm text-muted">Each run&apos;s newest questions. Answer by number in the run&apos;s session.</p>
      <ul className="space-y-3">
        {withDecisions.map((r) => (
          <DecisionCard key={r.report.registryId} report={r.report} />
        ))}
      </ul>
    </section>
  );
}

/** What each project's newest run did, from the last week. Works in Server and Client Components. */
export function LatestRuns({ reports }: { reports: LatestRunReport[] }) {
  return (
    <section aria-labelledby="waiting-runs" className="space-y-2">
      <h2 id="waiting-runs" className="font-semibold">
        Latest runs ({reports.length})
      </h2>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-muted">No run has reported in the last week.</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <RunCard key={r.report.registryId} report={r.report} />
          ))}
        </ul>
      )}
    </section>
  );
}
