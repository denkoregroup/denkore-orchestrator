# Backlog

Known follow-ups, deliberately not done yet.

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
policies, and triggers. For `005_audit_reports.sql` the assertions were run
once by hand against a local Postgres 16 with stand-in roles: the unique key,
select/insert-only grants for `service_role`, read-only for the owner, and
nothing for `anon`. Put those in the job. Add a Jest test for `updateSession` with a mocked
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

**Why:** `/runs`, `/runs/[id]`, `/approvals` and `/activity` show data as of page
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
button, like `/activity`.

## Manual end-to-end checklist (once the database exists)

**Why:** CI uses a fake Supabase client, and the SQL has only been run
against a local Postgres stand-in. Nothing has been checked against a real
Supabase project.

**Suggested fix:** After creating the project, applying 001–005 and setting
the env vars, walk through:

1. `pnpm registry:sync` inserts `denkore-com`, `ggrmusic-com` and `dclarkdev-com`; a second run says `unchanged`.
2. Sign in with GitHub as the owner. Another GitHub account is signed straight
   out again and sees "This GitHub account isn't allowed in."
3. `/prompt`: a 5-character prompt is refused; a real one opens `/runs/[id]`
   showing "Waiting to start".
4. `/activity` shows "Run created" by "You" for that run, and the run filter works.
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
11. Audit reports (005): in the SQL editor, check the table exists and that
    `select` works for the owner. Then run
    `pnpm audit:run --project dclarkdev-com --post https://<app>/api/audits/report`
    with the app's `STEP_WEBHOOK_SECRET`. It prints "Report stored in the app".
12. Run the same command again. Each run has its own start time, so it is a new
    row. `/sites` shows the `dclarkdev-com` site with the newest counts, and its
    page says what is new and what was fixed since the first run.
13. Duplicates can't be tried with the CLI (every run has its own start time),
    so post a saved report twice by hand. Both answers are 200; the first
    says `"recorded"`, the second `"duplicate"`, and there is still one row:

    ```sh
    body=$(jq -c '{report: .}' audit-report.json)
    sig=$(printf %s "$body" | openssl dgst -sha256 -hmac "$STEP_WEBHOOK_SECRET" -hex | sed 's/^.* //')
    curl -sS -X POST https://<app>/api/audits/report \
      -H "content-type: application/json" -H "x-denkore-signature: sha256=$sig" \
      --data-binary "$body"
    ```

    Change one character of the secret and the answer is 401 with no row.
14. As service role, try to update and delete an `audit_reports` row: both are
    refused. Check the row's `project_id` is the `dclarkdev-com` project.
15. Sign in as the owner and open `/sites` on a phone-sized screen (360px): the
    list and the detail page read without sideways scrolling.
16. Sign in with GitHub from each place: on `http://localhost:3000`, on a Vercel
    preview, and on production. Each must come back to the address you started
    from and land on `/approvals`. If it opens the Site URL instead, that
    address is missing from the Redirect URLs allowlist (README, one-time
    setup, Sign in with GitHub). Also try the Cancel button on GitHub's prompt:
    `/login` should show "Sign-in didn't complete. Try again."
17. Daily audits: set the repository variable `AUDIT_REPORT_URL` and check the
    secret `STEP_WEBHOOK_SECRET` (README, one-time setup, GitHub Actions). In the Actions tab run
    "Audit schedule" by hand. It goes green, and `/sites` shows a report from
    minutes ago for denkore.com, ggrmusic.com and dclarkdev.com.
18. Watchdog: after a few days of daily runs, `/sites` shows no Overdue badge.
    To see it act, disable the "Audit schedule" workflow for three days, then
    check `/sites` (Overdue) and Activity ("Audit overdue: no new report for
    <site> in over 2 days"). The tick's answer in the Actions log lists the same
    sites under `watchdog.overdue`. Re-enable the workflow afterwards.

## Reopen a changes-requested gate at the same SHA

**Why:** If the owner asks for changes and the redo produces the same commit,
the run escalates ("no change was produced"). That is the safe default, but
sometimes the owner just wants to re-review the same commit (they asked for
changes by mistake, or the change was made outside the run).

**Suggested fix:** A security definer SQL function the owner can call to
reset a `changes_requested` gate to `pending` at its current SHA, logged as
an event, plus a "Review again" button on an escalated run.

## Real GitHub dispatch

**Why:** The runner is still the stub: it builds the `workflow_dispatch`
request but never sends it, so no agent runs.

**Suggested fix:** Install a GitHub App on the project repos, mint an
installation token per dispatch, and send the request the stub builds.
Agree the agent workflow file name (`RUNNER_WORKFLOW` is a placeholder) and
review the tool allowlists in `lib/conductor/contract.ts` first; they are
placeholders too.

## Stop late completions from rewriting a timed-out step

**Why:** When a step times out, the Conductor marks it failed and logs
`conductor.step_timed_out`. If the lost webhook arrives later,
`record_step_completion` still overwrites that steps row (status, cost,
output). The run is safe: `decide()` treats any step with a timeout event as
failed, so a retry that is already running isn't disturbed. But the row then
says "succeeded" for an attempt that counted as a failure.

**Suggested fix:** A new additive SQL file that makes
`record_step_completion` keep `status = 'failed'` when a
`conductor.step_timed_out` event exists for that step key (still recording
the completion event and the cost). This needs new SQL, so it waits for a
decision.

## Show timed-out steps as timed out on the run page

**Why:** The run page shows a timed-out step as "Failed", or as "Finished"
if a late completion rewrote it. The history does say it timed out, but the
step list doesn't.

**Suggested fix:** Read the run's `conductor.step_timed_out` events in
`getRun` and label those steps "Didn't report back in time".

## Alert when the tick keeps failing

**Why:** If the tick workflow fails over and over (wrong secret, app down,
wrong `CONDUCTOR_TICK_URL`), stalled runs and hung steps are never picked up,
and the only sign is red runs in the Actions tab that nobody is watching.

**Suggested fix:** A small follow-up job in the workflow that, after three
failed runs in a row (read through the Actions API with `actions: read`),
opens or updates one GitHub issue, or sends a message to the owner's
notification channel. Close the issue on the next green run.

## Audits: stored reports follow-ups

**Why:** Slice 2 stores reports and shows the latest per site, but keeps it
simple on purpose:

- **Latest per site reads the 1000 newest reports.** PostgREST can't pick the
  newest row per group, so `/sites` reads the newest 1000 report summaries and
  keeps the first per site. It says so on the page if it hit that limit; a site
  with nothing recent could then be missing.
- **No history view.** A report page compares with the report just before it.
  There is no list of past runs and no comparing any two.
- **Spelling counts.** A site is its `target` string, so `http://`, `https://`,
  `www.` and bare versions of one site are separate sites.
- **Nothing can be deleted.** No role has a delete grant, so a mistaken report
  stays until someone removes it by hand in the SQL editor. There is no retention
  rule either.
- **A repeat is matched on site and start time only.** A second post with the
  same pair but different findings is acknowledged as a duplicate and dropped.
- **Counts are taken from the report as sent.** The ingest route doesn't check
  that `counts` match the findings; the auditor always makes them match.

**Suggested fix:** When a site has many reports, add a view or function that
returns the newest report per `target` and use it in `listSites`. Add a
history list to the site page. Decide on a retention rule (and a definer
function for deleting) when the volume is known.

## Audits: run on a schedule

**Why:** Audits only run when someone types the command.

**Suggested fix:** A weekly job per registry entry with an `audits` block
(Vercel Cron or a scheduled GitHub workflow) that runs the audit with
`--post` (slice 2 added it) and stores the report. Add the schedule to the
registry block when this lands.

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
- **A 403 reads as "missing".** robots.txt and the sitemap are reported as
  absent for any non-200. On dclarkdev.com both are a 403 from the storage
  bucket (S3 "AccessDenied"), which is true in effect but not in wording.
  The message could say "can't be read (403)" instead.
- **Homepage findings use the address you typed.** When the start URL
  redirects (ggrmusic.com to www), page findings for the homepage carry the
  apex URL, not the final one.

**Suggested fix:** Take these one at a time as real runs show which matter.
A HEAD request for every discovered internal link (within a second cap)
would close the first gap cheaply.

## One time zone on every page

**Why:** `/sites` and its report page now show every time in Eastern time through
`formatEt` (`lib/format.ts`), so a report reads the same on localhost and on
Vercel. `/runs`, `/runs/[id]`, `/approvals` and `/activity` still use
`LocalTime`: UTC from the server, then the viewer's own time zone after the page
loads. The same run can therefore show a different time depending on where it is
opened.

**Suggested fix:** Use `formatEt` (or a `LocalTime` built on it) everywhere, and
drop the UTC-then-local switch. Decide first whether Eastern is right for every
page, or whether it should be a setting.

## Daily audits: follow-ups

**Why:** The first version of the daily audit leaves these for later:

- **`fixableInCode: false` on the unreachable finding.** The issue asks for it
  "once that flag exists". It doesn't, so the Site unreachable finding (Worth
  fixing) has no such field yet.
- **HoneyBee** joins `registry/` once its store has content.
- **The registry entries for the three sites hold guesses.** Only the id and the
  audits url are confirmed; repo, hosting and stack are best guesses (see the
  comment in each `registry/*.yaml`). Check them before the Conductor builds
  anything on these projects.
- **The only alert is a red run and the Overdue badge.** There is no message to
  you when the daily audit fails or a site is overdue. The tick-alert entry above
  ("Alert when the tick keeps failing") should cover this workflow too.
- **An overdue site writes one event per overdue stretch**, not a reminder every
  day, and that event is only shown on Activity.
- **Reports are only matched to a site by project.** A report posted with `--url`
  for a registered site's address is stored without a project, so the watchdog
  doesn't count it.

**Suggested fix:** Add the flag when it exists, confirm the registry fields, and
route both failures (the red run, the escalation event) to the notification
channel once there is one.
