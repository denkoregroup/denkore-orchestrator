/**
 * pnpm audit:run --url https://example.com [--max-pages 25] [--out audit-report.json] [--fail-on warn|fail]
 * pnpm audit:run --project <registryId>   (uses the registry entry's audits block)
 *
 * Crawls a few same-site pages, runs deterministic checks, prints a short
 * summary and writes the findings JSON. No model calls, no credentials.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { exitCodeFor, runAudit, summarize, type FailOn } from "../lib/audits/run";
import { loadRegistry } from "../lib/registry/loader";

const USAGE =
  "Usage: pnpm audit:run (--url <https://...> | --project <registryId>) [--max-pages <n>] [--out <file>] [--fail-on warn|fail]";

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(name.startsWith("--") ? `${name} needs a value` : `Unexpected argument: ${name}`);
    }
    flags.set(name.slice(2), value);
    i++;
  }
  for (const name of flags.keys()) {
    if (!["url", "project", "max-pages", "out", "fail-on"].includes(name)) throw new Error(`Unknown option --${name}`);
  }
  if (flags.has("url") === flags.has("project")) throw new Error("Pass exactly one of --url or --project");
  const failOn = (flags.get("fail-on") ?? "never") as FailOn;
  if (!["never", "warn", "fail"].includes(failOn)) throw new Error("--fail-on must be warn or fail");
  const maxPagesRaw = flags.get("max-pages");
  const maxPages = maxPagesRaw === undefined ? undefined : Number(maxPagesRaw);
  if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500)) {
    throw new Error("--max-pages must be a whole number from 1 to 500");
  }
  return { url: flags.get("url"), project: flags.get("project"), maxPages, out: flags.get("out") ?? "audit-report.json", failOn };
}

async function main() {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    console.error(USAGE);
    process.exit(2);
  }

  let url = args.url;
  let maxPages = args.maxPages;
  let ignorePaths: string[] | undefined;
  if (args.project) {
    const entry = (await loadRegistry()).get(args.project);
    if (!entry) throw new Error(`No registry entry "${args.project}"`);
    if (!entry.audits) throw new Error(`Registry entry "${args.project}" has no audits block`);
    url = entry.audits.url;
    maxPages ??= entry.audits.maxPages;
    ignorePaths = entry.audits.ignorePaths;
  }

  const report = await runAudit({ url: url!, maxPages, ignorePaths });
  const out = path.resolve(args.out);
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(summarize(report));
  console.log(`\nFindings written to ${out}`);
  process.exit(exitCodeFor(report, args.failOn));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "audit failed");
  process.exit(2);
});
