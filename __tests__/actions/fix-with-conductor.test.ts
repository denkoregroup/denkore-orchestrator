/**
 * @jest-environment node
 */
import { auditReport, DENKORE_TARGET, denkoreFindings } from "@/test-utils/site-reports";

const requireOwner = jest.fn();
const getSiteReport = jest.fn();
const loadFixContext = jest.fn();
const createRun = jest.fn();
const recordFixRequested = jest.fn();
const scheduleAdvance = jest.fn();
const revalidatePath = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/site-health/queries", () => ({ getSiteReport: (id: string) => getSiteReport(id) }));
jest.mock("@/lib/audit-fixes/queries", () => ({ loadFixContext: (id: string, target: string) => loadFixContext(id, target) }));
jest.mock("@/lib/data/runs", () => ({ createRun: (input: unknown) => createRun(input) }));
jest.mock("@/lib/audit-fixes/record", () => ({ recordFixRequested: (input: unknown) => recordFixRequested(input) }));
jest.mock("@/lib/conductor/schedule", () => ({ scheduleAdvance: (id: string) => scheduleAdvance(id) }));
jest.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { fixWithConductorAction } from "@/app/(app)/sites/[id]/actions";
import { isAuditFixPrompt } from "@/lib/audit-fixes/prompt";
import { MemoryConductorStore } from "@/lib/conductor/memory-store";

const REPORT_ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const NEW_RUN = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const report = auditReport(denkoreFindings(), { target: DENKORE_TARGET });
const ready = { projectId: PROJECT_ID, repo: "denkoregroup/denkore", isLatest: true, openRun: null };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const click = (severity = "warn", reportId = REPORT_ID) => fixWithConductorAction({ message: null }, form({ reportId, severity }));

beforeEach(() => {
  for (const mock of [requireOwner, getSiteReport, loadFixContext, createRun, recordFixRequested, scheduleAdvance, revalidatePath]) mock.mockReset();
  requireOwner.mockResolvedValue({ id: "owner-id", email: null });
  getSiteReport.mockResolvedValue({ current: { id: REPORT_ID, target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report }, previous: null });
  loadFixContext.mockResolvedValue(ready);
  createRun.mockResolvedValue({ ok: true, id: NEW_RUN });
  recordFixRequested.mockResolvedValue(undefined);
});

describe("fixWithConductorAction", () => {
  it("refuses anyone but the owner, before reading anything", async () => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    await expect(click()).rejects.toThrow("NEXT_REDIRECT /login");
    expect(getSiteReport).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
  });

  it("on denkore.com's Worth fixing group, makes one run listing exactly those two findings", async () => {
    expect(await click("warn")).toEqual({ message: "Started run #7a2d3c0f." });
    expect(createRun).toHaveBeenCalledTimes(1);
    const { projectId, prompt, maxTestRetries } = createRun.mock.calls[0][0] as { projectId: string; prompt: string; maxTestRetries: number };
    expect(projectId).toBe(PROJECT_ID);
    expect(maxTestRetries).toBe(3);
    expect(isAuditFixPrompt(prompt)).toBe(true);
    const lines = prompt.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.split(" | ")[0]).sort()).toEqual(["- page.description", "- site.sitemap"]);
  });

  it("records which findings the run is for, then starts it", async () => {
    await click("warn");
    const warn = report.findings.filter((f) => f.severity === "warn").map((f) => f.id);
    expect(recordFixRequested).toHaveBeenCalledWith({ runId: NEW_RUN, ownerId: "owner-id", reportId: REPORT_ID, severity: "warn", findingIds: expect.arrayContaining(warn) });
    expect((recordFixRequested.mock.calls[0][0] as { findingIds: string[] }).findingIds).toHaveLength(2);
    expect(scheduleAdvance).toHaveBeenCalledWith(NEW_RUN);
    expect(revalidatePath).toHaveBeenCalledWith(`/sites/${REPORT_ID}`);
  });

  it("puts only what code can fix into the Good to know run, leaving out hosting settings and speed", async () => {
    await click("info");
    const prompt = (createRun.mock.calls[0][0] as { prompt: string }).prompt;
    const checks = prompt.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.split(" | ")[0]);
    expect(checks.sort()).toEqual(["- page.canonical", "- page.open-graph", "- page.open-graph", "- page.open-graph"]);
    expect(prompt).not.toContain("security-headers");
    expect(prompt).not.toContain("page.slow");
  });

  it("does nothing on a second click while a run is open", async () => {
    loadFixContext.mockResolvedValue({ ...ready, openRun: { id: NEW_RUN, findingIds: [] } });
    expect(await click("warn")).toEqual({ message: "A run is already open for this site (run #7a2d3c0f). Wait for it to finish." });
    expect(createRun).not.toHaveBeenCalled();
    expect(recordFixRequested).not.toHaveBeenCalled();
    expect(scheduleAdvance).not.toHaveBeenCalled();
  });

  it("does nothing for a site with no repository, saying why", async () => {
    loadFixContext.mockResolvedValue({ projectId: null, repo: null, isLatest: false, openRun: null });
    expect((await click("warn")).message).toMatch(/no repository/);
    expect(createRun).not.toHaveBeenCalled();
  });

  it("does nothing for a report that is not the newest", async () => {
    loadFixContext.mockResolvedValue({ ...ready, isLatest: false });
    expect((await click("warn")).message).toMatch(/latest report/);
    expect(createRun).not.toHaveBeenCalled();
  });

  it("does nothing for a group with nothing code can fix, as if the button were not there", async () => {
    expect(await click("fail")).toEqual({ message: "There is nothing in this group the Conductor can fix." });
    getSiteReport.mockResolvedValue({
      current: { id: REPORT_ID, target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report: auditReport(denkoreFindings().filter((f) => f.check === "site.security-headers"), { target: DENKORE_TARGET }) },
      previous: null,
    });
    expect((await click("info")).message).toBe("There is nothing in this group the Conductor can fix.");
    expect(createRun).not.toHaveBeenCalled();
  });

  it("rejects a request that is not a report id and a severity", async () => {
    expect((await click("warn", "not-an-id")).message).toBe("That request wasn't valid. Reload the page and try again.");
    expect((await click("critical")).message).toBe("That request wasn't valid. Reload the page and try again.");
    expect(getSiteReport).not.toHaveBeenCalled();
  });

  it("says so when the report is gone", async () => {
    getSiteReport.mockResolvedValue(null);
    expect((await click()).message).toBe("That report no longer exists.");
    expect(createRun).not.toHaveBeenCalled();
  });

  it("does not hide a failure to record the findings: the run is not started", async () => {
    recordFixRequested.mockRejectedValue(new Error("recordFixRequested: permission denied"));
    await expect(click()).rejects.toThrow(/permission denied/);
    expect(scheduleAdvance).not.toHaveBeenCalled();
  });

  it("reports a project that is not the owner's without starting anything", async () => {
    createRun.mockResolvedValue({ ok: false, reason: "unknown_project" });
    expect(await click()).toEqual({ message: "The run couldn't be started. Try again." });
    expect(recordFixRequested).not.toHaveBeenCalled();
    expect(scheduleAdvance).not.toHaveBeenCalled();
  });
});

describe("the click, then the run, on the stub runner", () => {
  it("makes a run the Conductor takes down the fix route", async () => {
    await click("warn");
    const { prompt } = createRun.mock.calls[0][0] as { prompt: string };
    const store = new MemoryConductorStore();
    const id = store.addRun({ prompt });
    const snapshot = (await store.loadSnapshot(id))!;
    expect(snapshot.fix).toEqual({ findingIds: null, nextReport: null }); // until its event is recorded
    store.requestFix(id, (recordFixRequested.mock.calls[0][0] as { findingIds: string[] }).findingIds);
    expect((await store.loadSnapshot(id))!.fix!.findingIds).toHaveLength(2);
  });
});
