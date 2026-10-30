/**
 * @jest-environment node
 */
import { sign, SIGNATURE_HEADER, verifySignature } from "@/lib/webhooks/signature";
import { MemoryStepCompletionStore } from "@/lib/webhooks/step-complete";

const SECRET = "test-secret-not-real";
const store = new MemoryStepCompletionStore();

jest.mock("@/lib/supabase/step-completion-store", () => ({
  SupabaseStepCompletionStore: jest.fn(() => store),
}));

process.env.STEP_WEBHOOK_SECRET = SECRET;

// Import after the env and mock are in place; the route reads the secret at load.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("@/app/api/webhooks/step-complete/route") as typeof import("@/app/api/webhooks/step-complete/route");

const payload = {
  runId: "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c",
  stepKey: "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c:spec:1",
  step: "spec",
  output: {
    status: "succeeded",
    result: { summary: "Spec drafted" },
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    costUsd: 0.42,
    sessionId: "session-abc",
  },
};

function request(body: string, signature: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set(SIGNATURE_HEADER, signature);
  return new Request("http://localhost/api/webhooks/step-complete", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => store.records.clear());

describe("verifySignature", () => {
  const body = JSON.stringify(payload);

  it("accepts a correct signature", () => {
    expect(verifySignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["no prefix", sign(body, SECRET).slice("sha256=".length)],
    ["wrong secret", sign(body, "other-secret")],
    ["truncated", sign(body, SECRET).slice(0, -2)],
    ["one char flipped", sign(body, SECRET).replace(/.$/, (c) => (c === "0" ? "1" : "0"))],
  ])("rejects a %s signature", (_label, header) => {
    expect(verifySignature(body, header, SECRET)).toBe(false);
  });

  it("rejects when the body differs from what was signed", () => {
    expect(verifySignature(body + " ", sign(body, SECRET), SECRET)).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
  });
});

describe("POST /api/webhooks/step-complete", () => {
  it("records a correctly signed completion", async () => {
    const body = JSON.stringify(payload);
    const res = await POST(request(body, sign(body, SECRET)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded", stepKey: payload.stepKey });
    expect(store.records.size).toBe(1);
  });

  it("rejects a bad signature without recording anything", async () => {
    const body = JSON.stringify(payload);
    const res = await POST(request(body, sign(body, "wrong")));
    expect(res.status).toBe(401);
    expect(store.records.size).toBe(0);
  });

  it("rejects a missing signature", async () => {
    const res = await POST(request(JSON.stringify(payload), null));
    expect(res.status).toBe(401);
  });

  it("rejects a body tampered with after signing", async () => {
    const body = JSON.stringify(payload);
    const tampered = body.replace("0.42", "0.01");
    const res = await POST(request(tampered, sign(body, SECRET)));
    expect(res.status).toBe(401);
    expect(store.records.size).toBe(0);
  });

  it("treats a replay of the same step key as a no-op", async () => {
    const body = JSON.stringify(payload);
    const first = await POST(request(body, sign(body, SECRET)));
    expect((await first.json()).status).toBe("recorded");

    const replay = await POST(request(body, sign(body, SECRET)));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ status: "duplicate", stepKey: payload.stepKey });
    expect(store.records.size).toBe(1);
  });

  it("does not let a replay with a changed body overwrite the original", async () => {
    const body = JSON.stringify(payload);
    await POST(request(body, sign(body, SECRET)));

    const altered = JSON.stringify({ ...payload, output: { ...payload.output, costUsd: 99 } });
    const replay = await POST(request(altered, sign(altered, SECRET)));
    expect((await replay.json()).status).toBe("duplicate");
    expect(store.records.get(payload.stepKey)?.output.costUsd).toBe(0.42);
  });

  it("rejects a signed but invalid payload", async () => {
    const body = JSON.stringify({ ...payload, output: { ...payload.output, commitSha: undefined } });
    const res = await POST(request(body, sign(body, SECRET)));
    expect(res.status).toBe(400);
  });

  it("rejects signed non-JSON", async () => {
    const res = await POST(request("not json", sign("not json", SECRET)));
    expect(res.status).toBe(400);
  });
});
