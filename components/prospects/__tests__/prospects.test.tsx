import { render, screen, within } from "@testing-library/react";
import { finding } from "@/lib/audits/types";
import type { StoredReport } from "@/lib/site-health/queries";
import { auditReport } from "@/test-utils/site-reports";

const listProspects = jest.fn();
jest.mock("@/lib/site-health/queries", () => ({ listProspects: () => listProspects() }));
jest.mock("@/app/(app)/prospects/actions", () => ({ checkSiteAction: jest.fn() }));

import ProspectsPage from "@/app/(app)/prospects/page";
import { ProspectList } from "@/components/prospects/prospect-list";
import { SitesTabs } from "@/components/sites/sites-tabs";

const ID_A = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const ID_B = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";

function stored(id: string, target: string, startedAt: string, list: Array<ReturnType<typeof finding>> = []): StoredReport {
  const report = auditReport(list, { target, startedAt, finishedAt: startedAt });
  return { id, projectId: null, target, startedAt, pagesChecked: 1, report };
}
const og = (target: string) => ["og:title", "og:description", "og:image"].map((key) => finding({ check: "page.open-graph", severity: "info", url: target, key, message: "m" }));

describe("ProspectList", () => {
  const reports = [
    stored(ID_A, "https://www.theirbusiness.com/", "2026-11-13T15:00:00.000Z", og("https://www.theirbusiness.com/")),
    stored(ID_B, "https://other.example/", "2026-11-12T15:00:00.000Z"),
  ];

  it("shows each prospect's site name, date in Eastern time and short status, and opens its site check", () => {
    render(<ProspectList reports={reports} />);
    const [first, second] = screen.getAllByRole("link");
    expect(first).toHaveAttribute("href", `/check/${ID_A}`);
    expect(within(first).getByText("www.theirbusiness.com")).toBeVisible();
    expect(within(first).getByText("Nov 13, 2026, 10:00 AM ET")).toBeVisible();
    expect(within(first).getByText("1 to fix first")).toBeVisible();
    expect(second).toHaveAttribute("href", `/check/${ID_B}`);
    expect(within(second).getByText("looking good")).toBeVisible();
  });

  it("keeps the given order, newest first", () => {
    render(<ProspectList reports={reports} />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([`/check/${ID_A}`, `/check/${ID_B}`]);
  });

  it("shows four small lights whose label says the counts", () => {
    render(<ProspectList reports={reports} />);
    const [first, second] = screen.getAllByRole("img");
    expect(first).toHaveAccessibleName("1 fix first, 0 needs work, 3 good");
    expect(first.querySelectorAll("span")).toHaveLength(4);
    expect(second).toHaveAccessibleName("0 fix first, 0 needs work, 4 good");
  });

  it("says a site that did not load couldn't load, with no lights", () => {
    const unreachable = stored(ID_A, "https://down.example/", "2026-11-13T15:00:00.000Z", [finding({ check: "site.unreachable", severity: "warn", url: "https://down.example/", message: "m" })]);
    render(<ProspectList reports={[unreachable]} />);
    expect(screen.getByText("couldn't load")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders text from a site as text, never as markup", () => {
    const hostile = stored(ID_A, "https://x.example/<img src=x onerror=alert(1)>", "2026-11-13T15:00:00.000Z");
    const { container } = render(<ProspectList reports={[hostile]} />);
    expect(container.querySelector("img[src]")).toBeNull();
  });

  it("explains an empty list", () => {
    render(<ProspectList reports={[]} />);
    expect(screen.getByText("No checks yet. Type a website above to run one.")).toBeVisible();
  });
});

describe("SitesTabs", () => {
  it("has Your sites and Prospects, and marks the current one", () => {
    render(<SitesTabs current="prospects" />);
    expect(screen.getByRole("link", { name: "Your sites" })).toHaveAttribute("href", "/sites");
    expect(screen.getByRole("link", { name: "Prospects" })).toHaveAttribute("href", "/prospects");
    expect(screen.getByRole("link", { name: "Prospects" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Your sites" })).not.toHaveAttribute("aria-current");
  });

  it("does not print", () => {
    render(<SitesTabs current="sites" />);
    expect(screen.getByRole("navigation", { name: "Sites" })).toHaveClass("print:hidden");
  });
});

describe("/prospects", () => {
  beforeEach(() => listProspects.mockReset());

  it("shows the tabs, the form with its hint, and the recent checks", async () => {
    listProspects.mockResolvedValue([stored(ID_A, "https://www.theirbusiness.com/", "2026-11-13T15:00:00.000Z")]);
    render(await ProspectsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Prospects" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Your sites" })).toBeVisible();
    expect(screen.getByLabelText("Their website")).toBeVisible();
    expect(screen.getByText("Takes about 15 seconds. Looks at the homepage only.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check site" })).toBeEnabled();
    expect(screen.getByRole("heading", { level: 2, name: "Recent checks" })).toBeVisible();
    expect(screen.getByRole("link", { name: /www\.theirbusiness\.com/ })).toHaveAttribute("href", `/check/${ID_A}`);
  });

  it("does not hide a database failure", async () => {
    listProspects.mockRejectedValue(new Error("listProspects failed: permission denied"));
    await expect(ProspectsPage()).rejects.toThrow(/permission denied/);
  });
});
