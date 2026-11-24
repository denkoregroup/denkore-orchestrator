/**
 * @jest-environment node
 */
import { runReport } from "@/test-utils/run-reports";

const requireOwner = jest.fn();
const getNewestRunReport = jest.fn();
const recordRunAnswer = jest.fn();
const revalidatePath = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/data/run-reports", () => ({ getNewestRunReport: (id: string) => getNewestRunReport(id) }));
jest.mock("@/lib/run-reports/record-answer", () => ({ recordRunAnswer: (input: unknown) => recordRunAnswer(input) }));
jest.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

import { answerDecisionAction } from "@/app/(app)/waiting/actions";
import { ANSWER_MESSAGES, INITIAL_ANSWER_STATE } from "@/lib/run-reports/answer-copy";

const REPORT_ID = "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60";
const OLDER_ID = "1c7a3e9f-4d2b-4e6f-8a1b-2c3d4e5f6a70";

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  data.set("registryId", "honeybees");
  data.set("runReportId", REPORT_ID);
  data.set("decisionNumber", "1");
  data.set("answer", "US only");
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  jest.clearAllMocks();
  requireOwner.mockResolvedValue({ id: "owner-1", email: null });
  getNewestRunReport.mockResolvedValue({ id: REPORT_ID, report: runReport() });
  recordRunAnswer.mockResolvedValue({ status: "recorded" });
});

describe("answerDecisionAction", () => {
  it("stores the answer with the question the run asked, and refreshes the page", async () => {
    const state = await answerDecisionAction(INITIAL_ANSWER_STATE, form({ answer: " US only\nfor now " }));
    expect(state).toEqual({ status: "success", message: ANSWER_MESSAGES.sent("honeybees") });
    expect(getNewestRunReport).toHaveBeenCalledWith("honeybees");
    expect(recordRunAnswer).toHaveBeenCalledWith({
      ownerId: "owner-1",
      payload: {
        run_report_id: REPORT_ID,
        registry_id: "honeybees",
        decision_number: 1,
        question: "Should the shipping page list international rates?",
        answer: "US only for now",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/waiting");
  });

  it("checks the owner before anything else", async () => {
    requireOwner.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(answerDecisionAction(INITIAL_ANSWER_STATE, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(getNewestRunReport).not.toHaveBeenCalled();
    expect(recordRunAnswer).not.toHaveBeenCalled();
  });

  it("refuses an empty or too-long answer without storing it", async () => {
    for (const answer of ["   ", "x".repeat(501)]) {
      expect(await answerDecisionAction(INITIAL_ANSWER_STATE, form({ answer }))).toEqual({ status: "error", message: ANSWER_MESSAGES.invalid });
    }
    expect(recordRunAnswer).not.toHaveBeenCalled();
  });

  it("refuses an answer to an older report, a missing report, or a number the run didn't ask", async () => {
    for (const [newest, fields] of [
      [{ id: OLDER_ID, report: runReport() }, {}],
      [null, {}],
      [{ id: REPORT_ID, report: runReport() }, { decisionNumber: "7" }],
    ] as const) {
      getNewestRunReport.mockResolvedValueOnce(newest);
      expect(await answerDecisionAction(INITIAL_ANSWER_STATE, form(fields))).toEqual({ status: "error", message: ANSWER_MESSAGES.stale });
    }
    expect(recordRunAnswer).not.toHaveBeenCalled();
  });

  it("says so when the decision is already answered", async () => {
    recordRunAnswer.mockResolvedValueOnce({ status: "duplicate" });
    expect(await answerDecisionAction(INITIAL_ANSWER_STATE, form())).toEqual({ status: "error", message: ANSWER_MESSAGES.duplicate });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
