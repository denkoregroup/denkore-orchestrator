/** @jest-environment node */
import { auditReport, DENKORE_TARGET, denkoreFindings } from "@/test-utils/site-reports";
import { findingsForRun, planFixes, type FixContext } from "../plan";

const RUN = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const ready: FixContext = { projectId: "11111111-1111-4111-8111-111111111111", repo: "denkoregroup/denkore", isLatest: true, openRun: null };
const report = auditReport(denkoreFindings(), { target: DENKORE_TARGET });
const idOf = (check: string, key?: string) => report.findings.find((f) => f.check === check && (key === undefined || f.message.includes(key)))!.id;

describe("planFixes on the denkore.com report", () => {
  const plan = planFixes(report, ready);

  it("gives the Worth fixing group a button holding exactly the two findings", () => {
    expect(plan.groups.warn).toEqual({ enabled: true });
    expect(findingsForRun(report, ready, "warn").map((f) => f.check).sort()).toEqual(["page.description", "site.sitemap"]);
  });

  it("gives Good to know a button for what code can fix, and leaves out hosting settings and speed", () => {
    expect(plan.groups.info).toEqual({ enabled: true });
    expect(findingsForRun(report, ready, "info").map((f) => f.check).sort()).toEqual(["page.canonical", "page.open-graph", "page.open-graph", "page.open-graph"]);
  });

  it("has no button for Needs fixing, which has no findings", () => {
    expect(plan.groups.fail).toBeNull();
  });

  it("marks a finding that needs a person with its one-line instruction, and gives it no button", () => {
    const headers = report.findings.filter((f) => f.check === "site.security-headers");
    expect(headers).toHaveLength(4);
    for (const f of headers) expect(plan.marks.get(f.id)).toEqual({ kind: "needs_you", instruction: "Add the missing security headers in your hosting settings." });
    expect(plan.marks.get(idOf("page.slow"))).toEqual({ kind: "needs_you", instruction: "Ask your web host or site builder to make the server answer faster." });
    expect(plan.marks.get(idOf("site.sitemap"))).toEqual({ kind: "fixable" });
  });
});

describe("a group with nothing code can fix has no button at all", () => {
  it("shows only Needs you for hosting settings, even when the site could take a run", () => {
    const onlyHeaders = auditReport(denkoreFindings().filter((f) => f.check === "site.security-headers"), { target: DENKORE_TARGET });
    const plan = planFixes(onlyHeaders, ready);
    expect(plan.groups).toEqual({ fail: null, warn: null, info: null });
    expect(findingsForRun(onlyHeaders, ready, "info")).toEqual([]);
  });

  it("treats a check it does not know as needing a person", () => {
    const unknown = auditReport([{ id: "0123456789abcdef", check: "page.future-check", severity: "warn", url: DENKORE_TARGET, message: "m" }]);
    const plan = planFixes(unknown, ready);
    expect(plan.groups.warn).toBeNull();
    expect(plan.marks.get("0123456789abcdef")).toMatchObject({ kind: "needs_you" });
  });
});

describe("when the button is off, it says why", () => {
  it("a site with no repository", () => {
    expect(planFixes(report, { ...ready, repo: null, projectId: null, isLatest: false }).groups.warn).toEqual({
      enabled: false,
      reason: "This site isn't one of your projects, so there is no repository to change.",
    });
  });

  it("a report that is not the newest", () => {
    expect(planFixes(report, { ...ready, isLatest: false }).groups.warn).toEqual({
      enabled: false,
      reason: "This isn't the latest report for this site. Open the latest one to fix what is open now.",
    });
  });

  it("a run already open for the site", () => {
    const open = { ...ready, openRun: { id: RUN, findingIds: [idOf("page.description"), idOf("site.sitemap")] } };
    const plan = planFixes(report, open);
    expect(plan.groups.warn).toEqual({ enabled: false, reason: "A run is already open for this site (run #6f1c2b9e). Wait for it to finish." });
    // Only one open run per site, so the other group is off too.
    expect(plan.groups.info).toMatchObject({ enabled: false });
  });

  it("shows each finding in the run as in progress, and the rest as before", () => {
    const open = { ...ready, openRun: { id: RUN, findingIds: [idOf("page.description"), idOf("site.sitemap")] } };
    const plan = planFixes(report, open);
    expect(plan.marks.get(idOf("page.description"))).toEqual({ kind: "in_progress", runId: RUN });
    expect(plan.marks.get(idOf("site.sitemap"))).toEqual({ kind: "in_progress", runId: RUN });
    expect(plan.marks.get(idOf("page.canonical"))).toEqual({ kind: "fixable" });
    expect(findingsForRun(report, open, "warn")).toEqual([]);
  });

  it("checks the repository before the report's age, and the age before an open run", () => {
    expect(planFixes(report, { projectId: null, repo: null, isLatest: false, openRun: { id: RUN, findingIds: [] } }).groups.warn).toMatchObject({ reason: expect.stringContaining("no repository") });
    expect(planFixes(report, { ...ready, isLatest: false, openRun: { id: RUN, findingIds: [] } }).groups.warn).toMatchObject({ reason: expect.stringContaining("latest report") });
  });
});
