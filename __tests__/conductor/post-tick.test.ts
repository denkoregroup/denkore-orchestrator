/**
 * @jest-environment node
 *
 * Runs the real scripts/post-tick.mjs against a local HTTP server that runs
 * the real tick handler, with the in-memory store and a run whose build step
 * is hung past its deadline.
 */
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { advanceRun, type ConductorDeps } from "@/lib/conductor/advance";
import { STEP_DEADLINE_SECONDS } from "@/lib/conductor/decide";
import { MemoryConductorStore } from "@/lib/conductor/memory-store";
import { createTickHandler } from "@/lib/conductor/tick";
import { loadRegistry } from "@/lib/registry/loader";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import { EXAMPLE_REGISTRY_DIR } from "@/test-utils/registry";

jest.setTimeout(30_000);

const SECRET = "tick-test-secret-not-real";
const SIGNATURE = `sha256=${createHmac("sha256", SECRET).update("{}").digest("hex")}`;
const SCRIPT = path.join(process.cwd(), "scripts", "post-tick.mjs");

const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

/** A local server: `handle` gets a Web Request, like the route does. */
async function serve(handle: (request: Request) => Promise<Response>) {
  const hits: string[] = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    hits.push(req.url ?? "");
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const response = await handle(
      new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, body: Buffer.concat(chunks) }),
    );
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "text/plain" });
    res.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/conductor/tick`, hits };
}

/** Runs the script with only the env it is given (no proxy, no inherited secrets). */
function runScript(env: Record<string, string | undefined>) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", TICK_RETRY_DELAY_MS: "10", TICK_TIMEOUT_MS: "5000", ...env },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function conductor() {
  const registry = await loadRegistry(EXAMPLE_REGISTRY_DIR);
  const store = new MemoryConductorStore();
  const deps: ConductorDeps = {
    store,
    now: store.now,
    registryEntry: async (id) => registry.get(id),
    runnerFor: ({ attempt, entry }) => new GitHubActionsRunner({ repo: entry.repo, workflow: "step.yml", attempt }),
  };
  // A run whose build step was dispatched and never reported back.
  const runId = store.addRun({ state: "build_test" });
  await advanceRun(runId, deps);
  const hung = store.latestStep(runId).stepKey;
  store.advanceClock(STEP_DEADLINE_SECONDS + 1);
  const handler = createTickHandler({
    secret: SECRET,
    listActiveRunIds: (n) => store.listActiveRunIds(n),
    advance: (id) => advanceRun(id, deps),
  });
  return { store, runId, hung, handler };
}

const timedOutEvents = (store: MemoryConductorStore) => store.events.filter((e) => e.kind === "conductor.step_timed_out");

describe("scripts/post-tick.mjs", () => {
  it("with the right secret: exits 0, prints the summary, and the hung step is failed", async () => {
    const c = await conductor();
    const server = await serve(c.handler);
    const { code, output } = await runScript({ TICK_URL: server.url, STEP_WEBHOOK_SECRET: SECRET });

    expect(code).toBe(0);
    expect(output).toContain("status 200");
    expect(JSON.parse(output.split("\n")[1])).toMatchObject({ checked: 1, advanced: 1, stepsTimedOut: 1 });
    expect(c.store.steps.find((s) => s.stepKey === c.hung)!.status).toBe("failed");
    expect(c.store.latestStep(c.runId)).toMatchObject({ attempt: 2, status: "dispatched" });
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain(SIGNATURE);
  });

  it("with the wrong secret: exits non-zero and nothing changes", async () => {
    const c = await conductor();
    const server = await serve(c.handler);
    const { code, output } = await runScript({ TICK_URL: server.url, STEP_WEBHOOK_SECRET: "wrong-secret" });

    expect(code).not.toBe(0);
    expect(output).toContain("status 401");
    expect(server.hits).toHaveLength(1); // a 4xx is not retried
    expect(timedOutEvents(c.store)).toHaveLength(0);
    expect(c.store.latestStep(c.runId)).toMatchObject({ stepKey: c.hung, status: "dispatched" });
  });

  it.each([
    ["TICK_URL", { STEP_WEBHOOK_SECRET: SECRET }],
    ["STEP_WEBHOOK_SECRET", { TICK_URL: "http://127.0.0.1:9/api/conductor/tick" }],
  ])("exits non-zero when %s is missing, without sending anything", async (name, env) => {
    const { code, output } = await runScript(env);
    expect(code).not.toBe(0);
    expect(output).toContain(`${name} is not set.`);
    expect(output).not.toContain(SECRET);
  });

  it("retries a 500 once, then exits non-zero", async () => {
    const server = await serve(async () => new Response('{"error":"database down"}', { status: 500 }));
    const { code, output } = await runScript({ TICK_URL: server.url, STEP_WEBHOOK_SECRET: SECRET });
    expect(code).not.toBe(0);
    expect(server.hits).toHaveLength(2);
    expect(output.match(/status 500/g)).toHaveLength(2);
  });

  it("succeeds when the retry after a 500 succeeds", async () => {
    let calls = 0;
    const server = await serve(async () =>
      ++calls === 1 ? new Response("busy", { status: 503 }) : Response.json({ checked: 0, advanced: 0, stepsTimedOut: 0, runs: [] }),
    );
    const { code } = await runScript({ TICK_URL: server.url, STEP_WEBHOOK_SECRET: SECRET });
    expect(code).toBe(0);
    expect(server.hits).toHaveLength(2);
  });

  it("retries a network error once, then exits non-zero", async () => {
    // Nothing listens on port 9 (discard) on the loopback interface in CI.
    const { code, output } = await runScript({ TICK_URL: "http://127.0.0.1:9/api/conductor/tick", STEP_WEBHOOK_SECRET: SECRET });
    expect(code).not.toBe(0);
    expect(output.match(/network error/g)).toHaveLength(2);
  });

  it("sends exactly {} signed with the shared secret, and never prints them even if echoed back", async () => {
    let received: { body: string; signature: string | null } | null = null;
    const server = await serve(async (request) => {
      received = { body: await request.text(), signature: request.headers.get("x-denkore-signature") };
      return new Response(`you sent ${received.signature} with ${SECRET}`, { status: 200 });
    });
    const { code, output } = await runScript({ TICK_URL: server.url, STEP_WEBHOOK_SECRET: SECRET });

    expect(code).toBe(0);
    expect(received).toEqual({ body: "{}", signature: SIGNATURE });
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain(SIGNATURE);
    expect(output).toContain("[redacted]");
  });
});
