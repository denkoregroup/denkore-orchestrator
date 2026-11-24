import { render, screen } from "@testing-library/react";

const getHubSummary = jest.fn();
jest.mock("@/lib/data/hub", () => ({ getHubSummary: () => getHubSummary() }));

import { WaitingCount } from "../waiting-count";

describe("WaitingCount", () => {
  it("counts what waits on you across the projects", async () => {
    const pull = { repo: "denkoregroup/honeybees", number: 3, project: "honeybees", byAgent: true, stage: "ready" };
    getHubSummary.mockResolvedValue({ data: { configured: true, pulls: [pull, { ...pull, stage: "needs_fix" }], unreadable: [], notShared: [], projectCount: 1 }, reports: [], verdicts: {} });
    render(await WaitingCount());
    expect(screen.getByText("1")).toHaveTextContent("1 waiting");
  });

  it("shows nothing when the summary can't be read, so every page still loads", async () => {
    getHubSummary.mockRejectedValue(new Error("GitHub didn't answer"));
    const { container } = render(await WaitingCount());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/waiting/)).toBeNull();
  });
});
