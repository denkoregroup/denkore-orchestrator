import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Finding } from "@/lib/audits/types";
import { auditReport, DENKORE_TARGET, denkoreFindings, findings } from "@/test-utils/site-reports";

// The layout's own children are other tests' business; here only the print hooks matter.
jest.mock("@/components/nav", () => ({ Nav: () => <nav aria-label="Main">nav</nav> }));
jest.mock("@/components/owner-badge", () => ({ OwnerBadge: () => <button type="button">Sign out</button> }));

import AppLayout from "@/app/(app)/layout";
import { SiteReport } from "@/components/sites/site-report";

describe("printing a report (Save as PDF)", () => {
  it("hides the nav and the header with its sign-out button", () => {
    const { container } = render(<AppLayout params={Promise.resolve({})}>{<p>report</p>}</AppLayout>);
    expect(screen.getByRole("navigation").closest("aside")).toHaveClass("print:hidden");
    expect(container.querySelector("header")).toHaveClass("print:hidden");
    expect(container.querySelector("header")).toContainElement(screen.getByRole("button", { name: "Sign out" }));
    // The page itself is not hidden, and loses its padding on paper.
    expect(container.querySelector("main")).not.toHaveClass("print:hidden");
    expect(container.querySelector("main")).toHaveClass("print:p-0");
  });

  it("hides the link back to all sites, and keeps a finding's page together on one printed page", () => {
    const report = auditReport(denkoreFindings(), { target: DENKORE_TARGET });
    const { container } = render(
      <SiteReport current={{ id: "x", projectId: null, target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report }} previous={null} />,
    );
    expect(screen.getByRole("link", { name: "All sites" }).closest("p")).toHaveClass("print:hidden");
    // The link to the prospect-facing view is owner navigation, so it never prints either.
    const check = screen.getByRole("link", { name: "Site check view" });
    expect(check).toHaveAttribute("href", "/check/x");
    expect(check.closest("p")).toHaveClass("print:hidden");
    for (const group of container.querySelectorAll("h3")) expect(group.parentElement).toHaveClass("print:break-inside-avoid");
  });

  describe("the What changed status line never prints, so a client PDF doesn't show it", () => {
    const FIRST = "2026-11-01T10:00:00.000Z";
    const LATER = "2026-11-08T10:00:00.000Z";
    const stored = (list: Finding[], startedAt: string) => {
      const report = auditReport(list, { target: DENKORE_TARGET, startedAt, finishedAt: startedAt });
      return { id: "x", projectId: null, target: DENKORE_TARGET, startedAt, pagesChecked: 1, report };
    };
    const statusLine = (re: RegExp) => screen.getByText(re).closest("p")!;

    it("first report: \"First report for this site…\"", () => {
      render(<SiteReport current={stored(denkoreFindings(), LATER)} previous={null} />);
      expect(statusLine(/First report for this site/)).toHaveClass("print:hidden");
    });

    it("nothing changed: \"No changes since…\"", () => {
      render(<SiteReport current={stored(denkoreFindings(), LATER)} previous={stored(denkoreFindings(), FIRST)} />);
      expect(statusLine(/No changes since/)).toHaveClass("print:hidden");
    });

    it("something changed: \"Since …: 1 new · 1 fixed…\", while the New and Fixed lists still print", () => {
      const previous = stored([findings.noTitle, findings.noRobots], FIRST);
      const current = stored([findings.noTitle, findings.brokenLink], LATER);
      const { container } = render(<SiteReport current={current} previous={previous} />);
      expect(statusLine(/1 new · 1 fixed · 1 still open/)).toHaveClass("print:hidden");
      for (const name of ["New (1)", "Fixed (1)"]) {
        const section = screen.getByRole("heading", { name }).closest("section")!;
        expect(section).not.toHaveClass("print:hidden");
        expect(section.closest(".print\\:hidden")).toBeNull();
      }
      // The report's own header line still prints.
      expect(container.querySelector("header")).not.toHaveClass("print:hidden");
      expect(screen.getByText(/Checked/)).not.toHaveClass("print:hidden");
    });

    it("leaves no status text visible in print, in any of the three cases", () => {
      for (const previous of [null, stored(denkoreFindings(), FIRST), stored([findings.noTitle], FIRST)]) {
        const { container, unmount } = render(<SiteReport current={stored(denkoreFindings(), LATER)} previous={previous} />);
        const status = [...container.querySelectorAll("p")].filter((p) => /First report|No changes since|^Since /.test(p.textContent ?? ""));
        expect(status).toHaveLength(1);
        expect(status[0]).toHaveClass("print:hidden");
        unmount();
      }
    });
  });

  it("still has Good to know in the page, collapsed on screen (the stylesheet opens it for print)", () => {
    const report = auditReport(denkoreFindings(), { target: DENKORE_TARGET });
    const { container } = render(
      <SiteReport current={{ id: "x", projectId: null, target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report }} previous={null} />,
    );
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(details.querySelectorAll("li")).toHaveLength(9);
  });
});

describe("the print stylesheet (app/globals.css)", () => {
  const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  // jsdom does not apply media queries, so this checks the rules are there; the behaviour was
  // checked by printing the real page to PDF in Chromium (see the PR).
  const printBlock = css.slice(css.indexOf("@media print"));

  it("prints a closed <details> open, so the PDF is complete", () => {
    expect(printBlock).toMatch(/details::details-content\s*{[^}]*content-visibility:\s*visible/);
  });

  it("always prints in the light palette, even from a browser in dark mode", () => {
    expect(printBlock).toMatch(/--background:\s*#ffffff/);
    expect(printBlock).toMatch(/--foreground:\s*#171717/);
    // It must come after the dark-mode palette to win.
    expect(css.indexOf("@media print")).toBeGreaterThan(css.indexOf("prefers-color-scheme: dark"));
  });

  it("has page margins", () => {
    expect(css).toMatch(/@page\s*{[^}]*margin:/);
  });
});
