/**
 * @jest-environment node
 */
import { REVIEWED_SHA, reviewReport, runReport } from "@/test-utils/run-reports";
import { runReportSchema } from "../schema";

const ok = (value: unknown) => runReportSchema.safeParse(value).success;

describe("runReportSchema", () => {
  it("accepts a full report and one with no PRs, notes or decisions", () => {
    expect(ok(runReport())).toBe(true);
    expect(ok(runReport({ pulls: [], notes: [], decisions: [], sessionUrl: undefined }))).toBe(true);
  });

  it("accepts only schemaVersion 1", () => {
    expect(ok({ ...runReport(), schemaVersion: 2 })).toBe(false);
  });

  it("refuses fields it doesn't know, at the top and inside PRs and decisions", () => {
    expect(ok({ ...runReport(), html: "<b>x</b>" })).toBe(false);
    expect(ok(runReport({ pulls: [{ ...runReport().pulls[0], url: "https://evil.example" } as never] }))).toBe(false);
    expect(ok(runReport({ decisions: [{ number: 1, question: "Q?", link: "https://evil.example" } as never] }))).toBe(false);
  });

  it("only takes a claude.ai/code session address as a link", () => {
    expect(ok(runReport({ sessionUrl: "https://claude.ai/code/session_x" }))).toBe(true);
    for (const bad of [
      "http://claude.ai/code/session_x",
      "https://claude.ai.evil.example/code/x",
      "https://evil.example/code/x",
      "https://claude.ai/settings",
      "javascript:alert(1)",
    ]) {
      expect(ok(runReport({ sessionUrl: bad }))).toBe(false);
    }
  });

  it("checks the registry id and repo shapes", () => {
    expect(ok(runReport({ registryId: "HoneyBees" }))).toBe(false);
    expect(ok(runReport({ repo: "honeybees" }))).toBe(false);
  });

  it("refuses a run that finished before it started", () => {
    expect(ok(runReport({ finishedAt: "2026-11-24T11:00:00.000Z" }))).toBe(false);
  });

  it("refuses two decisions with the same number", () => {
    expect(ok(runReport({ decisions: [{ number: 1, question: "A?" }, { number: 1, question: "B?" }] }))).toBe(false);
  });

  it("caps sizes so a report stays small", () => {
    expect(ok(runReport({ summary: "x".repeat(601) }))).toBe(false);
    expect(ok(runReport({ notes: Array.from({ length: 6 }, (_, i) => `note ${i}`) }))).toBe(false);
    expect(ok(runReport({ decisions: Array.from({ length: 11 }, (_, i) => ({ number: i + 1, question: "Q?" })) }))).toBe(false);
    expect(ok(runReport({ summary: "   " }))).toBe(false);
  });

  describe("a Conductor review report", () => {
    const pull = (review: unknown) => ({ ...reviewReport().pulls[0], review }) as never;

    it("accepts a verdict on every PR, and none with no PRs", () => {
      expect(ok(reviewReport())).toBe(true);
      expect(ok(reviewReport({ pulls: [] }))).toBe(true);
    });

    it("needs a reason unless the PR is ready", () => {
      expect(ok(reviewReport({ pulls: [pull({ verdict: "changes-needed", headSha: REVIEWED_SHA })] }))).toBe(false);
      expect(ok(reviewReport({ pulls: [pull({ verdict: "changes-needed", reason: "A test fails", headSha: REVIEWED_SHA })] }))).toBe(true);
    });

    it("takes only its three verdicts and a full commit sha", () => {
      expect(ok(reviewReport({ pulls: [pull({ verdict: "merge-it", headSha: REVIEWED_SHA })] }))).toBe(false);
      expect(ok(reviewReport({ pulls: [pull({ verdict: "ready", headSha: "abc1234" })] }))).toBe(false);
      expect(ok(reviewReport({ pulls: [pull({ verdict: "ready", headSha: REVIEWED_SHA, url: "https://evil.example" })] }))).toBe(false);
    });

    it("has a verdict on every PR, and asks nothing", () => {
      expect(ok(reviewReport({ pulls: [pull(undefined)] }))).toBe(false);
      expect(ok(reviewReport({ decisions: [{ number: 1, question: "Merge #51?" }] }))).toBe(false);
    });

    it("is the only report that carries verdicts", () => {
      expect(ok(runReport({ pulls: [pull({ verdict: "ready", headSha: REVIEWED_SHA })] }))).toBe(false);
    });
  });
});
