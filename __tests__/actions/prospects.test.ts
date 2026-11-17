/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditReport } from "@/test-utils/site-reports";

const requireOwner = jest.fn();
const redirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
const revalidatePath = jest.fn();
const runAudit = jest.fn();
const createFetcher = jest.fn();
const record = jest.fn();
const findReportId = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
jest.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
jest.mock("@/lib/audits/run", () => ({ runAudit: (options: unknown) => runAudit(options) }));
jest.mock("@/lib/audits/fetcher", () => ({ createFetcher: (options: unknown) => createFetcher(options) }));
jest.mock("@/lib/site-health/supabase-ingest-store", () => ({
  SupabaseReportStore: class {
    record(payload: unknown) {
      return record(payload);
    }
  },
}));
jest.mock("@/lib/site-health/queries", () => ({ findReportId: (target: string, startedAt: string) => findReportId(target, startedAt) }));

import { checkSiteAction } from "@/app/(app)/prospects/actions";
import { EMPTY_CHECK_FORM, QUICK_CHECK_TIMEOUT_MS } from "@/lib/site-check/check-form";
import { CHECK_FORM } from "@/lib/site-check/copy";

const REPORT_ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const FETCHER = { fetch: jest.fn() };
const form = (url: string) => {
  const data = new FormData();
  data.set("url", url);
  return data;
};
const run = (url: string) => checkSiteAction(EMPTY_CHECK_FORM, form(url));

let consoleError: jest.SpyInstance;

beforeEach(() => {
  for (const mock of [requireOwner, redirect, revalidatePath, runAudit, createFetcher, record, findReportId]) mock.mockReset();
  redirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  });
  requireOwner.mockResolvedValue({ id: "owner", email: null });
  createFetcher.mockReturnValue(FETCHER);
  runAudit.mockImplementation(async ({ url }: { url: string }) => auditReport([], { target: url, startedAt: "2026-11-13T10:00:00.000Z" }));
  record.mockResolvedValue({ status: "recorded", projectLinked: false });
  findReportId.mockResolvedValue(REPORT_ID);
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("checkSiteAction", () => {
  it("refuses anyone but the owner, before touching the address", async () => {
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    await expect(run("theirbusiness.com")).rejects.toThrow("NEXT_REDIRECT /login");
    expect(runAudit).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([["an ftp: address", "ftp://theirbusiness.com"], ["an address with a password", "https://user:secret@theirbusiness.com"], ["nothing", ""], ["more than 2,000 characters", `theirbusiness.com/${"a".repeat(2000)}`]])(
    "rejects %s without auditing or storing anything",
    async (_name, typed) => {
      expect(await run(typed)).toEqual({ error: CHECK_FORM.failed, value: typed });
      expect(runAudit).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("adds https:// to a bare host and audits the homepage only, with the quick 8 second timeout", async () => {
    await expect(run("theirbusiness.com")).rejects.toThrow("NEXT_REDIRECT");
    expect(createFetcher).toHaveBeenCalledWith({ timeoutMs: 8000 });
    expect(QUICK_CHECK_TIMEOUT_MS).toBe(8000);
    expect(runAudit).toHaveBeenCalledWith({ url: "https://theirbusiness.com/", maxPages: 1, fetcher: FETCHER });
  });

  it("stores the report with no registry id, then opens its site check", async () => {
    await expect(run("theirbusiness.com")).rejects.toThrow(`NEXT_REDIRECT /check/${REPORT_ID}`);
    expect(record).toHaveBeenCalledTimes(1);
    const payload = record.mock.calls[0][0] as { registryId?: string; report: { target: string } };
    expect(payload.registryId).toBeUndefined();
    expect(Object.keys(payload)).toEqual(["report"]);
    expect(payload.report.target).toBe("https://theirbusiness.com/");
    expect(findReportId).toHaveBeenCalledWith("https://theirbusiness.com/", "2026-11-13T10:00:00.000Z");
    expect(revalidatePath).toHaveBeenCalledWith("/prospects");
    expect(redirect).toHaveBeenCalledWith(`/check/${REPORT_ID}`);
  });

  it("still checks an address that belongs to a registered site", async () => {
    await expect(run("https://www.denkore.com")).rejects.toThrow(`NEXT_REDIRECT /check/${REPORT_ID}`);
    expect(runAudit).toHaveBeenCalledTimes(1);
  });

  it("shows the plain failure message and logs only the error code when the audit throws", async () => {
    runAudit.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED 203.0.113.9:443 for theirbusiness.com"), { code: "ECONNREFUSED" }));
    expect(await run("theirbusiness.com")).toEqual({ error: "We couldn't check that site. Check the address and try again.", value: "theirbusiness.com" });
    expect(consoleError).toHaveBeenCalledWith("quick site check failed:", "ECONNREFUSED");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("theirbusiness");
    expect(record).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs the error's name when it has no code, and never its message", async () => {
    runAudit.mockRejectedValue(new TypeError("secret detail"));
    await run("theirbusiness.com");
    expect(consoleError).toHaveBeenCalledWith("quick site check failed:", "TypeError");
  });

  it("fails the same way when the report cannot be stored or read back", async () => {
    record.mockRejectedValue(new Error("audit report store: insert failed: permission denied"));
    expect((await run("theirbusiness.com")).error).toBe(CHECK_FORM.failed);
    record.mockResolvedValue({ status: "recorded", projectLinked: false });
    findReportId.mockRejectedValue(new Error("findReportId: the report was stored but cannot be read back"));
    expect((await run("theirbusiness.com")).error).toBe(CHECK_FORM.failed);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps what was typed so the form can show it again", async () => {
    expect((await run("ftp://x")).value).toBe("ftp://x");
  });
});

describe("the Prospects page", () => {
  it("gives the route 60 seconds, so the form's action has time to finish", () => {
    expect(readFileSync(path.join(process.cwd(), "app", "(app)", "prospects", "page.tsx"), "utf8")).toMatch(/^export const maxDuration = 60;$/m);
  });
});
