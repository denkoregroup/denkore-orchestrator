import { render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Finding } from "@/lib/audits/types";
import { auditReport, DENKORE_TARGET, denkoreFindings } from "@/test-utils/site-reports";

const requireOwner = jest.fn();
const getSiteReport = jest.fn();
const notFound = jest.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/site-health/queries", () => ({ getSiteReport: (id: string) => getSiteReport(id) }));
jest.mock("next/navigation", () => ({ notFound: () => notFound() }));

import CheckLayout from "@/app/(check)/layout";
import SiteCheckPage from "@/app/(check)/check/[reportId]/page";
import { QrCode } from "@/components/site-check/qr-code";
import { SiteCheckView } from "@/components/site-check/site-check-view";
import { BOOKING_URL, UNREACHABLE, VIEW } from "@/lib/site-check/copy";
import { finding } from "@/lib/audits/types";

const ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const STARTED = "2026-11-12T10:00:00.000Z";

function stored(list: Finding[], overrides: { target?: string; pagesChecked?: number } = {}) {
  const target = overrides.target ?? DENKORE_TARGET;
  const report = auditReport(list, { target, startedAt: STARTED, finishedAt: STARTED });
  return { id: ID, target, startedAt: STARTED, pagesChecked: overrides.pagesChecked ?? 1, report };
}
const denkore = () => stored(denkoreFindings());
const printHidden = (el: Element | null) => expect(el).toHaveClass("print:hidden");

beforeEach(() => {
  requireOwner.mockReset();
  getSiteReport.mockReset();
  notFound.mockClear();
});

describe("the denkore.com site check", () => {
  it("shows the headline with its light words set apart, and the supporting sentence", () => {
    render(<SiteCheckView current={denkore()} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Solid site, invisible when shared.");
    expect(within(h1).getByText("invisible")).toHaveClass("font-extralight");
    expect(screen.getByText(/^It loads, and it's secure\. But shared links show up blank/)).toBeVisible();
  });

  it("shows the four areas in order, each with its title, a status word and a why line", () => {
    render(<SiteCheckView current={denkore()} />);
    const cards = screen.getAllByRole("heading", { level: 3 }).slice(0, 4);
    expect(cards.map((h) => h.textContent)).toEqual(["Looks right when shared", "Found on Google", "Speed", "Safety"]);
    const statuses = cards.map((h) => h.closest("li")!.querySelector("p")!.textContent);
    expect(statuses).toEqual(["Fix first", "Needs work", "Needs work", "Good"]);
    expect(screen.getByText("Shared links show up as a blank box.")).toBeVisible();
  });

  it("gives every light a word and an icon, not only a colour", () => {
    render(<SiteCheckView current={denkore()} />);
    for (const li of screen.getAllByRole("heading", { level: 3 }).slice(0, 4).map((h) => h.closest("li")!)) {
      expect(li.querySelectorAll("svg").length).toBe(2); // the area's drawing and the light's shape
      expect(li.querySelector("p")!.textContent).toMatch(/Fix first|Needs work|Good/);
    }
    const colours = screen.getAllByRole("heading", { level: 3 }).slice(0, 4).map((h) => h.closest("li")!.querySelector("p")!.className);
    expect(colours[0]).toContain("text-check-red");
    expect(colours[1]).toContain("text-check-amber");
    expect(colours[3]).toContain("text-check-green");
  });

  it("lists the three fixes, numbered 01 to 03, with their outcomes", () => {
    render(<SiteCheckView current={denkore()} />);
    expect(screen.getByRole("heading", { name: "Three fixes that matter most" })).toBeVisible();
    const items = screen.getAllByRole("listitem").filter((li) => /^0[1-3]/.test(li.textContent ?? ""));
    expect(items.map((li) => li.textContent)).toEqual([
      "01Add link previewsShared links show your picture, name and a line about you instead of a blank box.",
      "02Give Google a map of your siteA sitemap helps Google find every page you add, not just the homepage.",
      "03Fix your search descriptionIt's the line Google shows under your name, so it should say what you do in 160 characters or fewer.",
    ]);
  });

  it("offers help with a QR code and a Book a call button to the same link", () => {
    render(<SiteCheckView current={denkore()} />);
    const panel = screen.getByRole("heading", { name: "How Denkore can help" }).closest("section")!;
    expect(within(panel).getByText("All three are quick fixes. We can have them done soon.")).toBeVisible();
    expect(within(panel).getByRole("img", { name: VIEW.qrLabel })).toBeVisible();
    expect(within(panel).getByRole("link", { name: "Book a call" })).toHaveAttribute("href", "https://cal.com/dcps302");
    expect(BOOKING_URL).toBe("https://cal.com/dcps302");
  });

  it("collapses the full findings list, and shows each finding's message", () => {
    const { container } = render(<SiteCheckView current={denkore()} />);
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("See all 11 findings")).toBeInTheDocument();
    expect(within(details).getByText(/This page has no description\./)).toBeInTheDocument();
    expect(details.querySelectorAll("li")).toHaveLength(11);
  });

  it("ends with when it was checked, in Eastern time, and the signature", () => {
    render(<SiteCheckView current={denkore()} />);
    expect(screen.getByText(/^Checked/)).toHaveTextContent("Checked Nov 12, 2026, 5:00 AM ET · homepage");
    expect(screen.getByText("Site check by Denkore · Tech that's not confusing.")).toBeVisible();
    expect(screen.getByText(/^Site check ·/)).toHaveTextContent("Site check · www.denkore.com · Nov 12, 2026");
    expect(screen.getByText("www.denkore.com")).toBeVisible();
  });

  it("says how many pages when more than the homepage was checked", () => {
    render(<SiteCheckView current={stored(denkoreFindings(), { pagesChecked: 3 })} />);
    expect(screen.getByText(/^Checked/)).toHaveTextContent("· 3 pages");
  });

  it("has a Save as PDF button that opens the print dialog", async () => {
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    render(<SiteCheckView current={denkore()} />);
    screen.getByRole("button", { name: "Save as PDF" }).click();
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});

describe("an unreachable site", () => {
  const unreachable = () => stored([finding({ check: "site.unreachable", severity: "warn", url: DENKORE_TARGET, message: "x", evidence: "Network error: nope" })]);

  it("shows the headline and the one line, from the copy file", () => {
    render(<SiteCheckView current={unreachable()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We couldn't load your site.");
    expect(screen.getByText("The site didn't load when we checked. It may be down, or blocking automated visitors.")).toBeVisible();
    expect(UNREACHABLE.supporting).toBe("The site didn't load when we checked. It may be down, or blocking automated visitors.");
  });

  it("shows nothing else: no areas, fixes, help, findings, buttons, footer or the technical reason", () => {
    const { container } = render(<SiteCheckView current={unreachable()} />);
    expect(screen.queryByText("At a glance")).toBeNull();
    expect(screen.queryByText(/fixes? that matter/)).toBeNull();
    expect(screen.queryByText("How Denkore can help")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    expect(container.textContent).not.toContain("Network error");
  });
});

describe("the booking link", () => {
  it("empty leaves out the QR code and the button, and keeps the rest of the panel", () => {
    render(<SiteCheckView current={denkore()} bookingUrl="" />);
    expect(screen.queryByRole("img", { name: VIEW.qrLabel })).toBeNull();
    expect(screen.queryByRole("link", { name: "Book a call" })).toBeNull();
    expect(screen.getByText("All three are quick fixes. We can have them done soon.")).toBeVisible();
  });

  it("a given link is what both the QR code and the button use", () => {
    render(<SiteCheckView current={denkore()} bookingUrl="https://example.com/book" />);
    expect(screen.getByRole("link", { name: "Book a call" })).toHaveAttribute("href", "https://example.com/book");
    expect(screen.getByRole("img", { name: VIEW.qrLabel })).toBeVisible();
  });

  it("draws the QR code as plain SVG paths, with no injected HTML", () => {
    const { container } = render(<QrCode text="https://cal.com/dcps302" label="code" />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("path")!.getAttribute("d")).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    expect(svg.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
  });
});

describe("fewer than three fixes, or none", () => {
  it("says one fix, in the singular", () => {
    render(<SiteCheckView current={stored([finding({ check: "page.title", severity: "fail", url: DENKORE_TARGET, message: "t" })])} />);
    expect(screen.getByRole("heading", { name: "The fix that matters most" })).toBeVisible();
    expect(screen.getByText("It's a quick fix. We can have it done soon.")).toBeVisible();
  });

  it("an all-green site has no fixes and no help panel, and no findings list", () => {
    const { container } = render(<SiteCheckView current={stored([])} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your site is in good shape.");
    expect(screen.queryByText("How Denkore can help")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText(/in full on request/)).toBeNull();
  });
});

describe("printing (one Letter page)", () => {
  it("hides the back link, the chip, the buttons and the findings list", () => {
    const { container } = render(<SiteCheckView current={denkore()} />);
    printHidden(screen.getByRole("link", { name: /All sites/ }).closest("p"));
    printHidden(screen.getByText("www.denkore.com"));
    printHidden(screen.getByRole("link", { name: "Book a call" }));
    printHidden(screen.getByRole("button", { name: "Save as PDF" }));
    printHidden(container.querySelector("details"));
  });

  it("names the website in the printed eyebrow, so the PDF always says which site it is about", () => {
    render(<SiteCheckView current={denkore()} />);
    const eyebrow = screen.getByText(/^Site check ·/);
    const printed = within(eyebrow).getByText("www.denkore.com ·");
    expect(printed).toHaveClass("hidden", "print:inline"); // on screen the chip says it instead
    expect(eyebrow).toHaveTextContent("Site check · www.denkore.com · Nov 12, 2026");
    printHidden(screen.getByText("www.denkore.com")); // the chip itself stays off the page
  });

  it("keeps the help panel and the QR code, and puts the areas in a 2 by 2 grid", () => {
    const { container } = render(<SiteCheckView current={denkore()} />);
    const panel = screen.getByRole("heading", { name: "How Denkore can help" }).closest("section")!;
    expect(panel).not.toHaveClass("print:hidden");
    expect(screen.getByRole("img", { name: VIEW.qrLabel }).closest("div")).not.toHaveClass("print:hidden");
    expect(container.querySelector("ul")).toHaveClass("print:grid-cols-2");
  });

  it("says how many findings are in full on request, only on paper", () => {
    render(<SiteCheckView current={denkore()} />);
    const line = screen.getByText("11 findings in full on request");
    expect(line).toHaveClass("hidden", "print:block");
  });

  it("is white ink on paper by variables, and the screen is dark", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    const screenBlock = css.match(/^\.site-check \{([^}]*)\}/m)![1];
    const printBlock = css.match(/@media print \{[\s\S]*?\.site-check \{([^}]*)\}/)![1];
    for (const [name, value] of Object.entries({ "--check-bg": "#050505", "--check-card": "#181818", "--check-red": "#ff7a7a", "--check-amber": "#f6b13a", "--check-green": "#4fd18b" })) {
      expect(screenBlock).toContain(`${name}: ${value};`);
    }
    for (const [name, value] of Object.entries({ "--check-bg": "#ffffff", "--check-ink": "#14110d", "--check-red": "#b3261e", "--check-amber": "#8a4f00", "--check-green": "#1f6b3f" })) {
      expect(printBlock).toContain(`${name}: ${value};`);
    }
  });
});

describe("flat: no glows, shadows or gradients", () => {
  it("none in the check's components, layout, page or stylesheet block", () => {
    const files = [
      ...readdirSync(path.join(process.cwd(), "components", "site-check")).map((f) => path.join("components", "site-check", f)),
      path.join("app", "(check)", "layout.tsx"),
      path.join("app", "(check)", "check", "[reportId]", "page.tsx"),
    ];
    for (const file of files) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8")).not.toMatch(/shadow|gradient|glow|blur/i);
    }
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    const checkCss = css.slice(css.indexOf(".site-check {"));
    expect(checkCss).not.toMatch(/shadow|gradient|glow|blur/i);
  });
});

describe("/check/[reportId]", () => {
  const params = (reportId: string) => ({ params: Promise.resolve({ reportId }) }) as unknown as Parameters<typeof SiteCheckPage>[0];

  it("refuses anyone but the owner, before reading any report", async () => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(SiteCheckPage(params(ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(getSiteReport).not.toHaveBeenCalled();
  });

  it("shows the check for a stored report", async () => {
    requireOwner.mockResolvedValue({ id: "owner", email: null });
    getSiteReport.mockResolvedValue({ current: denkore(), previous: null });
    render(await SiteCheckPage(params(ID)));
    expect(getSiteReport).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Solid site, invisible when shared.");
  });

  it("is a 404 when there is no such report", async () => {
    requireOwner.mockResolvedValue({ id: "owner", email: null });
    getSiteReport.mockResolvedValue(null);
    await expect(SiteCheckPage(params(ID))).rejects.toThrow(/404/);
  });

  it("does not hide a database failure", async () => {
    requireOwner.mockResolvedValue({ id: "owner", email: null });
    getSiteReport.mockRejectedValue(new Error("getSiteReport failed: permission denied"));
    await expect(SiteCheckPage(params(ID))).rejects.toThrow(/permission denied/);
  });
});

describe("the layout", () => {
  it("wraps the page in the check's own dark, flat frame, with no app navigation", () => {
    const { container } = render(<CheckLayout params={Promise.resolve({})}>{<p>page</p>}</CheckLayout>);
    expect(container.firstElementChild).toHaveClass("site-check", "bg-check-bg");
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
