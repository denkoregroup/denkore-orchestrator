import type { GateReview } from "@/lib/approvals/types";

const GATE_LABEL: Record<GateReview["kind"], string> = {
  spec: "Plan review",
  design: "Design review",
  release: "Go-live review",
};

export function GateCard({ gate }: { gate: GateReview }) {
  const { technical } = gate;
  return (
    <article
      aria-labelledby={`${gate.id}-headline`}
      className="space-y-4 rounded-lg border border-border p-4"
    >
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          {GATE_LABEL[gate.kind]} · {gate.project}
        </p>
        <h2 id={`${gate.id}-headline`} className="text-lg font-semibold">
          {gate.headline}
        </h2>
      </header>

      <p>{gate.summary}</p>

      <section aria-label="What changes" className="space-y-1">
        <h3 className="text-sm font-semibold">What changes</h3>
        <ul className="list-disc space-y-1 pl-5">
          {gate.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      {gate.risks.length > 0 && (
        <section aria-label="Things to know" className="space-y-1">
          <h3 className="text-sm font-semibold">Things to know</h3>
          <ul className="list-disc space-y-1 pl-5">
            {gate.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="min-h-10 cursor-pointer content-center font-medium">
          Technical details
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Commit</dt>
          <dd className="truncate font-mono">{technical.commitSha}</dd>
          <dt className="text-muted">Branch</dt>
          <dd className="truncate font-mono">{technical.branch}</dd>
          {technical.prUrl && (
            <>
              <dt className="text-muted">Pull request</dt>
              <dd className="truncate">
                <a href={technical.prUrl} className="underline">
                  {technical.prUrl}
                </a>
              </dd>
            </>
          )}
          <dt className="text-muted">Files changed</dt>
          <dd>{technical.filesChanged}</dd>
          <dt className="text-muted">Run cost</dt>
          <dd>${technical.costUsd.toFixed(2)}</dd>
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
        </dl>
        <p className="mt-2 text-muted">
          Approval applies to this commit only. A new commit resets the review.
        </p>
      </details>

      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Not wired up yet; approvals will be written by the signed-in owner via RLS. */}
        <button
          type="button"
          disabled
          className="min-h-12 flex-1 rounded-md bg-foreground font-medium text-background disabled:opacity-60"
        >
          {gate.approval === "one_tap" ? "Approve" : "Approve after PR review"}
        </button>
        <button
          type="button"
          disabled
          className="min-h-12 flex-1 rounded-md border border-border font-medium disabled:opacity-60"
        >
          Request changes
        </button>
      </div>
    </article>
  );
}
