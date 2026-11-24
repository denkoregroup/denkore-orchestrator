import { render, screen, within } from "@testing-library/react";
import type { WaitingPull } from "@/lib/data/waiting";
import { WaitingBoard } from "../waiting-board";

const base: WaitingPull = {
  project: "honeybees",
  repo: "denkoregroup/honeybees",
  number: 61,
  title: "Agent guide for this repo",
  url: "https://github.com/denkoregroup/honeybees/pull/61",
  draft: true,
  author: "dclarktech302",
  byAgent: true,
  headSha: "abc1234",
  updatedAt: "2026-11-24T18:00:00Z",
  checks: "passing",
  conflicts: false,
  stage: "ready",
  summary: "Adds an agent guide so every session follows the same rules. Docs only, no risk to the site.",
};

describe("WaitingBoard", () => {
  it("says GitHub isn't connected when there is no token", () => {
    render(<WaitingBoard data={{ configured: false }} />);
    expect(screen.getByText(/GitHub isn.t connected yet/)).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says nothing is waiting when no agent PR is open", () => {
    render(<WaitingBoard data={{ configured: true, pulls: [], unreadable: [], notShared: [], projectCount: 6 }} />);
    expect(screen.getByText("No pull request is waiting on you across your 6 projects.")).toBeVisible();
  });

  it("groups agent PRs by what they wait on and links each to GitHub with its number and title", () => {
    const pulls: WaitingPull[] = [
      base,
      { ...base, project: "barzini-publishing", repo: "denkoregroup/barzini-publishing", number: 120, checks: "failing", stage: "needs_fix", url: "https://github.com/denkoregroup/barzini-publishing/pull/120" },
      { ...base, number: 62, title: "Hero photos", checks: "running", stage: "checks_running", url: "https://github.com/denkoregroup/honeybees/pull/62" },
    ];
    render(<WaitingBoard data={{ configured: true, pulls, unreadable: [], notShared: [], projectCount: 6 }} />);

    const ready = screen.getByRole("region", { name: "Ready for your yes (1)" });
    const link = within(ready).getByRole("link", { name: "#61 Agent guide for this repo" });
    expect(link).toHaveAttribute("href", "https://github.com/denkoregroup/honeybees/pull/61");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(ready).getByText("Checks passing")).toBeVisible();
    expect(within(ready).getByText("By Claude")).toBeVisible();

    const fix = screen.getByRole("region", { name: "Needs a fix first (1)" });
    expect(within(fix).getByText("barzini-publishing")).toBeVisible();
    expect(within(fix).getByText("Checks failing")).toBeVisible();

    expect(screen.getByRole("region", { name: "Checks still running (1)" })).toBeVisible();
  });

  it("shows conflicts, and lists other people's PRs separately", () => {
    const pulls: WaitingPull[] = [
      { ...base, conflicts: true, stage: "needs_fix" },
      { ...base, number: 99, title: "Contributor work", byAgent: false, author: "ant", draft: false },
    ];
    render(<WaitingBoard data={{ configured: true, pulls, unreadable: [], notShared: [], projectCount: 6 }} />);
    expect(within(screen.getByRole("region", { name: "Needs a fix first (1)" })).getByText("Conflicts with main")).toBeVisible();
    const others = screen.getByRole("region", { name: "Other people's pull requests (1)" });
    expect(within(others).getByText("By ant")).toBeVisible();
    expect(screen.queryByRole("region", { name: /Ready for your yes/ })).toBeNull();
  });

  it("names a repo it couldn't read, and still shows the rest", () => {
    render(
      <WaitingBoard
        data={{
          configured: true,
          pulls: [base],
          unreadable: [{ project: "barzini-publishing", repo: "denkoregroup/barzini-publishing", error: "GitHub didn't answer in time" }],
          notShared: [],
          projectCount: 6,
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't read barzini-publishing (denkoregroup/barzini-publishing)");
    expect(screen.getByRole("link", { name: "#61 Agent guide for this repo" })).toBeVisible();
  });

  it("names the projects the token leaves out quietly, not as an alert", () => {
    render(
      <WaitingBoard
        data={{
          configured: true,
          pulls: [],
          unreadable: [],
          notShared: [
            { project: "dclarkdev-com", repo: "denkoregroup/dclarkdev" },
            { project: "ggrmusic-com", repo: "dclarktech302/ggrmusicgroup" },
          ],
          projectCount: 3,
        }}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Not shown, because the GitHub token doesn.t include their repos: dclarkdev-com, ggrmusic-com\./)).toBeVisible();
    expect(screen.getByText("No pull request is waiting on you across your 3 projects.")).toBeVisible();
  });

  it("shows each PR's summary under its title, and says so when an agent PR has none", () => {
    render(
      <WaitingBoard
        data={{
          configured: true,
          pulls: [base, { ...base, number: 62, summary: null, url: "https://github.com/denkoregroup/honeybees/pull/62" }, { ...base, number: 7, byAgent: false, summary: null }],
          unreadable: [],
          notShared: [],
          projectCount: 3,
        }}
      />,
    );
    expect(screen.getByText("Adds an agent guide so every session follows the same rules. Docs only, no risk to the site.")).toBeVisible();
    expect(screen.getAllByText("No summary in this pull request yet.")).toHaveLength(1);
  });
});
