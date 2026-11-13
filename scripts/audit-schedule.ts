/**
 * pnpm audit:schedule [--registry <dir>]
 *
 * The daily audit (.github/workflows/audit-schedule.yml): audits every registry entry that has an
 * audits block and posts each report to the app, signed with STEP_WEBHOOK_SECRET.
 *
 *   AUDIT_REPORT_URL      https://<app>/api/audits/report (https, or http for localhost)
 *   STEP_WEBHOOK_SECRET   the same secret the app uses
 *
 * Exit codes: 0 every site audited and stored; 1 some site failed or was unreachable (the others
 * still ran); 2 the job could not start (missing setting, bad address, nothing to audit).
 * Never prints the secret.
 */
import { buildPostRequest, parsePostUrl, postReport } from "../lib/audits/post";
import { runAudit } from "../lib/audits/run";
import { describeOutcome, runScheduledAudits, type ScheduledSite } from "../lib/audits/schedule";
import { loadRegistry } from "../lib/registry/loader";

function registryDir(argv: string[]): string | undefined {
  const at = argv.indexOf("--registry");
  if (at === -1) return undefined;
  const dir = argv[at + 1];
  if (!dir || dir.startsWith("--")) throw new Error("--registry needs a directory");
  return dir;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the environment`);
  return value;
}

async function main() {
  const reportUrl = parsePostUrl(required("AUDIT_REPORT_URL"));
  const secret = required("STEP_WEBHOOK_SECRET");

  const registry = await loadRegistry(registryDir(process.argv.slice(2)));
  const sites: ScheduledSite[] = [];
  for (const entry of registry.values()) {
    if (!entry.audits) {
      console.log(`skipped    ${entry.id}: no audits block`);
      continue;
    }
    sites.push({ registryId: entry.id, url: entry.audits.url, maxPages: entry.audits.maxPages, ignorePaths: entry.audits.ignorePaths });
  }
  if (sites.length === 0) throw new Error("No registry entry has an audits block, so there is nothing to audit");

  const { outcomes, failed } = await runScheduledAudits(sites, {
    audit: (site) => runAudit({ url: site.url, maxPages: site.maxPages, ignorePaths: site.ignorePaths }),
    post: (site, report) => postReport(reportUrl, buildPostRequest({ report, registryId: site.registryId, secret })),
  });
  for (const outcome of outcomes) console.log(describeOutcome(outcome));
  console.log(failed === 0 ? `All ${sites.length} sites audited and stored.` : `${failed} of ${sites.length} sites failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "audit schedule failed");
  process.exit(2);
});
