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
    expect(eventKindLabel("conductor.step_timed_out")).toBe("A step didn’t report back in time and was stopped");
    expect(eventKindLabel("something.new")).toBe("something.new");
  });
});

describe("site fix events", () => {
  it("labels the click and the verification, and says which report verified", () => {
    expect(eventKindLabel("audit.fix_requested")).toBe("Fix started from a site report");
    expect(eventKindLabel("audit.fix_verified")).toBe("Verified by a later audit report");
    expect(eventDescription("audit.fix_verified", { report_id: "r", report_started_at: "2026-11-14T10:00:00.000Z" })).toBe("Verified by report Nov 14, 2026, 5:00 AM ET");
  });

  it("falls back to the plain label when the report's date is missing or not a date", () => {
    expect(eventDescription("audit.fix_verified", {})).toBe("Verified by a later audit report");
    expect(eventDescription("audit.fix_verified", { report_started_at: "soon" })).toBe("Verified by a later audit report");
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

describe("the overdue-audit event", () => {
  it("reads as a sentence on the Activity page, naming the site", () => {
    expect(eventDescription("audit.overdue", { registryId: "denkore-com", lastReportAt: null })).toBe("Audit overdue: no new report for denkore-com in over 2 days");
    expect(eventKindLabel("audit.overdue")).toBe("A site hasn’t been audited on schedule");
  });
  it("falls back to the kind label when the payload names no site", () => {
    expect(eventDescription("audit.overdue", {})).toBe("A site hasn’t been audited on schedule");
  });
});
