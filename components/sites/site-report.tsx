import Link from "next/link";
import { EtTime } from "@/components/sites/et-time";
import { countBySeverity, type Finding } from "@/lib/audits/types";
import { diffReports } from "@/lib/site-health/diff";
import { pagesLabel, SEVERITY_GROUPS, siteName, summaryLine } from "@/lib/site-health/labels";
import { groupByPage } from "@/lib/site-health/pages";
import type { StoredReport } from "@/lib/site-health/queries";

/** Findings under their page: the address once, as a small heading, then one short line per finding. */
function PageGroups({ items, host }: { items: Finding[]; host: string }) {
  return (
    <div className="space-y-3">
      {groupByPage(items, host).map((group) => (
        <div key={group.url} className="print:break-inside-avoid">
          <h3 className="break-all text-sm font-medium">
            {group.href ? (
              <a href={group.href} target="_blank" rel="noopener noreferrer" className="underline">
                {group.path}
              </a>
            ) : (
              group.path
            )}
          </h3>
          <ul className="mt-1 space-y-1 text-sm">
            {group.findings.map((f) => (
              <li key={f.id}>{f.message}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The status line is for the owner, so it never prints: a client PDF must not say "First report for
 * this site" or "No changes since". The New and Fixed lists under it are findings and do print.
 */
function Changes({ current, previous, host }: { current: StoredReport; previous: StoredReport | null; host: string }) {
  if (!previous) {
    return <p className="text-sm text-muted print:hidden">First report for this site, so there is nothing to compare it with yet.</p>;
  }
  const { newFindings, stillOpen, fixed } = diffReports(previous.report, current.report);
  if (newFindings.length === 0 && fixed.length === 0) {
    return (
      <p className="text-sm text-muted print:hidden">
        No changes since <EtTime iso={previous.startedAt} /> · {stillOpen.length} still open.
      </p>
    );
  }
  return (
    <>
      <p className="text-sm text-muted print:hidden">
        Since <EtTime iso={previous.startedAt} />: {newFindings.length} new · {fixed.length} fixed · {stillOpen.length} still open.
      </p>
      {newFindings.length > 0 && (
        <section aria-labelledby="new-heading" className="space-y-2">
          <h2 id="new-heading" className="font-semibold">
            New ({newFindings.length})
          </h2>
          <PageGroups items={newFindings} host={host} />
        </section>
      )}
      {fixed.length > 0 && (
        <section aria-labelledby="fixed-heading" className="space-y-2">
          <h2 id="fixed-heading" className="font-semibold">
            Fixed ({fixed.length})
          </h2>
          <PageGroups items={fixed} host={host} />
        </section>
      )}
    </>
  );
}

/** One stored report: a summary, what changed since the one before, then every finding by severity and page. */
export function SiteReport({ current, previous }: { current: StoredReport; previous: StoredReport | null }) {
  const { findings, target } = current.report;
  const host = new URL(target).host;
  const counts = countBySeverity(findings);

  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-muted print:hidden">
          <Link href="/sites" className="underline">
            All sites
          </Link>
        </p>
        <p className="text-sm print:hidden">
          <Link href={`/check/${current.id}`} className="underline">
            Site check view
          </Link>
        </p>
        {/* The one link to the site itself; the page headings below link to individual pages. */}
        <h1 className="break-all text-xl font-semibold">
          <a href={target} target="_blank" rel="noopener noreferrer" className="underline">
            {siteName(target)}
          </a>
        </h1>
        <p className="font-medium">{summaryLine(counts)}</p>
        <p className="text-sm text-muted">
          Checked <EtTime iso={current.startedAt} /> · {pagesLabel(current.pagesChecked)} looked at
        </p>
      </header>

      <Changes current={current} previous={previous} host={host} />

      {SEVERITY_GROUPS.map(({ severity, label }) => {
        const items = findings.filter((f) => f.severity === severity);
        if (items.length === 0) return null;
        if (severity === "info") {
          // Native disclosure: closed until opened, everything still in the page, no client JS.
          return (
            <details key={severity} className="rounded-lg border border-border print:border-0">
              <summary className="flex min-h-12 cursor-pointer items-center px-3 font-semibold print:min-h-0 print:px-0">
                {label} ({items.length})
              </summary>
              <div className="px-3 pb-3 pt-1 print:px-0">
                <PageGroups items={items} host={host} />
              </div>
            </details>
          );
        }
        return (
          <section key={severity} aria-labelledby={`${severity}-heading`} className="space-y-2">
            <h2 id={`${severity}-heading`} className={`font-semibold ${severity === "fail" ? "text-accent" : ""}`}>
              {label} ({items.length})
            </h2>
            <PageGroups items={items} host={host} />
          </section>
        );
      })}
    </article>
  );
}
