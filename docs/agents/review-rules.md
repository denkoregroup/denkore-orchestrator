# Review rules

How the Conductor review ([review-run.md](review-run.md)) picks a class for each open agent PR.
The class goes in its "Conductor review:" comment and, as the verdict, on the Waiting on you page.
The review flags; it never merges, and only David decides what merges.

## Changes needed (the page shows it as Blocked)

The PR can't merge as it stands. Any of these:

- A required check fails, or the branch conflicts with main or with another open PR in the repo.
- Checks are still running when the review ends. Say so; the next review looks again.
- It depends on another open PR that hasn't merged (its base isn't main).
- A concrete problem the review found: a bug, a test that doesn't test the change, a secret or
  customer data in the diff, an unsafe URL or missing input check.

The reason says what has to change, in one line.

## Needs David (the page shows it as Look closer)

The PR can merge, but David should look before he does. Any of these:

- **Database:** it adds or changes a migration, a policy or a grant. Say whether the migrations
  workflow must be run by hand after merging.
- **Sign-in, roles or payment:** it touches sign-in, sessions, the owner check, role or
  permission checks, checkout, prices or payment code.
- **Tests removed:** it deletes a test, or skips one (`.skip`, `.only`, `xit`, `xdescribe`).
- **Very large:** more than 600 changed lines or 25 changed files, not counting lockfiles and
  generated files.
- **Live settings:** it changes a workflow, deploy settings or the environment variables an app
  reads.
- **New dependency:** it adds a package to `package.json`.
- **His call:** product, copy, design or risk that only David can judge, such as client-facing
  words the repo's guide doesn't already supply.

The reason names the trigger and what to look at, in one line: "Adds a migration: run the
workflow after merging", or "Check the shipping times on the preview's /shipping page".

## Ready

None of the above, with checks green and no conflicts: David can merge on the Summary line
alone.

When more than one applies, Changes needed wins over Needs David. A small mechanical fix the
review makes itself (review-run.md step 3) changes the head, so the class is for the head after
the fix.
