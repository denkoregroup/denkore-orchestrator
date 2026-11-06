/**
 * @jest-environment node
 */
import { RUN_STATES } from "@/lib/state-machine/states";
import { STEP_NAMES } from "@/lib/step-runner/types";
import { actorLabel, eventDescription, eventKindLabel, RUN_STATE_LABELS, STEP_LABELS } from "../labels";

describe("run state labels", () => {
  it("has a label for every run state and nothing else", () => {
    expect(Object.keys(RUN_STATE_LABELS).sort()).toEqual([...RUN_STATES].sort());
  });

  it.each(RUN_STATES)("labels %s with non-empty text", (state) => {
    expect(RUN_STATE_LABELS[state].trim()).not.toBe("");
  });

  it("has a label for every step", () => {
    expect(Object.keys(STEP_LABELS).sort()).toEqual([...STEP_NAMES].sort());
  });
});

describe("eventKindLabel", () => {
  it("labels known kinds and passes unknown kinds through", () => {
    expect(eventKindLabel("run.created")).toBe("Run created");
    expect(eventKindLabel("something.new")).toBe("something.new");
  });
});

describe("eventDescription and actorLabel", () => {
  it("names the new stage for state changes", () => {
    expect(eventDescription("run.state_changed", { from: "queued", to: "spec" })).toBe("Now: Writing the plan");
    expect(eventDescription("run.state_changed", { to: "nonsense" })).toBe("Run moved to a new stage");
  });

  it("gives the reason for an escalation", () => {
    expect(eventDescription("conductor.escalated", { reason: "The plan step failed." })).toBe(
      "Needs your attention: The plan step failed.",
    );
    expect(eventDescription("conductor.escalated", {})).toBe("Needs your attention");
  });

  it("describes actors in words", () => {
    expect(actorLabel("owner:6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c")).toBe("You");
    expect(actorLabel("system")).toBe("System");
    expect(actorLabel("conductor")).toBe("Conductor");
    expect(actorLabel("custom-bot")).toBe("custom-bot");
  });
});
