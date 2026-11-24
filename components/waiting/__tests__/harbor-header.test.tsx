import { render, screen, within } from "@testing-library/react";
import type { LatestRunReport } from "@/lib/data/run-reports";
import type { WaitingData, WaitingPull } from "@/lib/data/waiting";
import { runReport } from "@/test-utils/run-reports";
import { HarborSummary, projectStatuses, waitingCount } from "../harbor-header";

const NOW = "2026-11-24T23:45:00.000Z";

const latest = (overrides: Parameters<typeof runReport>[0] = {}, answers: LatestRunReport["answers"] = {}): LatestRunReport => {
  const report = runReport(overrides);
  return { id: "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60", report, receivedAt: report.finishedAt, answers };
};

const pull = (over: Partial<WaitingPull>): WaitingPull =>
  ({
    repo: "denkoregroup/barzini-publishing",
    project: "barzini-publishing",
    number: 7,
    title: "Contracts screen",
    url: "https://github.com/denkoregroup/barzini-publishing/pull/7",
    summary: "Adds the contracts screen.",
    byAgent: true,
    author: "claude",
    draft: false,
    checks: "passing",
    conflicts: false,
    stage: "ready",
    updatedAt: NOW,
    ...over,
  }) as WaitingPull;

const data = (pulls: WaitingPull[]): WaitingData => ({ configured: true, pulls, unreadable: [], notShared: [], projectCount: 2 });

describe("projectStatuses", () => {
  it("counts unanswered decisions and ready agent pull requests per project", () => {
    const reports = [latest({}, { 1: { answer: "US only", answeredAt: NOW } })];
    const pulls = [pull({}), pull({ number: 8, stage: "checks_running" }), pull({ number: 9, byAgent: false })];
    expect(projectStatuses(data(pulls), reports)).toEqual([
      { project: "barzini-publishing", needsYou: 1 },
      { project: "honeybees", needsYou: 1 },
    ]);
  });

  it("counts what the review wants your eyes on, and not what it sent back", () => {
    const sha = "a".repeat(40);
    const at = NOW;
    const pulls = [pull({ headSha: sha }), pull({ number: 8, headSha: sha, stage: "needs_fix" }), pull({ number: 9, headSha: sha })];
    const verdicts = {
      "denkoregroup/barzini-publishing#7": { verdict: "changes-needed" as const, reason: "A test fails", headSha: sha, reviewedAt: at },
      "denkoregroup/barzini-publishing#8": { verdict: "needs-david" as const, reason: "Check the copy", headSha: sha, reviewedAt: at },
    };
    expect(projectStatuses(data(pulls), [], verdicts)).toEqual([{ project: "barzini-publishing", needsYou: 2 }]);
  });

  it("adds them up for the switch's Waiting count", () => {
    expect(waitingCount(data([pull({}), pull({ number: 8 })]), [latest()])).toBe(4);
    const sha = "b".repeat(40);
    const sentBack = { "denkoregroup/barzini-publishing#7": { verdict: "changes-needed" as const, reason: "A test fails", headSha: sha, reviewedAt: NOW } };
    expect(waitingCount(data([pull({ headSha: sha })]), [], sentBack)).toBe(0);
  });

  it("works when GitHub isn't connected", () => {
    expect(projectStatuses({ configured: false }, [latest({ decisions: [] })])).toEqual([{ project: "honeybees", needsYou: 0 }]);
  });
});

describe("HarborSummary", () => {
  it("shows the page name, the time, one big count, and a tile per project", () => {
    render(<HarborSummary now={NOW} data={data([pull({})])} reports={[latest({ decisions: [] })]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Waiting on you" })).toHaveClass("text-accent");
    expect(screen.getByText("Nov 24, 2026, 6:45 PM ET")).toBeVisible();
    const count = screen.getByText("1", { selector: "span" });
    expect(count).toHaveClass("text-signal");
    expect(count.closest("p")).toHaveTextContent("1waiting on you");

    const tiles = within(screen.getByRole("list", { name: "Your projects" })).getAllByRole("listitem");
    expect(tiles.map((t) => t.textContent)).toEqual(["barzini-publishingNeeds you · 1", "honeybeesClear"]);
    expect(within(tiles[0]).getByText("Needs you · 1")).toHaveClass("text-signal");
  });

  it("shows zero and no tiles when nothing has reported", () => {
    render(<HarborSummary now={NOW} data={{ configured: false }} reports={[]} />);
    expect(screen.getByText("0", { selector: "span" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Your projects" })).toBeNull();
  });
});
