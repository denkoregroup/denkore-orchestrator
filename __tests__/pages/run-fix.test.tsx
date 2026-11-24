import { render, screen, within } from "@testing-library/react";

const getRun = jest.fn();
jest.mock("@/lib/data/runs", () => ({ getRun: (id: string) => getRun(id) }));
jest.mock("next/navigation", () => ({ notFound: jest.fn() }));

import RunPage from "@/app/(app)/runs/[id]/page";

const ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const REPORT = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const FIX_PROMPT = "[audit-fix]\nFix these audit findings on www.denkore.com.\n- page.title | https://www.denkore.com/ | m";

function detail(prompt: string, events: Array<{ kind: string; payload: unknown }> = [], state = "post_deploy_check") {
  return {
    run: { id: ID, project_id: "p", state, prompt, test_failures: 0, max_test_retries: 3, created_at: "2026-11-13T10:00:00.000Z", updated_at: "2026-11-13T10:00:00.000Z" },
    project: { id: "p", registry_id: "denkore-com", repo: "dclarktech302/denkore", owner_id: "o", created_at: "2026-11-01T10:00:00.000Z" },
    steps: [],
    gates: [],
    events: events.map((e, i) => ({ id: i + 1, run_id: ID, actor: "conductor", created_at: "2026-11-13T10:00:00.000Z", ...e })),
    costUsd: 0,
  };
}
const props = { params: Promise.resolve({ id: ID }) } as unknown as Parameters<typeof RunPage>[0];

beforeEach(() => getRun.mockReset());

describe("a run made from a site report", () => {
  it("says it is not verified until a later report shows its findings fixed", async () => {
    getRun.mockResolvedValue(detail(FIX_PROMPT));
    render(await RunPage(props));
    expect(screen.getByText(/Not verified yet\. Only a later audit report can verify this run/)).toBeVisible();
    expect(screen.queryByText(/Verified by report/)).toBeNull();
  });

  it("shows Verified by report, with the report's date, once a report has verified it", async () => {
    getRun.mockResolvedValue(detail(FIX_PROMPT, [{ kind: "audit.fix_verified", payload: { report_id: REPORT, report_started_at: "2026-11-14T10:00:00.000Z" } }], "done"));
    const { container } = render(await RunPage(props));
    const header = within(container.querySelector("header")!);
    expect(header.getByRole("link", { name: "Nov 14, 2026, 5:00 AM ET" })).toHaveAttribute("href", `/sites/${REPORT}`);
    expect(header.getByText(/Verified by report/)).toBeVisible();
    expect(screen.queryByText(/Not verified yet/)).toBeNull();
    // The history says it too.
    expect(screen.getAllByText(/Verified by report Nov 14, 2026, 5:00 AM ET/).length).toBeGreaterThan(0);
  });

  it("says nothing about verification for an ordinary run", async () => {
    getRun.mockResolvedValue(detail("Build the booking page"));
    render(await RunPage(props));
    expect(screen.queryByText(/verified/i)).toBeNull();
  });
});
