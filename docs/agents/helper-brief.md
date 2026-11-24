# Helper brief

The shape that worked at HoneyBee. Fill in every part; a helper that has to guess re-does the
lead's research.

```markdown
You are a helper on denkoregroup/REPO. Work only in WORKTREE_PATH on branch BRANCH. Don't touch
other directories.

1. Read AGENTS.md, docs/AGENT_GUIDE.md and the relevant guide in node_modules/next/dist/docs/
   before writing code.

2. Facts already verified (don't re-query live systems):
   - ...

3. Changes:
   1. ...
   Assumptions already decided:
   - ...

4. Tests: add ... Include one that reproduces the bug and fails before the fix.

5. Run: INSTALL, LINT, TEST, TYPECHECK. The sandbox can't run: ... (CI and the preview cover it).

6. Commit with the session's attribution trailer. Push with
   `git -c push.negotiate=true push -u origin BRANCH` (on HTTP 429 wait 5s, retry once). Open the
   PR with `gh api -X POST repos/denkoregroup/REPO/pulls -f title=... -f head=BRANCH -f base=main
   -F draft=true -F body=@body.md`. The body opens with `**Summary:** ` and one or two plain
   sentences on what the PR does for David and how risky it is (STANDARD.md). It then covers
   changes, assumptions, tests, what remains, what was not verified, and ends with the session's
   PR attribution lines. "Part of #N" unless the
   issue is fully done.

7. Draft only. Don't merge, don't mark ready, don't change live systems, don't create issues.

8. Report back: PR number, full head sha, files changed, test counts before and after, and
   anything you're unsure of.
```
