import Link from "next/link";
import { EtTime } from "@/components/sites/et-time";
import { pagesLabel, SEVERITY_GROUPS, siteName } from "@/lib/site-health/labels";
import type { SiteSummary, UnreportedSite } from "@/lib/site-health/queries";

/** Works in Server and Client Components (no server-only imports at runtime). */
function OverdueBadge() {
  return <span className="rounded border border-accent px-1.5 py-0.5 text-xs font-semibold text-accent">Overdue</span>;
}

export function SiteList({ sites, unreported = [], truncated }: { sites: SiteSummary[]; unreported?: UnreportedSite[]; truncated: boolean }) {
  if (sites.length === 0 && unreported.length === 0) {
    return (
      <p className="rounded-lg border border-border p-4 text-muted">
        No site reports yet. A site appears here once an audit of it has been sent to the app.
      </p>
    );
  }
  return (
    <>
      <ul className="space-y-3">
        {sites.map((site) => (
          <li key={site.id}>
            <Link
              href={`/sites/${site.id}`}
              className="block min-h-12 space-y-2 rounded-lg border border-border p-4 hover:border-foreground"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{siteName(site.target)}</span>
                  {site.overdue && <OverdueBadge />}
                </span>
                <span className="text-sm text-muted">
                  <EtTime iso={site.startedAt} /> · {pagesLabel(site.pagesChecked)}
                </span>
              </span>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                {SEVERITY_GROUPS.map(({ severity, label }) => (
                  <div key={severity}>
                    <dt className="text-muted">{label}</dt>
                    <dd className={severity === "fail" && site.counts.fail > 0 ? "font-semibold text-accent" : "font-medium"}>
                      {site.counts[severity]}
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          </li>
        ))}
        {unreported.map((site) => (
          <li key={site.registryId} className="space-y-1 rounded-lg border border-border p-4">
            <span className="flex flex-wrap items-center gap-2">
              <span className="break-all font-medium">{site.registryId}</span>
              {site.overdue && <OverdueBadge />}
            </span>
            <span className="block text-sm text-muted">No report yet.</span>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="text-sm text-muted">Showing sites from the newest reports only. A site with no recent report may be missing.</p>
      )}
    </>
  );
}
