import { render, screen, within } from "@testing-library/react";
import { planFixes, type FixContext } from "@/lib/audit-fixes/plan";
import { auditReport, DENKORE_TARGET, denkoreFindings } from "@/test-utils/site-reports";

jest.mock("@/app/(app)/sites/[id]/actions", () => ({ fixWithConductorAction: jest.fn() }));

import { SiteReport } from "@/components/sites/site-report";

const ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const RUN = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const report = auditReport(denkoreFindings(), { target: DENKORE_TARGET });
const current = { id: ID, target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report };
const ready: FixContext = { projectId: "11111111-1111-4111-8111-111111111111", repo: "denkoregroup/denkore", isLatest: true, openRun: null };

const show = (ctx: FixContext) => render(<SiteReport current={current} previous={null} fixes={planFixes(report, ctx)} />);
const group = (name: RegExp) => screen.getByRole("heading", { level: 2, name }).closest("section")!;

describe("a report with Fix with Conductor", () => {
  it("puts a button on Worth fixing, and none on a group with nothing to fix", () => {
    const { container } = show(ready);
    expect(within(group(/Worth fixing/)).getByRole("button", { name: "Fix with Conductor" })).toBeEnabled();
    // Good to know is a closed disclosure: its button is inside it.
    expect(container.querySelector("details")!.querySelector("button")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Fix with Conductor" })).toHaveLength(2);
  });

  it("sends the report and the group with the click", () => {
    show(ready);
    const form = within(group(/Worth fixing/)).getByRole("button").closest("form")!;
    expect(form.querySelector('input[name="reportId"]')).toHaveValue(ID);
    expect(form.querySelector('input[name="severity"]')).toHaveValue("warn");
  });

  it("shows Needs you with a one-line instruction on what a person has to do, and no button for it", () => {
    show(ready);
    expect(screen.getAllByText(/Needs you · Add the missing security headers in your hosting settings\./)).toHaveLength(4);
    expect(screen.getByText(/Needs you · Ask your web host or site builder to make the server answer faster\./)).toBeInTheDocument();
    expect(screen.queryByText(/Needs you · .*sitemap/i)).toBeNull();
  });

  it("with no repository, the button is off and says why", () => {
    show({ projectId: null, repo: null, isLatest: false, openRun: null });
    const button = within(group(/Worth fixing/)).getByRole("button", { name: "Fix with Conductor" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("This site isn't one of your projects, so there is no repository to change.");
  });

  it("while a run is open, each finding in it shows In progress with a link to the run, and every button is off", () => {
    const ids = report.findings.filter((f) => f.severity === "warn").map((f) => f.id);
    show({ ...ready, openRun: { id: RUN, findingIds: ids } });
    const warn = group(/Worth fixing/);
    const links = within(warn).getAllByRole("link", { name: "run #7a2d3c0f" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", `/runs/${RUN}`);
    expect(within(warn).getAllByText(/In progress ·/)).toHaveLength(2);
    expect(within(warn).getByRole("button")).toBeDisabled();
    expect(within(warn).getByText("A run is already open for this site (run #7a2d3c0f). Wait for it to finish.")).toBeVisible();
    for (const button of screen.getAllByRole("button", { name: "Fix with Conductor" })) expect(button).toBeDisabled();
  });

  it("never prints the marks or the buttons", () => {
    const ids = report.findings.filter((f) => f.severity === "warn").map((f) => f.id);
    const { container } = show({ ...ready, openRun: { id: RUN, findingIds: ids } });
    for (const form of container.querySelectorAll("form")) expect(form).toHaveClass("print:hidden");
    for (const mark of screen.getAllByText(/Needs you ·|In progress ·/)) expect(mark).toHaveClass("print:hidden");
  });

  it("renders as before, with no buttons or marks, when no plan is given", () => {
    render(<SiteReport current={current} previous={null} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Needs you/)).toBeNull();
  });
});
