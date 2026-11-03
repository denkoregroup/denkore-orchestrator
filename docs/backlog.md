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

## Call the tick route on a schedule

**Why:** `POST /api/conductor/tick` exists but nothing calls it, so a run
that misses its trigger (a failed `after()`, a lost webhook) stalls until the
next decision or completion.

**Suggested fix:** Either a Vercel Cron job (it would need the HMAC signature,
so a small signed-request helper or a separate cron secret check) or a
scheduled GitHub workflow that signs `{}` with `STEP_WEBHOOK_SECRET` and posts
it every few minutes.

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

