import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import type { Finding } from "@/lib/audits/types";
import { diffReports } from "@/lib/site-health/diff";
import { pagesLabel, SEVERITY_GROUPS, siteName } from "@/lib/site-health/labels";
import type { StoredReport } from "@/lib/site-health/queries";

function FindingList({ items }: { items: Finding[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((f) => (
        <li key={f.id} className="space-y-1 p-3">
          <p>{f.message}</p>
          {/* Plain text, not a link: the address comes from a posted report. */}
          <p className="break-all text-sm text-muted">{f.url}</p>
        </li>
      ))}
    </ul>
  );
}

function Changes({ current, previous }: { current: StoredReport; previous: StoredReport | null }) {
  if (!previous) {
    return <p className="text-muted">This is the first report for this site, so there is nothing to compare it with yet.</p>;
  }
  const { newFindings, stillOpen, fixed } = diffReports(previous.report, current.report);
  return (
    <div className="space-y-4">
      <p className="text-muted">
        Compared with the report from <LocalTime iso={previous.startedAt} />: {newFindings.length} new, {fixed.length} fixed,{" "}
        {stillOpen.length} still open.
      </p>
      {newFindings.length === 0 && fixed.length === 0 && <p>Nothing has changed.</p>}
      {newFindings.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">New since then ({newFindings.length})</h3>
          <FindingList items={newFindings} />
        </div>
      )}
      {fixed.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Fixed since then ({fixed.length})</h3>
          <FindingList items={fixed} />
        </div>
      )}
    </div>
  );
}

/** One stored report: what changed since the one before, then every finding by severity. */
export function SiteReport({ current, previous }: { current: StoredReport; previous: StoredReport | null }) {
  const { findings } = current.report;
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted">
          <Link href="/sites" className="underline">
            All sites
          </Link>
        </p>
        <h1 className="break-all text-xl font-semibold">{siteName(current.target)}</h1>
        <p className="text-sm text-muted">
          Checked <LocalTime iso={current.startedAt} /> · {pagesLabel(current.pagesChecked)} looked at
        </p>
      </header>

      <section aria-labelledby="changes-heading" className="space-y-2">
        <h2 id="changes-heading" className="font-semibold">
          What changed
        </h2>
        <Changes current={current} previous={previous} />
      </section>

      {findings.length === 0 ? (
        <p className="rounded-lg border border-border p-4">No problems found.</p>
      ) : (
        SEVERITY_GROUPS.map(({ severity, label }) => {
          const items = findings.filter((f) => f.severity === severity);
          if (items.length === 0) return null;
          return (
            <section key={severity} aria-labelledby={`${severity}-heading`} className="space-y-2">
              <h2 id={`${severity}-heading`} className={`font-semibold ${severity === "fail" ? "text-accent" : ""}`}>
                {label} ({items.length})
              </h2>
              <FindingList items={items} />
            </section>
          );
        })
      )}
    </article>
  );
}
