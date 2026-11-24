/**
 * @jest-environment node
 *
 * Runs the real scripts/post-run-report.mjs against a local HTTP server that
 * runs the real run-report handler with the in-memory store.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { MemoryRunReportStore, createRunReportHandler } from "@/lib/run-reports/ingest";
import { runReport } from "@/test-utils/run-reports";

jest.setTimeout(30_000);

const SECRET = "run-report-script-secret-not-real";
const SCRIPT = path.join(process.cwd(), "scripts", "post-run-report.mjs");

const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

async function serve(handle: (request: Request) => Promise<Response>) {
  const hits: string[] = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    hits.push(req.url ?? "");
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const response = await handle(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, body: Buffer.concat(chunks) }));
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits };
}

function runScript(env: Record<string, string | undefined>) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", RUN_REPORT_RETRY_DELAY_MS: "10", RUN_REPORT_TIMEOUT_MS: "5000", ...env },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ code, output }));
  });
}

function realHandler() {
  const store = new MemoryRunReportStore();
  const handle = createRunReportHandler({
    secret: SECRET,
    repoOf: async () => new Map([["honeybees", "denkoregroup/honeybees"]]),
    store: () => store,
  });
  return { store, handle };
}

describe("scripts/post-run-report.mjs", () => {
  it("signs the report and sends it to the run-report route on the tick URL's app", async () => {
    const { store, handle } = realHandler();
    const { origin, hits } = await serve(handle);
    const result = await runScript({
      REPORT_JSON: JSON.stringify(runReport()),
      CONDUCTOR_TICK_URL: `${origin}/api/conductor/tick`,
      STEP_WEBHOOK_SECRET: SECRET,
    });
    expect(result.code).toBe(0);
    expect(hits).toEqual(["/api/conductor/run-report"]);
    expect(store.reports).toEqual([runReport()]);
    expect(result.output).toContain('"status":"recorded"');
    expect(result.output).not.toContain(SECRET);
  });

  it("uses RUN_REPORT_URL when it is set", async () => {
    const { handle } = realHandler();
    const { origin, hits } = await serve(handle);
    const result = await runScript({
      REPORT_JSON: JSON.stringify(runReport()),
      RUN_REPORT_URL: `${origin}/custom/path`,
      CONDUCTOR_TICK_URL: "https://ignored.example/api/conductor/tick",
      STEP_WEBHOOK_SECRET: SECRET,
    });
    expect(result.code).toBe(0);
    expect(hits).toEqual(["/custom/path"]);
  });

  it("fails, printing the app's reasons, when the report is invalid", async () => {
    const { store, handle } = realHandler();
    const { origin } = await serve(handle);
    const result = await runScript({
      REPORT_JSON: JSON.stringify({ ...runReport(), schemaVersion: 2 }),
      CONDUCTOR_TICK_URL: `${origin}/api/conductor/tick`,
      STEP_WEBHOOK_SECRET: SECRET,
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain("status 400");
    expect(result.output).toContain("schemaVersion");
    expect(store.reports).toHaveLength(0);
  });

  it("stops before sending when the report isn't JSON or the setup is missing", async () => {
    for (const [env, message] of [
      [{ REPORT_JSON: "not json", CONDUCTOR_TICK_URL: "https://app.example/api/conductor/tick", STEP_WEBHOOK_SECRET: SECRET }, "REPORT_JSON is not valid JSON."],
      [{ REPORT_JSON: "[1]", CONDUCTOR_TICK_URL: "https://app.example/api/conductor/tick", STEP_WEBHOOK_SECRET: SECRET }, "REPORT_JSON must be a JSON object."],
      [{ REPORT_JSON: "{}", CONDUCTOR_TICK_URL: "https://app.example/api/conductor/tick" }, "STEP_WEBHOOK_SECRET is not set."],
      [{ REPORT_JSON: "{}", STEP_WEBHOOK_SECRET: SECRET }, "Set RUN_REPORT_URL, or CONDUCTOR_TICK_URL"],
      [{ REPORT_JSON: "{}", RUN_REPORT_URL: "http://app.example/x", STEP_WEBHOOK_SECRET: SECRET }, "Only https addresses are allowed"],
    ] as const) {
      const result = await runScript(env);
      expect(result.code).toBe(1);
      expect(result.output).toContain(message);
    }
  });
});
