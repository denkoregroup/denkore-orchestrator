import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditReport, DENKORE_TARGET, denkoreFindings } from "@/test-utils/site-reports";

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
      <SiteReport current={{ id: "x", target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report }} previous={null} />,
    );
    expect(screen.getByRole("link", { name: "All sites" }).closest("p")).toHaveClass("print:hidden");
    for (const group of container.querySelectorAll("h3")) expect(group.parentElement).toHaveClass("print:break-inside-avoid");
  });

  it("still has Good to know in the page, collapsed on screen (the stylesheet opens it for print)", () => {
    const report = auditReport(denkoreFindings(), { target: DENKORE_TARGET });
    const { container } = render(
      <SiteReport current={{ id: "x", target: DENKORE_TARGET, startedAt: report.startedAt, pagesChecked: 1, report }} previous={null} />,
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
