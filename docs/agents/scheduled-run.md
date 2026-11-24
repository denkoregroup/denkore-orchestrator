# Scheduled repo run

The prompt each repo's scheduled task sends. Every run is a fresh session with no memory, so the
prompt carries everything. Replace REPO, and set MODE to `finish-only` (only approved, already
started items) or `may-start` (may also take the next approved item from the queue).

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
6. If an open PR has failing CI or merge conflicts from a rebase, fix that first.
7. If MODE is may-start, take open issues labelled `agent-ready` (David's approval; oldest
   first, at most two, one helper each, different files) that have no open PR yet. Otherwise, or
   if there are none, take nothing new and propose the next items from the guide's queue as
   numbered decisions.
8. Before building, check facts in live systems only where the guide allows reads without asking.
9. Open DRAFT PRs. Wait for every helper to finish before ending your turn.

Report (SendUserMessage, then a push notification only if a decision is waiting)
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

Never: merge, mark ready, change a live system, create issues, or contact the client. David
replies "merge N" in this session.
```
