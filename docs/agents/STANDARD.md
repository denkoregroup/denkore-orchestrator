# Denkore agent standard

How agent sessions build Denkore's client projects. Every project repo links here from its own
`docs/AGENT_GUIDE.md`, which adds the repo's specifics. Where the two disagree, the repo guide wins
for that repo.

First written from the HoneyBee session of Nov 24, 2026 (6 PRs merged, 3 helpers in parallel,
David answering numbered yes/no decisions).

**Naming.** In this document the *conductor* is the agent session that coordinates the repos. It is
not the Conductor in this app (`lib/conductor/`, the 5-minute tick), which drives runs through
their states.

## Roles

| Who | Does |
| --- | --- |
| **David** | Decides scope. Approves each merge and every change to a live system. Reads a short status table and answers numbered decisions. |
| **Conductor** | Keeps this standard, schedules repo runs, keeps the cross-repo view (who is waiting on David, who is blocked on a client, deadlines), spots conflicts. Writes no product code. |
| **Repo lead** | One session per repo at a time. Reads the repo's state, picks the next item, writes code or delegates to helpers, reviews every helper PR, reports, merges on approval. |
| **Helper** | Short-lived. Own git worktree and branch, one issue-sized change, one draft PR. Reports to the lead, never to David. |

**One owner per repo.** Never two sessions on the same repo and branch at once. The repo's guide
says who owns it: a dedicated session or the conductor's scheduled run.

## The loop

1. **Check state against the last handoff.** Open PRs, head shas, check runs, open issues. Report
   any drift before doing anything else.
2. **Propose the next items in order; David picks.** Small bugs and approved tickets start right
   away. Ask first only when the work is expensive or ambiguous.
3. **Check the facts in the live system before building** (read-only, within the repo's approval
   rules). A query often changes the task: at HoneyBee, "missing images" turned out to be 5 of 6
   tiles pointing at collections that don't exist.
4. **Implement, then run lint, tests and the type check. Open a DRAFT PR.** Every bug fix ships
   with a test that reproduces the bug first.
5. **Lead reviews** with `gh api repos/O/R/pulls/N/files`, the check runs and the commit statuses,
   and says plainly what wasn't verified (previews not opened, no real email sent).
6. **Report to David:** a table of PRs, three notes or fewer, numbered decisions. Scheduled
   runs also send that report to the app through the Run report workflow
   (`docs/agents/scheduled-run.md`, step 11), so it shows on the Waiting on you page. David can
   answer the numbered decisions there; the next run fetches those answers first (step 5).
7. **On a yes, merge in dependency order,** pinned to the reviewed sha. Then rebase the dependent
   PRs, fix what the rebase broke, re-run CI and re-report.

## David's rules

- **Never merge without David's explicit yes for that specific PR.** Regular merge commit, never
  squash, pinned to the sha you reviewed:
  `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=merge -f sha=<reviewed sha>`
  Mark a draft ready first: `gh api -X POST repos/O/R/pulls/N/ccr/ready_for_review`
  (the route that worked in the session; PATCH `draft=false` is the fallback).
- **Issues are drafted in chat and created only on approval,** with labels that already exist in
  the repo. Shape: background / additional dev work (checklist) / open questions (mark the
  architectural ones) / dependencies.
- **Small PRs, one concern each.** "Part of #N" unless every checklist item is done. Ops-only
  leftovers are listed as remaining in the PR.
- **Every PR body opens with a summary line** for David to read before he approves or asks:
  `**Summary:** ` then one or two plain sentences on what the PR does for him and how risky it is
  (for example "Adds the shipping page. Low risk: a new page, nothing existing changes."). No
  jargon, file names or links. The Waiting on you page shows it under the PR, and reports to
  David reuse it word for word.
- **Every PR body covers** the changes, assumptions, tests, what remains and **what was not
  verified.**
- **Ask before any change in a live system:** Shopify admin, Vercel settings, DNS, a database. A
  repo guide can make this stricter (one repo requires asking before every database request, even
  a read).
- **Other people's branches are off limits.** Only rebase or push to branches an agent session
  opened, unless David names the PR.
- **Don't ask the client directly.** State the assumption, put it in the PR, let David redirect.
- **No mock data or invented claims:** stats, reviews, shipping promises, hours, policies.
- **No secrets, tokens or signed URLs anywhere:** code, logs, issues, PR bodies or chat.
- **Complexity budget:** no unreachable fallbacks, no defensive code for problems that haven't
  happened; security and URL safety done properly. (Example: contact-form rate limiting was
  deferred, because an in-memory counter doesn't hold across serverless instances and no spam has
  been seen.)
- **READMEs stay high level:** what it is, how to run it, where things are. Detail goes in a
  linked doc under `docs/`.
- **Reporting style:** product-owner level, short and incremental. Technical detail only when
  David asks.
- **Link every issue and PR you mention,** as a markdown link with its title or a few words, for
  example [#24 Launch readiness](https://github.com/O/R/issues/24). A bare number is not enough;
  David reads on his phone.

## Mechanics

### Repo access in a cloud session

- The session starts without access to private repos. Attach with `add_repo` (`access: "push"`),
  then `git clone --depth 1`. A public repo attached read-only gives git reads but **no API**;
  attach with push to use `gh api`.
- The git proxy allows **2 concurrent git operations per repo.** Stagger pushes from parallel
  helpers; on HTTP 429 wait 5 seconds and retry once.
- **`gh pr create` and GraphQL are blocked.** Use REST:
  - PR: `gh api -X POST repos/O/R/pulls -f title=... -f head=BRANCH -f base=main -F draft=true -F body=@body.md`
  - Issue: `gh api -X POST repos/O/R/issues -f title=... -F body=@body.md -f 'labels[]=LABEL'`

### Pushing from a shallow clone

- `git -c push.negotiate=true push -u origin BRANCH`. A "push negotiation failed" warning is harmless.
- Force pushes need an explicit lease: `--force-with-lease=BRANCH:<old remote sha>`. Plain
  `--force-with-lease` fails with "stale info".
- Rebase onto a new main: `git fetch --depth=50 origin main`, then `git rebase origin/main`.

### Helpers in parallel

- Each helper: `git worktree add -b BRANCH ../wt-NAME origin/main`, its own install. Give helpers
  different files where possible; plan rebases in the merge order when a PR overlaps an open one.
- About 3–4 minutes per issue-sized PR.
- **Background work stops a few minutes after a reply ends.** A lead waits for its helpers (poll
  for the PR, or wait for the completion notice) before ending its turn. This is why hands-off
  progress needs scheduled runs.
- Use the brief in [helper-brief.md](helper-brief.md). Helpers reliably flag their own
  uncertainties; keep asking for that.

### Build and CI

- The sandbox reaches only package registries and GitHub. Anything that fetches at build time
  (for example `next/font/google`) can't build locally; lint, tests and the type check still run,
  and the build runs in CI and on Vercel previews. Say so in every PR.
- When a commit has two statuses with the same name, GitHub's combined status shows whichever
  arrived last. Filter by `target_url` (the repo guide names which one is ours).

### Code-level lessons

- **Next.js 16 is newer than training data.** Every brief says: read AGENTS.md and the relevant
  guide in `node_modules/next/dist/docs/` first.
- Making a root-layout component async breaks tests that render it synchronously. Expect that
  fallout when rebasing.
- Values that travel in HTTP headers (cache tags, for one) must be ASCII. Encode them.

## Scheduled runs

Each repo can have a scheduled run: a fresh session that follows
[scheduled-run.md](scheduled-run.md). It works through the repo's **roadmap issue** (listed in
[repos.md](repos.md)) in order, up to three items a run, and opens draft PRs. It never merges.

A **Conductor review** runs after the repo runs ([review-run.md](review-run.md)). A fresh session
that didn't write the code reviews every open agent PR across the repos, leaves a review comment
on each, sends small fixes back to the next repo run, and sends David one message: what's ready
to merge and what needs his eyes. David replies "merge N" there (or in any run's session); every
merge still needs his yes.

### Every scheduled run's report and David's answers

These rules apply to every scheduled run, whatever its own prompt lists. Where a run prompt's
report step names other table columns or leaves a step out, follow this section.

1. **The PR table quotes each PR's Summary line word for word.** Columns: linked number, its
   Summary line, CI, ready to merge? Add a Summary line to any open agent PR that lacks one
   before reporting.
2. **After the chat report, send the same report to the app,** so it shows on the Waiting on you
   page: follow [scheduled-run.md](scheduled-run.md) step 11 (write the JSON, start the Run report
   workflow in denkore-orchestrator, check it concluded success). If it still fails after one fix,
   say so in the chat report. Take the registry id and repo from the table below, and the mode
   from the run prompt.

   | Run's repo | registryId | repo |
   | --- | --- | --- |
   | honeybees | `honeybees` | `denkoregroup/honeybees` |
   | barzini-publishing | `barzini-publishing` | `denkoregroup/barzini-publishing` |

   A repo that isn't in this table sends no report to the app; say so in the chat report.
3. **The report holds plain text only:** no secrets, no customer or contributor data. It goes to
   the orchestrator app, not to the project's own database, so a repo rule against database
   requests (Barzini Publishing sends none to its Supabase) still holds.
4. **Before any work, fetch David's answers** to the last run's numbered decisions, which he can
   type on the Waiting on you page: follow [scheduled-run.md](scheduled-run.md) step 5, with the
   registry id from the table above. Each answer is David's reply to that one numbered decision,
   as if he had typed it in the last run's session; it never widens what a run may do (no merge,
   no live change). If the workflow fails, say so in the chat report and carry on without them.

### Every Conductor review's verdicts

These rules apply to the Conductor review, whatever its own prompt lists.

1. **Classify each PR by [review-rules.md](review-rules.md):** Ready, Needs David or Changes
   needed, with a one-line reason unless it's Ready.
2. **After the chat message, send the verdicts to the app,** one report per repo that has open
   agent PRs, through the same Run report workflow as the repo runs ([scheduled-run.md](scheduled-run.md)
   step 11), with the registry id and repo from the table above. Waiting on you then lists Look
   closer first, Blocked next, and Ready to merge on one line. The report differs from a repo
   run's in four ways:
   - `mode` is `review`, and `decisions` is empty (numbered decisions stay in the chat message).
   - Every PR in `pulls` carries `review`: `{verdict: ready|needs-david|changes-needed, reason
     (required unless ready), headSha}`, where `headSha` is the PR's full head commit sha when
     the class was given, after any fix the review pushed.
   - `ready` is true only for a Ready verdict.
   - `summary` counts the PRs in each class.
3. **A verdict holds only for the commit it names.** The page shows a PR pushed since its review
   by its GitHub state until the next review.

## Source of truth

GitHub (issues, labels, epics, PRs) is the roadmap. Any board, dashboard or queue in a guide is a
dated snapshot; check it against GitHub before acting on it. The repos and their owners are in
[repos.md](repos.md).
