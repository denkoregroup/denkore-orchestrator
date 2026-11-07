/**
 * @jest-environment node
 */
import { MemoryReportStore } from "@/lib/site-health/ingest";
import { sign, SIGNATURE_HEADER } from "@/lib/webhooks/signature";
import { auditReport, findings } from "@/test-utils/site-reports";

const SECRET = "test-secret-not-real";
const PROJECT_ID = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const store = new MemoryReportStore({ "example-app": PROJECT_ID });

jest.mock("@/lib/site-health/supabase-ingest-store", () => ({
  SupabaseReportStore: jest.fn(() => store),
}));

process.env.STEP_WEBHOOK_SECRET = SECRET;

// Import after the env and mock are in place; the route reads the secret at load.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("@/app/api/audits/report/route") as typeof import("@/app/api/audits/report/route");

const report = auditReport([findings.noTitle, findings.noRobots]);

function request(body: string, signature: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set(SIGNATURE_HEADER, signature);
  return new Request("http://localhost/api/audits/report", { method: "POST", headers, body });
}

const signed = (payload: unknown) => {
  const body = JSON.stringify(payload);
  return request(body, sign(body, SECRET));
};

beforeEach(() => {
  store.reports.length = 0;
});

describe("signature", () => {
  const body = JSON.stringify({ report });

  it("accepts a correct signature", async () => {
    const res = await POST(request(body, sign(body, SECRET)));
    expect(res.status).toBe(200);
    expect(store.reports).toHaveLength(1);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const res = await POST(request(body, sign(body, "another-secret")));
    expect(res.status).toBe(401);
    expect(store.reports).toHaveLength(0);
  });

  it("rejects a signature over a different body", async () => {
    const res = await POST(request(body, sign(JSON.stringify({ report: auditReport([]) }), SECRET)));
    expect(res.status).toBe(401);
    expect(store.reports).toHaveLength(0);
  });

  it("rejects a missing signature", async () => {
    const res = await POST(request(body, null));
    expect(res.status).toBe(401);
    expect(store.reports).toHaveLength(0);
  });

  it("checks the signature before reading the body: unsigned garbage is a 401, not a 400", async () => {
    expect((await POST(request("not json", "sha256=00"))).status).toBe(401);
  });
});

describe("payload validation", () => {
  it("rejects a body that is not JSON", async () => {
    const body = "not json";
    const res = await POST(request(body, sign(body, SECRET)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid JSON" });
  });

  it("rejects any other schemaVersion, naming the field", async () => {
    const res = await POST(signed({ report: { ...report, schemaVersion: 2 } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid payload");
    expect(body.issues.map((i: { path: unknown[] }) => i.path.join("."))).toContain("report.schemaVersion");
    expect(store.reports).toHaveLength(0);
  });

  it("rejects a report with a missing field", async () => {
    const { target: _target, ...withoutTarget } = report;
    void _target;
    const res = await POST(signed({ report: withoutTarget }));
    expect(res.status).toBe(400);
  });

  it("rejects a finding with a malformed id", async () => {
    const bad = { ...report, findings: [{ ...report.findings[0], id: "nope" }] };
    expect((await POST(signed({ report: bad }))).status).toBe(400);
  });

  it("rejects unknown top-level fields", async () => {
    expect((await POST(signed({ report, extra: true }))).status).toBe(400);
  });

  it("rejects a payload with no report", async () => {
    expect((await POST(signed({ registryId: "example-app" }))).status).toBe(400);
  });
});

describe("storing", () => {
  it("stores a new report and says so", async () => {
    const res = await POST(signed({ report }));
    expect(await res.json()).toEqual({ status: "recorded", target: report.target, startedAt: report.startedAt, projectLinked: false });
    expect(store.reports).toEqual([{ projectId: null, report }]);
  });

  it("acknowledges the same report posted twice without storing it again", async () => {
    await POST(signed({ report }));
    const again = await POST(signed({ report }));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "duplicate" });
    expect(store.reports).toHaveLength(1);
  });

  it("treats a different start time for the same site as a new report", async () => {
    await POST(signed({ report }));
    await POST(signed({ report: { ...report, startedAt: "2026-11-08T10:00:00.000Z" } }));
    expect(store.reports).toHaveLength(2);
  });

  it("links the report to the project whose registry id matches", async () => {
    const res = await POST(signed({ registryId: "example-app", report }));
    expect(await res.json()).toMatchObject({ projectLinked: true });
    expect(store.reports[0].projectId).toBe(PROJECT_ID);
  });

  it("stores the report unlinked when no project has that registry id, and says so", async () => {
    const res = await POST(signed({ registryId: "not-synced-yet", report }));
    expect(await res.json()).toMatchObject({ status: "recorded", projectLinked: false });
    expect(store.reports[0].projectId).toBeNull();
  });
});

describe("configuration", () => {
  it("answers 500 when the secret is not configured", async () => {
    jest.resetModules();
    delete process.env.STEP_WEBHOOK_SECRET;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const unconfigured = require("@/app/api/audits/report/route") as typeof import("@/app/api/audits/report/route");
    const body = JSON.stringify({ report });
    const res = await unconfigured.POST(request(body, sign(body, SECRET)));
    expect(res.status).toBe(500);
    process.env.STEP_WEBHOOK_SECRET = SECRET;
  });
});

describe("proxy", () => {
  // Without this the route is redirected to /login, which happened with the tick route.
  it("does not run the login proxy on the ingest route, and still runs it on the app", async () => {
    const { config } = await import("@/proxy");
    const matches = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));
    expect(matches("/api/audits/report")).toBe(false);
    expect(matches("/api/conductor/tick")).toBe(false);
    expect(matches("/sites")).toBe(true);
    expect(matches("/api/other")).toBe(true);
  });
});
