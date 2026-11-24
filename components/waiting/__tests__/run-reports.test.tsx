import { render, screen, within } from "@testing-library/react";
import type { LatestRunReport } from "@/lib/data/run-reports";
import { runReport } from "@/test-utils/run-reports";
import { LatestRuns, RunDecisions } from "../run-reports";

const latest = (overrides: Parameters<typeof runReport>[0] = {}): LatestRunReport => {
  const report = runReport(overrides);
  return { report, receivedAt: report.finishedAt };
};

describe("RunDecisions", () => {
  it("renders nothing when no run raised a decision", () => {
    const { container } = render(<RunDecisions reports={[latest({ decisions: [] })]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each run's numbered decisions with their options and a way to answer", () => {
    render(
      <RunDecisions
        reports={[
          latest(),
          latest({ registryId: "barzini-publishing", repo: "denkoregroup/barzini-publishing", sessionUrl: undefined, decisions: [{ number: 1, question: "Pin the CLI?" }] }),
        ]}
      />,
    );
    const section = screen.getByRole("region", { name: "Decisions from your runs (3)" });
    const cards = within(section).getAllByRole("listitem").filter((li) => li.parentElement?.parentElement === section);
    expect(cards).toHaveLength(2);

    expect(within(cards[0]).getByText("honeybees")).toBeVisible();
    expect(within(cards[0]).getByText(/Should the shipping page list international rates\?/)).toBeVisible();
    expect(within(within(cards[0]).getByRole("list", { name: "Options for decision 1" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Yes",
      "US only",
    ]);
    const link = within(cards[0]).getByRole("link", { name: "Answer in the run's session" });
    expect(link).toHaveAttribute("href", "https://claude.ai/code/session_01ExampleNotReal");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    expect(within(cards[1]).queryByRole("link")).toBeNull();
    expect(within(cards[1]).getByText("Answer by number in that run's chat.")).toBeVisible();
  });

  it("shows report text as text, never as markup", () => {
    render(<RunDecisions reports={[latest({ decisions: [{ number: 1, question: "<img src=x onerror=alert(1)> ok?" }] })]} />);
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> ok\?/)).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("LatestRuns", () => {
  it("says so when no run has reported", () => {
    render(<LatestRuns reports={[]} />);
    expect(screen.getByRole("region", { name: "Latest runs (0)" })).toHaveTextContent("No run has reported in the last week.");
  });

  it("shows each run's summary, its PRs linked to GitHub, and its notes", () => {
    render(<LatestRuns reports={[latest()]} />);
    expect(screen.getByText(/Both wait on your merge\./)).toBeVisible();
    expect(screen.getByText(/could start new work/)).toBeVisible();
    const pulls = within(screen.getByRole("list", { name: "Pull requests in this run" })).getAllByRole("listitem");
    expect(within(pulls[0]).getByRole("link", { name: "#51 Cart badge counts items" })).toHaveAttribute(
      "href",
      "https://github.com/denkoregroup/honeybees/pull/51",
    );
    expect(pulls[0]).toHaveTextContent("checks passing · ready for you");
    expect(pulls[1]).toHaveTextContent("checks running");
    expect(pulls[1]).not.toHaveTextContent("ready for you");
    expect(screen.getByRole("list", { name: "Notes from this run" })).toHaveTextContent(/always fails/);
    expect(screen.getByRole("link", { name: "Open the run's session" })).toHaveAttribute("href", "https://claude.ai/code/session_01ExampleNotReal");
  });
});
