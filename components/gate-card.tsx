import { DecisionForm } from "@/components/approvals/decision-form";
import { formatUsd } from "@/lib/format";
import type { GateReview } from "@/lib/approvals/types";

const GATE_LABEL: Record<GateReview["kind"], string> = {
  spec: "Plan review",
  design: "Design review",
  release: "Go-live review",
};

export function GateCard({ gate }: { gate: GateReview }) {
  const { technical, summary } = gate;
  const headingId = `${gate.gateId}-headline`;
  return (
    <article aria-labelledby={headingId} className="space-y-4 rounded-lg border border-border p-4">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          {GATE_LABEL[gate.kind]} · {gate.project}
        </p>
        <h2 id={headingId} className="text-lg font-semibold">
          {summary ? summary.headline : `${GATE_LABEL[gate.kind]} for ${gate.project}`}
        </h2>
      </header>

      {summary ? (
        <>
          <p>{summary.summary}</p>
          {summary.changes.length > 0 && (
            <section aria-label="What changes" className="space-y-1">
              <h3 className="text-sm font-semibold">What changes</h3>
              <ul className="list-disc space-y-1 pl-5">
                {summary.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          )}
          {summary.risks.length > 0 && (
            <section aria-label="Things to know" className="space-y-1">
              <h3 className="text-sm font-semibold">Things to know</h3>
              <ul className="list-disc space-y-1 pl-5">
                {summary.risks.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p role="note" className="rounded-md border border-border p-3">
          No plain-language summary was provided. Check the technical details below before you decide.
        </p>
      )}

      <details className="rounded-md border border-border p-3 text-sm" open={summary === null}>
        <summary className="min-h-12 cursor-pointer content-center font-medium">Technical details</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Commit</dt>
          <dd className="break-all font-mono">{technical.commitSha}</dd>
          {technical.branch && (
            <>
              <dt className="text-muted">Branch</dt>
              <dd className="break-all font-mono">{technical.branch}</dd>
            </>
          )}
          {technical.prUrl && (
            <>
              <dt className="text-muted">Pull request</dt>
              <dd className="break-all">
                <a href={technical.prUrl} className="underline" rel="noreferrer">
                  {technical.prUrl}
                </a>
              </dd>
            </>
          )}
          {technical.filesChanged !== undefined && (
            <>
              <dt className="text-muted">Files changed</dt>
              <dd>{technical.filesChanged}</dd>
            </>
          )}
          <dt className="text-muted">Run cost</dt>
          <dd>{technical.costUsd === null ? "Not reported" : formatUsd(technical.costUsd)}</dd>
          {technical.checks && technical.checks.length > 0 && (
            <>
              <dt className="text-muted">Checks</dt>
              <dd>
                <ul>
                  {technical.checks.map((c) => (
                    <li key={c.name}>
                      {c.name}: {c.status}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
        <p className="mt-2 text-muted">Approval applies to this commit only. A new commit resets the review.</p>
      </details>

      {gate.approval === "pr_review" && (
        <div className="space-y-1 rounded-md border border-accent p-3">
          <p className="font-medium">This one needs a pull request review before you approve.</p>
          {technical.prUrl ? (
            <a href={technical.prUrl} className="flex min-h-12 items-center font-semibold underline" rel="noreferrer">
              Open the pull request
            </a>
          ) : (
            <p className="text-muted">No pull request link was provided. Find it from the commit above.</p>
          )}
        </div>
      )}

      <DecisionForm gateId={gate.gateId} commitSha={technical.commitSha} mode={gate.approval} />
    </article>
  );
}
