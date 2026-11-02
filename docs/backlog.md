# Backlog

Known follow-ups, deliberately not done yet.

## Carry the approval in the `approve` event

**Why:** Today a caller approves by replacing `run.gate` with `approveGate(...)`
and then sends `{ type: "approve" }`. The reducer only sees the result, so the
approval is set up outside the state machine, and nothing stops a caller from
building an approved gate by hand.

**Suggested fix:** Change the event to
`{ type: "approve"; approvedBy: string; commitSha: string }`. In the reducer,
reject it unless `commitSha` equals the gate's current SHA, then record the
approval and move forward in the same step. Remove the need to mutate the gate
before calling `transition`.

## Webhook: unknown run ID causes endless retries; step key is not checked

**Why:** A completion for a `runId` that does not exist fails the foreign key in
`record_step_completion`. The store throws, the route returns 500, and the
sender retries forever. Separately, `stepKey` is accepted as any string, so a
key from one run or step can be recorded against another.

**Suggested fix:** Return a 4xx (for example 404 or 422) when the run does not
exist, so the sender stops retrying. Reject the payload with 400 unless
`stepKey` starts with `${runId}:${step}:`.

## Pin third-party GitHub Actions by SHA and add Dependabot

**Why:** `.github/workflows/ci.yml` uses tags (`@v5`, `@v4`). A moved or
compromised tag changes what runs in CI without a diff in this repo.

**Suggested fix:** Pin each third-party action to a full commit SHA, with the
version in a trailing comment. Add `.github/dependabot.yml` covering
`github-actions` and npm so the pins and dependencies get update PRs.

## Missing tests: SQL/RLS, proxy owner check, gate re-entry

**Why:** Nothing in CI tests the database rules: the runner (`service_role`)
must not be able to approve, and `events` must stay append-only. `proxy.ts`'s
owner check has no test either. And a run that re-enters a gate with an
unchanged SHA after "request changes" gets stuck. `gates` is unique on
`(run_id, kind)`, setting the same SHA does not fire `gates_sha_changed`, so
the gate stays `changes_requested` and every new approval is rejected.

**Suggested fix:** Add a CI job that applies `supabase/sql/` to a throwaway
Postgres (or the Supabase CLI's local stack) and asserts the grants, RLS
policies, and triggers. Add a Jest test for `updateSession` with a mocked
Supabase client: owner allowed, other user and no user redirected, public paths
open. For gate re-entry, reset the gate to `pending` when the run re-enters the
gate state (a definer function the runner calls, or a trigger on `runs.state`),
then test it.

## Revisit CODEOWNERS and code-owner review

**Why:** CODEOWNERS was removed while the project has a single developer.
Code-owner review becomes useful once others contribute.

**Suggested fix:** When more developers join (expected in year 2–3), add
`.github/CODEOWNERS` for `.github/`, `supabase/sql/`, and test files. Turn on
"Require review from Code Owners" in the branch ruleset.

## Live updates with Supabase Realtime

**Why:** `/runs`, `/runs/[id]`, `/approvals` and `/audit` show data as of page
load. The owner has to refresh to see a run move or a new gate appear.

**Suggested fix:** Subscribe to `postgres_changes` on `runs`, `gates` and
`events` from a small client component, and call `router.refresh()` when a
change arrives. Realtime respects RLS, so the owner only receives their own
rows. Add the tables to the `supabase_realtime` publication in a new SQL file.

## Cancel a run

**Why:** There is no way to stop a run from the app. `cancelled` exists in the
state machine, but the owner cannot write `runs.state` (by design).

**Suggested fix:** Add a security definer SQL function `cancel_run(run_id)`
that checks the caller owns the run, checks the move is allowed (not from a
terminal state), and updates the state. The existing trigger logs it. Expose
it as a confirm-first button on `/runs/[id]`.

## Attachments on prompts

**Why:** Prompts are text only. Screenshots, briefs, or brand files have to be
described in words.

**Suggested fix:** Store files in a private Supabase Storage bucket with an
owner-only policy, keep their paths in a `run_attachments` table, and pass
signed URLs to the Conductor when it picks up the run.

## Pagination on /runs

**Why:** `/runs` shows the newest 100 runs and says so; older runs are only
reachable by URL or through the audit log.

**Suggested fix:** Keyset pagination on `(created_at, id)` with a "Load more"
button, like `/audit`.

## Manual end-to-end checklist (once the database exists)

**Why:** CI uses a fake Supabase client, and the SQL has only been run
against a local Postgres stand-in. Nothing has been checked against a real
Supabase project.

**Suggested fix:** After creating the project, applying 001–004 and setting
the env vars, walk through:

1. `pnpm registry:sync` inserts `example-app`; a second run says `unchanged`.
2. Sign in by magic link as the owner. Another email cannot sign in.
3. `/prompt`: a 5-character prompt is refused; a real one opens `/runs/[id]`
   showing "Waiting to start".
4. `/audit` shows "Run created" by "You" for that run, and the run filter works.
5. As service role, insert a gate and a succeeded step with
   `result.gateReview`. `/approvals` shows the card with the summary.
6. One-tap gate: Approve works and the card disappears with a confirmation.
7. PR-review gate: Approve stays disabled until the box is ticked; the note
   stored is the review wording.
8. Open a gate card, change the gate's `commit_sha` as service role, then
   approve: "This changed since you opened it. Refresh to see the latest."
9. Approve the same gate from two tabs: the second says "This was already
   decided."
10. As service role, try to insert into `approvals` and update `gates.status`:
    both are refused.

## Audits: store reports and diff runs

**Why:** `pnpm audit:run` writes a JSON file and forgets it. Nothing keeps
history, so there is no "new since last week" or "fixed".

**Suggested fix:** An `audit_runs` table (report JSON, target, project) and
an `audit_findings` table keyed by finding `id`, written with the secret key
from a script or route. New, still-open and fixed are then set operations on
ids between two runs.

## Audits: run on a schedule

**Why:** Audits only run when someone types the command.

**Suggested fix:** A weekly job per registry entry with an `audits` block
(Vercel Cron or a scheduled GitHub workflow) that runs the audit and stores
the report. Add the schedule to the registry block when this lands.

## Audits: an owner-facing view

**Why:** The findings are only in a terminal and a JSON file.

**Suggested fix:** An `/audits` page listing each project's latest run,
grouped by severity, with "new since last run" from the stored diff. The
messages are already written for the owner.

## Audits: model triage

**Why:** Deterministic checks can't say which findings matter most for a
given business, or write the fix in the site's own terms.

**Suggested fix:** A step that reads stored findings (never the raw site) and
proposes a short, prioritized fix list for the owner to approve, through the
existing approval gates.

## Audits: Lighthouse and axe

**Why:** Slice 1 checks markup and headers only. It doesn't measure real page
speed (layout shift, largest paint) or full accessibility (contrast, focus
order, ARIA).

**Suggested fix:** Run Lighthouse and axe-core in a headless browser on the
crawled pages, map their results into the same finding format with stable
ids, and keep them as separate checks so their findings diff cleanly.

## Audits: slice 1 limits

**Why:** Known gaps, kept out of slice 1 on purpose:

- **Links beyond the page cap** are never fetched, so a broken link on a
  page that wasn't crawled, or to a page past the cap, isn't reported.
- **Sitemap parsing** checks the root element and reads `<loc>` values; it
  is not a full XML parser, so some malformed files pass.
- **Behind a proxy** (`HTTPS_PROXY`), the proxy resolves hostnames, so the
  private-address check covers literal IPs, local names and whatever local
  DNS can resolve. Without a proxy the check runs on the address actually
  connected to.
- **No local targets from the CLI.** `allowLocal` is test-only; auditing a
  `localhost` dev server needs an explicit flag.
- **robots.txt** `Crawl-delay` is ignored (the auditor already waits 250 ms
  between requests). Pages are decoded as UTF-8.
- **The http:// probe** assumes port 80. Tests pass their own probe URL.

**Suggested fix:** Take these one at a time as real runs show which matter.
A HEAD request for every discovered internal link (within a second cap)
would close the first gap cheaply.
