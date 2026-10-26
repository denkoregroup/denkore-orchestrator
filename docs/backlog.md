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
