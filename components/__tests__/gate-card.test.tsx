import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalsBoard } from "../approvals/approvals-board";
import { GateCard } from "../gate-card";
import { PR_REVIEW_ATTESTATION, type DecisionState } from "@/lib/approvals/decide";
import type { GateReview } from "@/lib/approvals/types";
import { gateReview, SHA_SHOWN } from "@/test-utils/fixtures";

const action = jest.fn(async (prev: DecisionState) => prev);

function renderCard(gate: GateReview) {
  return render(
    <ApprovalsBoard action={action}>
      <GateCard gate={gate} />
    </ApprovalsBoard>,
  );
}

describe("GateCard", () => {
  it("leads with the plain-language summary", () => {
    const gate = gateReview();
    renderCard(gate);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(gate.summary!.headline);
    expect(screen.getByText(gate.summary!.summary)).toBeVisible();
  });

  it("keeps technical detail collapsed when there is a summary", () => {
    const { container } = renderCard(gateReview());
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText(SHA_SHOWN)).not.toBeVisible();
  });

  it("says no summary was provided, invents none, and shows the technical details", () => {
    const { container } = renderCard(gateReview({ summary: null }));
    expect(screen.getByText(/No plain-language summary was provided/)).toBeVisible();
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText(SHA_SHOWN)).toBeVisible();
    expect(screen.queryByText("What changes")).toBeNull();
  });

  it("sends the displayed SHA as a hidden field", () => {
    const { container } = renderCard(gateReview());
    const sha = container.querySelector<HTMLInputElement>('input[type="hidden"][name="commitSha"]');
    expect(sha?.value).toBe(SHA_SHOWN);
  });

  it("for PR review, shows the PR link and enables Approve only after the box is ticked", () => {
    renderCard(gateReview({ approval: "pr_review" }));
    expect(screen.getByRole("link", { name: "Open the pull request" })).toHaveAttribute(
      "href",
      "https://github.com/denkoregroup/example-app/pull/42",
    );
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: PR_REVIEW_ATTESTATION }));
    expect(approve).toBeEnabled();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeEnabled();
  });

  it("for one-tap, needs no checkbox", () => {
    renderCard(gateReview({ approval: "one_tap" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("labels the optional note", () => {
    renderCard(gateReview());
    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
  });
});
