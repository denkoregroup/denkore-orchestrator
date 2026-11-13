import { render, screen } from "@testing-library/react";
import { auditReport, findings } from "@/test-utils/site-reports";

const listSites = jest.fn();
const getSiteReport = jest.fn();
const loadFixContext = jest.fn();
const notFound = jest.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});

jest.mock("@/lib/site-health/queries", () => ({
  listSites: () => listSites(),
  getSiteReport: (id: string) => getSiteReport(id),
}));
jest.mock("@/lib/audit-fixes/queries", () => ({ loadFixContext: (id: string, target: string) => loadFixContext(id, target) }));
jest.mock("next/navigation", () => ({ notFound: () => notFound() }));
jest.mock("@/app/(app)/sites/[id]/actions", () => ({ fixWithConductorAction: jest.fn() }));

import SitePage from "@/app/(app)/sites/[id]/page";
import SitesPage from "@/app/(app)/sites/page";

const ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";

beforeEach(() => {
  listSites.mockReset();
  getSiteReport.mockReset();
  loadFixContext.mockReset();
  loadFixContext.mockResolvedValue({ projectId: null, repo: null, isLatest: false, openRun: null });
  notFound.mockClear();
});

describe("/sites", () => {
  it("without data, explains that nothing has been sent yet", async () => {
    listSites.mockResolvedValue({ sites: [], unreported: [], truncated: false });
    render(await SitesPage());
    expect(screen.getByRole("heading", { level: 1, name: "Sites" })).toBeVisible();
    expect(screen.getByText(/No site reports yet/)).toBeVisible();
  });

  it("with data, lists each site", async () => {
    listSites.mockResolvedValue({
      sites: [{ id: ID, target: "https://example.com/", startedAt: "2026-11-08T10:00:00.000Z", pagesChecked: 3, counts: { fail: 0, warn: 2, info: 4 }, overdue: false }],
      unreported: [],
      truncated: false,
    });
    render(await SitesPage());
    expect(screen.getByRole("link", { name: /example\.com/ })).toHaveAttribute("href", `/sites/${ID}`);
  });

  it("does not hide a database failure", async () => {
    listSites.mockRejectedValue(new Error("listSites failed: permission denied"));
    await expect(SitesPage()).rejects.toThrow(/permission denied/);
  });
});

describe("/sites/[id]", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) }) as unknown as Parameters<typeof SitePage>[0];

  it("with data, shows the report and what changed", async () => {
    const report = auditReport([findings.noTitle, findings.brokenLink]);
    const earlier = auditReport([findings.noTitle], { startedAt: "2026-11-01T10:00:00.000Z" });
    getSiteReport.mockResolvedValue({
      current: { id: ID, target: report.target, startedAt: report.startedAt, pagesChecked: 3, report },
      previous: { id: "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d", target: report.target, startedAt: earlier.startedAt, pagesChecked: 3, report: earlier },
    });
    render(await SitePage(params(ID)));
    expect(getSiteReport).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("heading", { name: "Needs fixing (1)" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "New (1)" })).toBeVisible();
  });

  it("hands the report to Fix with Conductor with what it knows about the site", async () => {
    const report = auditReport([findings.noTitle]);
    getSiteReport.mockResolvedValue({ current: { id: ID, target: report.target, startedAt: report.startedAt, pagesChecked: 3, report }, previous: null });
    loadFixContext.mockResolvedValue({ projectId: "11111111-1111-4111-8111-111111111111", repo: "denkoregroup/denkore", isLatest: true, openRun: null });
    render(await SitePage(params(ID)));
    expect(loadFixContext).toHaveBeenCalledWith(ID, report.target);
    expect(screen.getByRole("button", { name: "Fix with Conductor" })).toBeEnabled();
  });

  it("does not hide a failure to read what it needs for the fix button", async () => {
    const report = auditReport([findings.noTitle]);
    getSiteReport.mockResolvedValue({ current: { id: ID, target: report.target, startedAt: report.startedAt, pagesChecked: 3, report }, previous: null });
    loadFixContext.mockRejectedValue(new Error("loadFixContext (project) failed: permission denied"));
    await expect(SitePage(params(ID))).rejects.toThrow(/permission denied/);
  });

  it("without a report for that id, shows not found", async () => {
    getSiteReport.mockResolvedValue(null);
    await expect(SitePage(params(ID))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
