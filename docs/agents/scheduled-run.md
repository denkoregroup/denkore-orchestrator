# Scheduled repo run

The prompt each repo's scheduled task sends. Every run is a fresh session with no memory, so the
prompt carries everything. Replace REPO, and set MODE to `finish-only` (only finish open agent
PRs) or `may-start` (may also take new items from the repo's roadmap).

```markdown
Scheduled run for denkoregroup/REPO. MODE: MODE.

Setup
1. Attach denkoregroup/REPO and denkoregroup/denkore-orchestrator with add_repo (access "push"),
   shallow-clone both.
2. Read denkore-orchestrator/docs/agents/STANDARD.md, then REPO's AGENTS.md and
   docs/AGENT_GUIDE.md. Follow them.
3. Check docs/agents/repos.md: if REPO's owner is not "scheduled run", stop and report that.

State
4. List open PRs (head sha, draft, check runs, our deployment status) and open issues. Compare with
   the guide's last snapshot and report any drift.
5. Fetch David's answers to the last run's numbered decisions, typed on the Waiting on you page.
   Start the Run answers workflow with REPO's registry id (STANDARD.md has the table):
    gh api -X POST repos/denkoregroup/denkore-orchestrator/actions/workflows/run-answers.yml/dispatches \
      -f ref=main -f "inputs[registry_id]=ID"
    A minute later, find that run (its name is "Run answers for ID") and read its job log:
    RUN=$(gh api "repos/denkoregroup/denkore-orchestrator/actions/workflows/run-answers.yml/runs?per_page=10" \
      --jq '[.workflow_runs[] | select(.display_title == "Run answers for ID")][0].id')
    JOB=$(gh api "repos/denkoregroup/denkore-orchestrator/actions/runs/$RUN/jobs" --jq '.jobs[0].id')
    gh api "repos/denkoregroup/denkore-orchestrator/actions/jobs/$JOB/logs" \
      | sed -n '/=== Answers from David/,/=== End of answers ===/p'
   Each answer is David's reply to that numbered decision only: act on it as if he had typed it
   in the last run's session. It never widens the Never list below. If the workflow fails, say
   so in the chat report and carry on without answers.

Work
6. Fix open agent PRs first: failing CI, merge conflicts, and any "Changes needed" from the
   latest Conductor review comment on the PR.
7. If MODE is may-start, take up to THREE new items from the repo's roadmap issue (listed in
   docs/agents/repos.md), one helper each, on different files where possible:
   - first any open issue labelled `agent-ready` (David's "do this next"),
   - then the roadmap's Agent lane, top to bottom,
   - skipping items that are done, already have an open PR, or wait on something unchecked
     above them, and anything that needs a live system or a person (David, the client).
   Items marked *refine first* get a refined plan as an issue comment, not code. If nothing is
   eligible, take nothing new and say what the roadmap is waiting on.
8. Before building, check facts in live systems only where the guide allows reads without asking.
9. Open DRAFT PRs. Wait for every helper to finish before ending your turn.

Report (SendUserMessage; no push notification unless the run is blocked: the Conductor review
run that follows reviews the PRs and notifies David)
10. A table of PRs (linked number, its Summary line word for word, CI, ready?), three notes or
   fewer, numbered decisions. Every PR you open starts with a Summary line (STANDARD.md); add one
   to any open agent PR that lacks it.
   Product-owner level. Every issue and PR is a markdown link.
11. Send the same report to the app, so it shows on the Waiting on you page. Write it as one
    JSON object to /tmp/run-report.json (fields below), then start the Run report workflow:
    gh api -X POST repos/denkoregroup/denkore-orchestrator/actions/workflows/run-report.yml/dispatches \
      -f ref=main -f "inputs[report]=$(cat /tmp/run-report.json)"
    A minute later, check the newest run of that workflow concluded "success":
    gh api "repos/denkoregroup/denkore-orchestrator/actions/workflows/run-report.yml/runs?per_page=1" \
      --jq '.workflow_runs[0] | [.status, .conclusion] | @tsv'
    If it failed, read its log, fix the JSON once and send again; if it still fails, say so in
    the chat report. Fields (plain text only, no links or markdown, never a secret):
    schemaVersion 1; registryId (REPO's id in registry/); repo "denkoregroup/REPO"; mode;
    startedAt and finishedAt (ISO 8601 with offset); summary (one or two sentences);
    sessionUrl (this session's claude.ai/code address, only if you know it); pulls
    [{number, title, what (the PR's Summary line), checks: passing|failing|running|none,
    ready: true|false}];
    notes [three or fewer]; decisions [{number, question, options? [short answers]}].
    The app refuses a report with any field over its limit, in characters: title 200, what 300,
    summary 600, each note 400, question 500, each option 120 (five options at most), a
    review's reason 300. Shorten the text; never cut a sentence off mid-way.

Never: merge, mark ready, change a live system, create issues, or contact the client. David
replies "merge N" in this session.
```
