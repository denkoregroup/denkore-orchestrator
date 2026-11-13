/**
 * @jest-environment node
 *
 * Runs the real scripts/audit-schedule.ts against a temporary registry whose sites cannot be
 * reached (names under .invalid never resolve), and a local server running the real ingest handler.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { parseRegistryEntry } from "@/lib/registry";
import { createReportHandler, MemoryReportStore } from "@/lib/site-health/ingest";
import { EXAMPLE_REGISTRY_DIR } from "@/test-utils/registry";

jest.setTimeout(120_000);

const SECRET = "schedule-cli-secret-not-real";
const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

async function ingest() {
  const store = new MemoryReportStore({ "site-a": "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d", "site-b": "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e" });
  const handle = createReportHandler({ secret: SECRET, store: () => store });
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const response = await handle(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: Buffer.concat(chunks) }));
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: `http://localhost:${(server.address() as AddressInfo).port}/api/audits/report`, store };
}

/** A registry directory: each [id, auditsUrl | null] becomes an entry (null: no audits block). */
async function registryOf(entries: Array<[string, string | null]>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "audit-schedule-"));
  const sample = parseRegistryEntry(await readFile(path.join(EXAMPLE_REGISTRY_DIR, "example-app.yaml"), "utf8"));
  for (const [id, url] of entries) {
    const entry: Record<string, unknown> = { ...sample, id };
    if (url === null) delete entry.audits;
    else entry.audits = { url };
    await writeFile(path.join(dir, `${id}.yaml`), stringify(entry));
  }
  return dir;
}

function run(args: string[], env: Record<string, string | undefined>) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ["-r", "ts-node/register", path.join("scripts", "audit-schedule.ts"), ...args], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", TS_NODE_PROJECT: "scripts/tsconfig.json", ...env },
      cwd: process.cwd(),
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ code, output }));
  });
}

describe("audit:schedule", () => {
  it("posts a report for every site that has an audits block, even unreachable ones, and exits non-zero", async () => {
    const { url, store } = await ingest();
    const registry = await registryOf([
      ["site-a", "https://a.denkore-test.invalid"],
      ["site-b", "https://b.denkore-test.invalid"],
      ["no-audits", null],
    ]);
    const { code, output } = await run(["--registry", registry], { AUDIT_REPORT_URL: url, STEP_WEBHOOK_SECRET: SECRET });

    expect(code).toBe(1);
    // Two reports were posted, one per site with an audits block, each a single Site unreachable finding.
    expect(store.reports).toHaveLength(2);
    for (const { report } of store.reports) {
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]).toMatchObject({ check: "site.unreachable", severity: "warn" });
    }
    expect(store.reports.every((r) => r.projectId !== null)).toBe(true);
    expect(output).toMatch(/UNREACHABLE site-a/);
    expect(output).toMatch(/UNREACHABLE site-b/);
    expect(output).toMatch(/skipped\s+no-audits: no audits block/);
    expect(output).toMatch(/2 of 2 sites failed/);
    expect(output).not.toContain(SECRET);
  });

  it("fails the job, but still tries every site, when the app refuses the reports", async () => {
    const { url, store } = await ingest();
    const registry = await registryOf([["site-a", "https://a.denkore-test.invalid"], ["site-b", "https://b.denkore-test.invalid"]]);
    const { code, output } = await run(["--registry", registry], { AUDIT_REPORT_URL: url, STEP_WEBHOOK_SECRET: "wrong-secret-not-real" });
    expect(code).toBe(1);
    expect(store.reports).toHaveLength(0);
    expect(output).toMatch(/FAILED\s+site-a: the report was not stored: .*\(401\)/);
    expect(output).toMatch(/FAILED\s+site-b: the report was not stored/);
    expect(output).not.toContain("wrong-secret-not-real");
  });

  it.each([
    ["no report address", { STEP_WEBHOOK_SECRET: SECRET }, /Missing AUDIT_REPORT_URL/],
    ["no secret", { AUDIT_REPORT_URL: "https://app.example/api/audits/report" }, /Missing STEP_WEBHOOK_SECRET/],
    ["a plain http address", { AUDIT_REPORT_URL: "http://app.example/api/audits/report", STEP_WEBHOOK_SECRET: SECRET }, /only sends to https/],
  ])("refuses to start with %s (exit 2)", async (_name, env, message) => {
    const registry = await registryOf([["site-a", "https://a.denkore-test.invalid"]]);
    const { code, output } = await run(["--registry", registry], env);
    expect(code).toBe(2);
    expect(output).toMatch(message);
  });

  it("refuses to start when no registry entry has an audits block (exit 2)", async () => {
    const registry = await registryOf([["no-audits", null]]);
    const { code, output } = await run(["--registry", registry], { AUDIT_REPORT_URL: "https://app.example/api/audits/report", STEP_WEBHOOK_SECRET: SECRET });
    expect(code).toBe(2);
    expect(output).toMatch(/nothing to audit/);
  });
});
