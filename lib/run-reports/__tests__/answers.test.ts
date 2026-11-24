/**
 * @jest-environment node
 */
import { sign } from "@/lib/webhooks/signature";
import { MAX_REQUEST_BYTES, MemoryRunAnswerStore, answerFormSchema, answerKey, createRunAnswersHandler } from "../answers";

const SECRET = "run-answers-test-secret-not-real";
const URL = "http://localhost/api/conductor/run-answers";
const REPORT_ID = "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60";

const HONEY = {
  runStartedAt: "2026-11-24T11:42:00.000Z",
  answers: [{ number: 1, question: "Should the shipping page list international rates?", answer: "US only", answeredAt: "2026-11-24T15:00:00.000Z" }],
};

function setup(secret: string | null = SECRET) {
  const store = new MemoryRunAnswerStore({ honeybees: HONEY });
  const handle = createRunAnswersHandler({
    secret: secret ?? undefined,
    repoOf: async () => new Map([["honeybees", "denkoregroup/honeybees"], ["barzini-publishing", "denkoregroup/barzini-publishing"]]),
    store: () => store,
  });
  return { handle };
}

function signed(body: string, signature = sign(body, SECRET)) {
  return new Request(URL, { method: "POST", body, headers: { "x-denkore-signature": signature, "content-type": "application/json" } });
}

describe("answerFormSchema", () => {
  const base = { registryId: "honeybees", runReportId: REPORT_ID, decisionNumber: "1" };

  it("turns line breaks and runs of spaces into single spaces", () => {
    expect(answerFormSchema.parse({ ...base, answer: "  US only\n\nfor now  " })).toEqual({ ...base, decisionNumber: 1, answer: "US only for now" });
  });

  it("refuses an empty answer, one over 500 characters, or a bad id", () => {
    expect(answerFormSchema.safeParse({ ...base, answer: " \n " }).success).toBe(false);
    expect(answerFormSchema.safeParse({ ...base, answer: "x".repeat(501) }).success).toBe(false);
    expect(answerFormSchema.safeParse({ ...base, answer: "x".repeat(500) }).success).toBe(true);
    expect(answerFormSchema.safeParse({ ...base, runReportId: "nope", answer: "Yes" }).success).toBe(false);
    expect(answerFormSchema.safeParse({ ...base, decisionNumber: "0", answer: "Yes" }).success).toBe(false);
  });

  it("keys one answer per decision of a report", () => {
    expect(answerKey(REPORT_ID, 2)).toBe(`run.answered:${REPORT_ID}:2`);
  });
});

describe("POST /api/conductor/run-answers", () => {
  it("answers a signed request with the project's answers", async () => {
    const res = await setup().handle(signed(JSON.stringify({ registryId: "honeybees" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registryId: "honeybees", ...HONEY });
  });

  it("says there is no report yet for a registered project with none", async () => {
    const res = await setup().handle(signed(JSON.stringify({ registryId: "barzini-publishing" })));
    expect(await res.json()).toEqual({ registryId: "barzini-publishing", runStartedAt: null, answers: [] });
  });

  it("refuses a missing or wrong signature", async () => {
    const { handle } = setup();
    const body = JSON.stringify({ registryId: "honeybees" });
    expect((await handle(new Request(URL, { method: "POST", body }))).status).toBe(401);
    expect((await handle(signed(body, sign(body, "another-secret")))).status).toBe(401);
  });

  it("refuses an unregistered project, extra fields, bad JSON and a large body", async () => {
    const { handle } = setup();
    const unknown = await handle(signed(JSON.stringify({ registryId: "someone-else" })));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: 'unknown project "someone-else"' });
    expect((await handle(signed(JSON.stringify({ registryId: "honeybees", all: true })))).status).toBe(400);
    expect((await handle(signed("{"))).status).toBe(400);
    expect((await handle(signed(JSON.stringify({ registryId: "x".repeat(MAX_REQUEST_BYTES) })))).status).toBe(413);
  });

  it("is off when the secret isn't set", async () => {
    const body = JSON.stringify({ registryId: "honeybees" });
    expect((await setup(null).handle(signed(body))).status).toBe(500);
  });
});
