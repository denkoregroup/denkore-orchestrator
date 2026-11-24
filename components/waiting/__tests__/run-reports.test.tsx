import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { LatestRunReport } from "@/lib/data/run-reports";
import { ANSWER_MESSAGES } from "@/lib/run-reports/answer-copy";
import { runReport } from "@/test-utils/run-reports";

const answerDecisionAction = jest.fn();
jest.mock("@/app/(app)/waiting/actions", () => ({ answerDecisionAction: (...args: unknown[]) => answerDecisionAction(...args) }));

import { LatestRuns, RunDecisions } from "../run-reports";

const REPORT_ID = "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60";
const latest = (overrides: Parameters<typeof runReport>[0] = {}, answers: LatestRunReport["answers"] = {}): LatestRunReport => {
  const report = runReport(overrides);
  return { id: REPORT_ID, report, receivedAt: report.finishedAt, answers };
};

beforeEach(() => answerDecisionAction.mockReset());

describe("RunDecisions", () => {
  it("renders nothing when no run raised a decision", () => {
    const { container } = render(<RunDecisions reports={[latest({ decisions: [] })]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each run's numbered decisions with a way to answer each one here", () => {
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
    expect(within(within(cards[0]).getByRole("list", { name: "Options for decision 1" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Yes",
      "US only",
    ]);
    expect(within(cards[0]).getByRole("textbox", { name: "Your answer to 1" })).toBeVisible();
    expect(within(cards[0]).getByRole("textbox", { name: "Your answer to 2" })).toBeVisible();
    const link = within(cards[0]).getByRole("link", { name: "Open the run's session" });
    expect(link).toHaveAttribute("href", "https://claude.ai/code/session_01ExampleNotReal");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    expect(within(cards[1]).queryByRole("link")).toBeNull();
    expect(within(cards[1]).getByRole("textbox", { name: "Your answer to 1" })).toBeVisible();
  });

  it("shows an answered decision's answer instead of a form, and counts only the open ones", () => {
    render(<RunDecisions reports={[latest({}, { 1: { answer: "US only", answeredAt: "2026-11-24T15:00:00.000Z" } })]} />);
    expect(screen.getByRole("region", { name: "Decisions from your runs (1)" })).toBeVisible();
    expect(screen.getByText("US only", { selector: "p" })).toHaveTextContent("Your answer: US only · Nov 24, 2026, 10:00 AM ET");
    expect(screen.queryByRole("textbox", { name: "Your answer to 1" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Your answer to 2" })).toBeVisible();
  });

  it("fills the box from an option, sends the decision, and shows what the app said", async () => {
    answerDecisionAction.mockResolvedValue({ status: "success", message: ANSWER_MESSAGES.sent("honeybees") });
    render(<RunDecisions reports={[latest()]} />);
    const send = screen.getAllByRole("button", { name: "Send" })[0];
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "US only" }));
    expect(screen.getByRole("textbox", { name: "Your answer to 1" })).toHaveValue("US only");
    expect(screen.getByRole("button", { name: "US only" })).toHaveAttribute("aria-pressed", "true");
    expect(send).toBeEnabled();
    await act(async () => fireEvent.submit(send.closest("form")!));

    expect(answerDecisionAction).toHaveBeenCalledTimes(1);
    const data = answerDecisionAction.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data.entries())).toEqual({ registryId: "honeybees", runReportId: REPORT_ID, decisionNumber: "1", answer: "US only" });
    expect(await screen.findByText(ANSWER_MESSAGES.sent("honeybees"))).toBeVisible();
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
