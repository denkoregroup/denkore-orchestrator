/**
 * @jest-environment node
 *
 * Runs the real scripts/audit-run.ts. Every case here must fail before the
 * crawl starts, so none of them touches the network.
 */
import { spawn } from "node:child_process";
import path from "node:path";

jest.setTimeout(60_000);

const SECRET = "cli-test-secret-not-real";

function runCli(args: string[], env: Record<string, string | undefined> = {}) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ["-r", "ts-node/register", path.join("scripts", "audit-run.ts"), ...args], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", TS_NODE_PROJECT: "scripts/tsconfig.json", ...env },
      cwd: process.cwd(),
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ code, output }));
  });
}

describe("audit:run --post", () => {
  it("refuses a plain http address before auditing, and never prints the secret", async () => {
    const { code, output } = await runCli(["--url", "https://example.invalid", "--post", "http://app.example/api/audits/report"], {
      STEP_WEBHOOK_SECRET: SECRET,
    });
    expect(code).toBe(2);
    expect(output).toMatch(/only sends to https addresses/);
    expect(output).not.toContain(SECRET);
    expect(output).not.toMatch(/Audit of/);
  });

  it("refuses to start without STEP_WEBHOOK_SECRET", async () => {
    const { code, output } = await runCli(["--url", "https://example.invalid", "--post", "https://app.example/api/audits/report"]);
    expect(code).toBe(2);
    expect(output).toMatch(/--post needs STEP_WEBHOOK_SECRET/);
    expect(output).not.toMatch(/Audit of/);
  });

  it("needs a value for --post", async () => {
    const { code, output } = await runCli(["--url", "https://example.invalid", "--post"]);
    expect(code).toBe(2);
    expect(output).toMatch(/--post needs a value/);
  });
});
