import { render, screen } from "@testing-library/react";
import { GateCard } from "../gate-card";
import { SAMPLE_GATE } from "@/lib/approvals/sample";

describe("GateCard", () => {
  it("leads with the plain-language summary", () => {
    render(<GateCard gate={SAMPLE_GATE} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(SAMPLE_GATE.headline);
    expect(screen.getByText(SAMPLE_GATE.summary)).toBeVisible();
  });

  it("keeps technical detail collapsed by default", () => {
    const { container } = render(<GateCard gate={SAMPLE_GATE} />);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Technical details").tagName).toBe("SUMMARY");
    expect(screen.getByText(SAMPLE_GATE.technical.commitSha)).not.toBeVisible();
  });
});
