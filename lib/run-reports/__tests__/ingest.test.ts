/**
 * @jest-environment node
 */
import { sign } from "@/lib/webhooks/signature";
import { runReport } from "@/test-utils/run-reports";
import { MAX_BODY_BYTES, MemoryRunReportStore, createRunReportHandler } from "../ingest";

const SECRET = "run-report-test-secret-not-real";
const URL = "http://localhost/api/conductor/run-report";

function setup(secret = SECRET) {
  const store = new MemoryRunReportStore();
  const handle = createRunReportHandler({
    secret,
    repoOf: async () => new Map([["honeybees", "denkoregroup/honeybees"], ["barzini-publishing", "denkoregroup/barzini-publishing"]]),
    store: () => store,
  });
  return { store, handle };
}

function signed(body: string, signature = sign(body, SECRET)) {
  return new Request(URL, { method: "POST", body, headers: { "x-denkore-signature": signature, "content-type": "application/json" } });
}

describe("POST /api/conductor/run-report", () => {
  it("stores a signed, valid report for a registered project", async () => {
    const { store, handle } = setup();
    const res = await handle(signed(JSON.stringify(runReport())));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded", registryId: "honeybees", startedAt: runReport().startedAt });
    expect(store.reports).toHaveLength(1);
  });

  it("acknowledges the same run sent twice without storing it again", async () => {
    const { store, handle } = setup();
    await handle(signed(JSON.stringify(runReport())));
    const res = await handle(signed(JSON.stringify(runReport({ summary: "Sent again" }))));
    expect(await res.json()).toMatchObject({ status: "duplicate" });
    expect(store.reports).toHaveLength(1);
  });

  it("refuses a missing or wrong signature before reading the body", async () => {
    const { store, handle } = setup();
    const body = JSON.stringify(runReport());
    expect((await handle(new Request(URL, { method: "POST", body }))).status).toBe(401);
    expect((await handle(signed(body, sign(body, "another-secret")))).status).toBe(401);
    expect((await handle(signed(body, sign(`${body} `, SECRET)))).status).toBe(401);
    expect(store.reports).toHaveLength(0);
  });

  it("answers 500 when the secret isn't set", async () => {
    const handle = createRunReportHandler({ secret: undefined, repoOf: async () => new Map(), store: () => new MemoryRunReportStore() });
    expect((await handle(signed("{}"))).status).toBe(500);
  });

  it("refuses a body over the size limit", async () => {
    const { handle } = setup();
    const body = JSON.stringify({ ...runReport(), pad: "x".repeat(MAX_BODY_BYTES) });
    expect((await handle(signed(body))).status).toBe(413);
  });

  it("refuses bad JSON and an invalid report, naming the problem", async () => {
    const { handle } = setup();
    expect((await handle(signed("not json"))).status).toBe(400);
    const res = await handle(signed(JSON.stringify({ ...runReport(), schemaVersion: 2 })));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("schemaVersion");
  });

  it("refuses a project that isn't registered", async () => {
    const { store, handle } = setup();
    const res = await handle(signed(JSON.stringify(runReport({ registryId: "ggrmusic-com" }))));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown project "ggrmusic-com"');
    expect(store.reports).toHaveLength(0);
  });

  it("refuses a report whose repo isn't the project's repo", async () => {
    const { store, handle } = setup();
    const res = await handle(signed(JSON.stringify(runReport({ repo: "someone/honeybees" }))));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('project "honeybees" is denkoregroup/honeybees, not someone/honeybees');
    expect(store.reports).toHaveLength(0);
  });

  it("matches the repo without regard to case", async () => {
    const { handle } = setup();
    expect((await handle(signed(JSON.stringify(runReport({ repo: "DenkoreGroup/HoneyBees" }))))).status).toBe(200);
  });
});
