import { render, screen, within } from "@testing-library/react";
import type { StoredReport, SiteSummary } from "@/lib/site-health/queries";
import { auditReport, findings } from "@/test-utils/site-reports";
import { SiteList } from "../site-list";
import { SiteReport } from "../site-report";

const ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";

function stored(list = [findings.noTitle], startedAt = "2026-11-08T10:00:00.000Z"): StoredReport {
  const report = auditReport(list, { startedAt, finishedAt: startedAt });
  return { id: ID, target: report.target, startedAt, pagesChecked: 3, report };
}

describe("SiteList", () => {
  const site: SiteSummary = {
    id: ID,
    target: "https://www.example.com/",
    startedAt: "2026-11-08T10:00:00.000Z",
    pagesChecked: 1,
    counts: { fail: 2, warn: 3, info: 9 },
  };

  it("says there are no reports yet, and links nowhere", () => {
    render(<SiteList sites={[]} truncated={false} />);
    expect(screen.getByText(/No site reports yet/)).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows each site's latest counts in plain words and links to its report", () => {
    render(<SiteList sites={[site]} truncated={false} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/sites/${ID}`);
    expect(within(link).getByText("www.example.com")).toBeVisible();
    expect(within(link).getByText("1 page", { exact: false })).toBeVisible();
    expect(within(link).getByText("Needs fixing").nextSibling).toHaveTextContent("2");
    expect(within(link).getByText("Worth fixing").nextSibling).toHaveTextContent("3");
    expect(within(link).getByText("Good to know").nextSibling).toHaveTextContent("9");
  });

  it("only warns about a partial list when the read was cut off", () => {
    const { rerender } = render(<SiteList sites={[site]} truncated={false} />);
    expect(screen.queryByText(/may be missing/)).toBeNull();
    rerender(<SiteList sites={[site]} truncated />);
    expect(screen.getByText(/may be missing/)).toBeVisible();
  });
});

describe("SiteReport", () => {
  it("groups findings as Needs fixing, Worth fixing and Good to know, each with message and address", () => {
    render(<SiteReport current={stored([findings.brokenLink, findings.noTitle, findings.noRobots])} previous={null} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("example.com");

    const fail = screen.getByRole("heading", { name: "Needs fixing (1)" }).closest("section")!;
    expect(within(fail).getByText(findings.brokenLink.message)).toBeVisible();
    expect(within(fail).getByText(findings.brokenLink.url)).toBeVisible();
    expect(within(screen.getByRole("heading", { name: "Worth fixing (1)" }).closest("section")!).getByText(findings.noTitle.message)).toBeVisible();
    expect(within(screen.getByRole("heading", { name: "Good to know (1)" }).closest("section")!).getByText(findings.noRobots.message)).toBeVisible();
  });

  it("leaves out a group with nothing in it", () => {
    render(<SiteReport current={stored([findings.noTitle])} previous={null} />);
    expect(screen.queryByRole("heading", { name: /Needs fixing/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Good to know/ })).toBeNull();
  });

  it("says so when there is nothing wrong", () => {
    render(<SiteReport current={stored([])} previous={null} />);
    expect(screen.getByText("No problems found.")).toBeVisible();
  });

  it("does not turn an address from a report into a link", () => {
    render(<SiteReport current={stored([findings.brokenLink])} previous={null} />);
    expect(screen.queryByRole("link", { name: findings.brokenLink.url })).toBeNull();
  });

  it("for a first report, says there is nothing to compare", () => {
    render(<SiteReport current={stored()} previous={null} />);
    expect(screen.getByText(/first report for this site/)).toBeVisible();
    expect(screen.queryByText(/Nothing has changed/)).toBeNull();
  });

  it("shows what is new and what was fixed since the previous report", () => {
    const previous = stored([findings.noTitle, findings.noRobots], "2026-11-01T10:00:00.000Z");
    const current = stored([findings.noTitle, findings.brokenLink]);
    render(<SiteReport current={current} previous={previous} />);

    expect(screen.getByText(/1 new, 1 fixed, 1 still open/)).toBeVisible();
    const added = screen.getByRole("heading", { name: "New since then (1)" }).nextElementSibling as HTMLElement;
    expect(within(added).getByText(findings.brokenLink.message)).toBeVisible();
    const fixed = screen.getByRole("heading", { name: "Fixed since then (1)" }).nextElementSibling as HTMLElement;
    expect(within(fixed).getByText(findings.noRobots.message)).toBeVisible();
  });

  it("says nothing has changed when the two reports match", () => {
    render(<SiteReport current={stored()} previous={stored([findings.noTitle], "2026-11-01T10:00:00.000Z")} />);
    expect(screen.getByText("Nothing has changed.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: /since then/ })).toBeNull();
  });

  it("links back to all sites", () => {
    render(<SiteReport current={stored()} previous={null} />);
    expect(screen.getByRole("link", { name: "All sites" })).toHaveAttribute("href", "/sites");
  });
});
