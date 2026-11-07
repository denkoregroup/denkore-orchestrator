/**
 * @jest-environment node
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createReportHandler, MemoryReportStore } from "@/lib/site-health/ingest";
import { verifySignature } from "@/lib/webhooks/signature";
import { auditReport, findings } from "@/test-utils/site-reports";
import { buildPostRequest, parsePostUrl, postReport, SIGNATURE_HEADER } from "@/lib/audits/post";

const SECRET = "post-test-secret-not-real";
const report = auditReport([findings.noTitle, findings.noRobots]);

describe("parsePostUrl", () => {
  it.each([
    "https://app.example/api/audits/report",
    "http://localhost:3000/api/audits/report",
  ])("accepts %s", (raw) => {
    expect(parsePostUrl(raw).href).toBe(raw);
  });

  it.each([
    ["plain http to a real host", "http://app.example/api/audits/report"],
    ["http to a look-alike host", "http://localhost.evil.example/x"],
    ["not a web address", "ftp://app.example/x"],
  ])("refuses %s", (_name, raw) => {
    expect(() => parsePostUrl(raw)).toThrow(/only sends to https/);
  });

  it("refuses something that is not a URL", () => {
    expect(() => parsePostUrl("app.example/api")).toThrow(/needs a full address/);
  });
});

describe("buildPostRequest", () => {
  it("signs the exact body in the same scheme the app verifies", () => {
    const { body, headers } = buildPostRequest({ report, registryId: "example-app", secret: SECRET });
    expect(JSON.parse(body)).toEqual({ registryId: "example-app", report });
    expect(verifySignature(body, headers[SIGNATURE_HEADER], SECRET)).toBe(true);
    expect(verifySignature(body, headers[SIGNATURE_HEADER], "another-secret")).toBe(false);
  });

  it("leaves registryId out for a plain --url audit", () => {
    expect(Object.keys(JSON.parse(buildPostRequest({ report, secret: SECRET }).body))).toEqual(["report"]);
  });

  it("never puts the secret in what it sends", () => {
    const { body, headers } = buildPostRequest({ report, secret: SECRET });
    expect(body + JSON.stringify(headers)).not.toContain(SECRET);
  });
});

describe("postReport against the real ingest handler", () => {
  const servers: http.Server[] = [];
  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  });

  async function serve(secret: string, store = new MemoryReportStore({ "example-app": "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d" }), respond?: (res: http.ServerResponse) => void) {
    const handle = createReportHandler({ secret, store: () => store });
    const server = http.createServer(async (req, res) => {
      if (respond) return respond(res);
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
    return { url: new URL(`http://localhost:${(server.address() as AddressInfo).port}/api/audits/report`), store };
  }

  it("stores the report, then reports a repeat as already stored", async () => {
    const { url, store } = await serve(SECRET);
    const request = buildPostRequest({ report, registryId: "example-app", secret: SECRET });
    expect(await postReport(url, request)).toEqual({ status: "recorded", projectLinked: true });
    expect(await postReport(url, request)).toEqual({ status: "duplicate", projectLinked: true });
    expect(store.reports).toHaveLength(1);
  });

  it("fails with the server's answer when the secret is wrong, without printing either secret", async () => {
    const { url, store } = await serve(SECRET);
    const error = await postReport(url, buildPostRequest({ report, secret: "wrong-secret-not-real" })).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/refused the report \(401\).*invalid signature/);
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).not.toContain("wrong-secret-not-real");
    expect(store.reports).toHaveLength(0);
  });

  it("fails with the reason when the app rejects the report", async () => {
    const { url } = await serve(SECRET);
    const bad = buildPostRequest({ report: { ...report, schemaVersion: 2 } as never, secret: SECRET });
    await expect(postReport(url, bad)).rejects.toThrow(/\(400\).*schemaVersion/);
  });

  it("does not follow a redirect, so a signed body is never sent somewhere else", async () => {
    const other = await serve(SECRET);
    const { url } = await serve(SECRET, undefined, (res) => {
      res.writeHead(307, { location: other.url.href });
      res.end();
    });
    await expect(postReport(url, buildPostRequest({ report, secret: SECRET }))).rejects.toThrow(/Could not send the report/);
    expect(other.store.reports).toHaveLength(0);
  });

  it("says so when nothing is listening", async () => {
    const { url } = await serve(SECRET);
    await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
    await expect(postReport(url, buildPostRequest({ report, secret: SECRET }))).rejects.toThrow(/Could not send the report to http:\/\/localhost:\d+: .*ECONNREFUSED/);
  });
});
