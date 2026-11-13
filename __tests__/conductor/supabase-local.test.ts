/**
 * @jest-environment node
 *
 * Guards the local Supabase setup: the moved migrations are the SQL that already ran in production,
 * the config reads its GitHub secrets from the environment, and the seed matches the example env file
 * and the report schema the app parses.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { auditReportSchema } from "../../lib/audits/types";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

// sha256 of supabase/sql/001-005 as they were when production applied them. A migration that has
// been applied is never edited: add a new one instead.
const MIGRATIONS: Array<[string, string]> = [
  ["20261113000001_tables.sql", "1e3a08722de64dd41b1c7eea5ceaa818b1c5f833e36e224f07f5e49922f0131c"],
  ["20261113000002_rls.sql", "b3433d2293284a88ad0a05c727c261186122f35bfc29fafef0a7f933838bd3ec"],
  ["20261113000003_functions.sql", "be5c7a790ae8ad3b69a6c8e2b5a3e91892bf18469729f3971d2c23518ea09211"],
  ["20261113000004_registry_and_audit.sql", "01bc68a75f6745381ad358276e8a1e62130095d7ce06dd80e722ca8ccd1bfb6b"],
  ["20261113000005_audit_reports.sql", "6b35b322a0106b0c8dfc5e0738ce60925f5a2596ecb29a25988593ac57ad5096"],
];

describe("supabase/migrations", () => {
  it("holds 001-005 unchanged, in the original order, then anything newer", () => {
    const files = readdirSync(path.join(root, "supabase", "migrations")).sort();
    expect(files.slice(0, MIGRATIONS.length)).toEqual(MIGRATIONS.map(([f]) => f));
    for (const [file, sha] of MIGRATIONS) {
      expect(createHash("sha256").update(readFileSync(path.join(root, "supabase", "migrations", file))).digest("hex")).toBe(sha);
    }
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(new Set(files.map((f) => f.slice(0, 14))).size).toBe(files.length);
  });

  it("no longer has supabase/sql", () => {
    expect(existsSync(path.join(root, "supabase", "sql"))).toBe(false);
  });
});

describe("supabase/config.toml", () => {
  const config = read("supabase", "config.toml");

  it("points sign-in at the local app and allows its redirects", () => {
    expect(config).toMatch(/^site_url = "http:\/\/localhost:3000"$/m);
    expect(config).toMatch(/^additional_redirect_urls = \[.*"http:\/\/localhost:3000\/\*\*".*\]$/m);
  });

  it("enables GitHub with secrets read from the environment, and keeps signups and passwords off", () => {
    const github = config.split("[auth.external.github]")[1].split(/^\[/m)[0];
    expect(github).toMatch(/^enabled = true$/m);
    expect(github).toMatch(/^client_id = "env\(GITHUB_LOCAL_CLIENT_ID\)"$/m);
    expect(github).toMatch(/^secret = "env\(GITHUB_LOCAL_SECRET\)"$/m);
    expect(config).toMatch(/^enable_signup = false$/m);
    const email = config.split("[auth.email]")[1].split(/^\[/m)[0];
    expect(email).toMatch(/^enabled = false$/m);
  });

  it("runs the seed on reset", () => {
    expect(config).toMatch(/^sql_paths = \["\.\/seed\.sql"\]$/m);
  });
});

describe("supabase/seed.sql", () => {
  const seed = read("supabase", "seed.sql");
  const OWNER = "d3c0de00-0000-4000-8000-000000000001";

  it("creates the owner DENKORE_OWNER_USER_ID names in the example env file", () => {
    expect(read(".env.example")).toContain(`DENKORE_OWNER_USER_ID=${OWNER}`);
    expect(seed.match(new RegExp(OWNER, "g"))!.length).toBeGreaterThanOrEqual(3);
  });

  it("seeds two reports for one target that the app's own schema accepts, with matching counts", () => {
    const reports = [...seed.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => auditReportSchema.parse(JSON.parse(m[1])));
    expect(reports).toHaveLength(2);
    expect(new Set(reports.map((r) => r.target)).size).toBe(1);
    for (const r of reports) {
      for (const s of ["info", "warn", "fail"] as const) expect(r.counts[s]).toBe(r.findings.filter((f) => f.severity === s).length);
    }
    const [older, newer] = reports;
    expect(older.startedAt < newer.startedAt).toBe(true);
    const olderIds = new Set(older.findings.map((f) => f.id));
    const newerIds = new Set(newer.findings.map((f) => f.id));
    // Something new, something fixed, something still open: the diff has all three to show.
    expect(newer.findings.some((f) => !olderIds.has(f.id))).toBe(true);
    expect(older.findings.some((f) => !newerIds.has(f.id))).toBe(true);
    expect(newer.findings.some((f) => olderIds.has(f.id))).toBe(true);
  });
});

describe("secrets stay out of git", () => {
  it("ignores supabase/.env and the local env file, and the example file holds no values", () => {
    expect(read("supabase", ".gitignore")).toMatch(/^\.env$/m);
    expect(read(".gitignore")).toMatch(/^\.env\*\.local$/m);
    const example = read(".env.example");
    for (const key of ["SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "GITHUB_LOCAL_SECRET", "GITHUB_LOCAL_CLIENT_ID"]) {
      for (const line of example.split("\n").filter((l) => l.replace(/^# /, "").startsWith(`${key}=`))) {
        expect(line.replace(/^# /, "")).toMatch(/^[A-Z_]+=(<[^>]*>)?$/);
      }
    }
  });
});
