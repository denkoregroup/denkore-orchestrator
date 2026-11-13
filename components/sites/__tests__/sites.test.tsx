import { render, screen, within } from "@testing-library/react";
import type { StoredReport, SiteSummary } from "@/lib/site-health/queries";
import { finding } from "@/lib/audits/types";
import { auditReport, DENKORE_TARGET, denkoreFindings, findings } from "@/test-utils/site-reports";
import { SiteList } from "../site-list";
import { SiteReport } from "../site-report";

jest.mock("@/app/(app)/sites/[id]/actions", () => ({ fixWithConductorAction: jest.fn() }));

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
    overdue: false,
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
    expect(within(link).getByText("Nov 8, 2026, 5:00 AM ET", { exact: false })).toBeVisible();
    expect(within(link).getByText("Needs fixing").nextSibling).toHaveTextContent("2");
    expect(within(link).getByText("Worth fixing").nextSibling).toHaveTextContent("3");
    expect(within(link).getByText("Good to know").nextSibling).toHaveTextContent("9");
  });

  it("marks an overdue site, and only that one", () => {
    const other: SiteSummary = { ...site, id: "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d", target: "https://other.example/" };
    render(<SiteList sites={[{ ...site, overdue: true }, other]} truncated={false} />);
    const overdueLink = screen.getByRole("link", { name: /www\.example\.com/ });
    expect(within(overdueLink).getByText("Overdue")).toBeVisible();
    expect(within(screen.getByRole("link", { name: /other\.example/ })).queryByText("Overdue")).toBeNull();
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
  });

  it("lists a registered site that has no report yet, and marks it overdue when it should be", () => {
    render(<SiteList sites={[]} unreported={[{ registryId: "denkore-com", overdue: true }, { registryId: "ggrmusic-com", overdue: false }]} truncated={false} />);
    expect(screen.queryByText(/No site reports yet/)).toBeNull();
    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("denkore-com");
    expect(within(first).getByText("Overdue")).toBeVisible();
    expect(within(first).getByText("No report yet.")).toBeVisible();
    expect(within(second).queryByText("Overdue")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("only warns about a partial list when the read was cut off", () => {
    const { rerender } = render(<SiteList sites={[site]} truncated={false} />);
    expect(screen.queryByText(/may be missing/)).toBeNull();
    rerender(<SiteList sites={[site]} truncated />);
    expect(screen.getByText(/may be missing/)).toBeVisible();
  });
});

const FIRST = "2026-11-01T10:00:00.000Z"; // Nov 1, 2026, 5:00 AM ET
const LATER = "2026-11-08T10:00:00.000Z";

function denkoreReport(startedAt = LATER, list = denkoreFindings()): StoredReport {
  const report = auditReport(list, { target: DENKORE_TARGET, startedAt, finishedAt: startedAt });
  return { id: ID, target: DENKORE_TARGET, startedAt, pagesChecked: 1, report };
}

const section = (name: RegExp) => screen.getByRole("heading", { level: 2, name }).closest("section")!;

describe("SiteReport", () => {
  describe("layout", () => {
    it("has a one-line summary under the host, and the host as the one link to the site", () => {
      render(<SiteReport current={denkoreReport()} previous={null} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("www.denkore.com");
      expect(screen.getByText("2 worth fixing · 9 good to know")).toBeVisible();
      expect(screen.getAllByRole("link", { name: "www.denkore.com" })).toHaveLength(1);
      expect(screen.getByRole("link", { name: "www.denkore.com" })).toHaveAttribute("href", DENKORE_TARGET);
    });

    it("shows nine findings on one page under that page's address once, and the collapsed group still holds all nine", () => {
      const { container } = render(<SiteReport current={denkoreReport()} previous={null} />);
      const details = container.querySelector("details")!;
      expect(details).not.toHaveAttribute("open");
      expect(within(details).getByText("Good to know (9)")).toBeInTheDocument();

      // The address appears once, as a small heading; the findings are short lines beneath it.
      expect(within(details).getAllByRole("heading", { level: 3 })).toHaveLength(1);
      expect(within(details).getByRole("heading", { level: 3 })).toHaveTextContent("/");
      expect(within(details).getAllByRole("listitem")).toHaveLength(9);
      // Collapsed means hidden from view, not missing from the page.
      for (const li of within(details).getAllByRole("listitem", { hidden: true })) expect(li).not.toBeVisible();
      expect(details.textContent).toContain("HSTS");
      expect(details.textContent).toContain("og:image");
    });

    it("keeps Worth fixing open (not in a disclosure) and Good to know the only collapsed group", () => {
      const { container } = render(<SiteReport current={denkoreReport()} previous={null} />);
      expect(container.querySelectorAll("details")).toHaveLength(1);
      const worth = section(/Worth fixing/);
      expect(worth.closest("details")).toBeNull();
      expect(worth).toBeVisible();
      expect(within(worth).getAllByRole("heading", { level: 3 })).toHaveLength(2); // "/" and "/sitemap.xml"
    });

    it("keeps Needs fixing open too", () => {
      const { container } = render(<SiteReport current={stored([findings.brokenLink])} previous={null} />);
      expect(container.querySelector("details")).toBeNull();
      expect(section(/Needs fixing/)).toBeVisible();
    });

    it("shows each address as its path, with the full address as the link", () => {
      render(<SiteReport current={denkoreReport()} previous={null} />);
      const sitemap = screen.getByRole("link", { name: "/sitemap.xml" });
      expect(sitemap).toHaveAttribute("href", "https://www.denkore.com/sitemap.xml");
      expect(screen.queryByText("https://www.denkore.com/sitemap.xml")).toBeNull();
    });

    it("keeps the host on an address that is on another host", () => {
      const other = finding({ check: "site.www", severity: "warn", url: "https://denkore.com/", message: "Your site loads at two addresses." });
      render(<SiteReport current={denkoreReport(LATER, [other])} previous={null} />);
      expect(screen.getByRole("link", { name: "denkore.com/" })).toHaveAttribute("href", "https://denkore.com/");
    });

    it("never makes a link out of an address that is not a web address", () => {
      const bad = finding({ check: "page.broken-link", severity: "fail", url: "javascript:alert(1)", message: "A link is broken." });
      render(<SiteReport current={denkoreReport(LATER, [bad])} previous={null} />);
      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("javascript:alert(1)");
      expect(within(screen.getByRole("heading", { level: 3 })).queryByRole("link")).toBeNull();
    });

    it("says when there is nothing wrong", () => {
      render(<SiteReport current={denkoreReport(LATER, [])} previous={null} />);
      expect(screen.getByText("No problems found")).toBeVisible();
      expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    });

    it("shows the check time in Eastern time", () => {
      render(<SiteReport current={denkoreReport()} previous={null} />);
      expect(screen.getByText(/Checked/)).toHaveTextContent("Checked Nov 8, 2026, 5:00 AM ET · 1 page looked at");
    });

    it("links back to all sites", () => {
      render(<SiteReport current={denkoreReport()} previous={null} />);
      expect(screen.getByRole("link", { name: "All sites" })).toHaveAttribute("href", "/sites");
    });
  });

  describe("what changed", () => {
    it("for a first report, says there is nothing to compare", () => {
      render(<SiteReport current={denkoreReport()} previous={null} />);
      expect(screen.getByText(/First report for this site/)).toBeVisible();
    });

    it("when nothing changed, is one line: no changes since the time, and how many are still open", () => {
      const { container } = render(<SiteReport current={denkoreReport(LATER)} previous={denkoreReport(FIRST)} />);
      const lines = screen.getAllByText(/No changes since/);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toHaveTextContent("No changes since Nov 1, 2026, 5:00 AM ET · 11 still open.");
      // Nothing else says so, and no New or Fixed lists are drawn.
      expect(container.textContent).not.toMatch(/Nothing has changed|Compared with|0 new|0 fixed/);
      expect(screen.queryByRole("heading", { name: /^New/ })).toBeNull();
      expect(screen.queryByRole("heading", { name: /^Fixed/ })).toBeNull();
    });

    it("shows New and Fixed only when their counts are above zero", () => {
      const previous = denkoreReport(FIRST, [findings.noTitle, findings.noRobots]);
      const current = denkoreReport(LATER, [findings.noTitle, findings.brokenLink]);
      render(<SiteReport current={current} previous={previous} />);

      // The time is its own element, so find the line by its own words, then read all of it.
      expect(screen.getByText(/1 new · 1 fixed · 1 still open/)).toHaveTextContent("Since Nov 1, 2026, 5:00 AM ET: 1 new · 1 fixed · 1 still open.");
      expect(within(section(/^New \(1\)/)).getByText(findings.brokenLink.message)).toBeVisible();
      expect(within(section(/^Fixed \(1\)/)).getByText(findings.noRobots.message)).toBeVisible();
    });

    it("shows only New when nothing was fixed", () => {
      render(<SiteReport current={denkoreReport(LATER, [findings.noTitle, findings.brokenLink])} previous={denkoreReport(FIRST, [findings.noTitle])} />);
      expect(screen.getByRole("heading", { name: "New (1)" })).toBeVisible();
      expect(screen.queryByRole("heading", { name: /^Fixed/ })).toBeNull();
    });

    it("shows only Fixed when nothing is new", () => {
      render(<SiteReport current={denkoreReport(LATER, [findings.noTitle])} previous={denkoreReport(FIRST, [findings.noTitle, findings.noRobots])} />);
      expect(screen.getByRole("heading", { name: "Fixed (1)" })).toBeVisible();
      expect(screen.queryByRole("heading", { name: /^New/ })).toBeNull();
    });
  });
});
