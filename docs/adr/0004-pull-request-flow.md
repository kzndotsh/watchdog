# ADR-0004: Pull requests for everything; tiny fixes may go straight to main

**Status:** accepted (2026-10-05) · closes [#49](https://github.com/kzndotsh/watchdog/issues/49) **What this is:** how changes reach `main`, who decides a merge, and which changes may skip a pull request. **What this is not:** branch-protection configuration (not enabled) or the contents of the PR body (the `pr` skill owns that).

## Context

For most of the project's history almost every commit went straight to `main`. Gates that compare against a base (the docs-affect gate, any API breaking-change diff) only mean something where a base exists, so they worked locally and not on a direct push. Since the audit specs began (2026-09), every spec has landed as a ready pull request from an integration branch: CI runs on the PR diff, the review bots comment, and the owner merges. That practice has caught real defects before merge (a dead repeated-signal handler during a drain, a type that let an entity id pass as a case id, a probe file that raced `tsc` in the pre-push hook).

## Decision

1. **Pull requests are the default.** Anything that lands on `main` goes through a ready (not draft) PR from a branch, with CI green and the bot reviews read, and is merged by the owner's explicit word ("merge"). An agent never merges on its own recommendation.
2. **Small loose ends may go straight to `main`, only when the owner says so** ("do these on main"): lint-warning fixes, test-only fixes and doc wording. Never directly on `main`: dependency or lockfile changes, runtime wiring, database schema or migrations, gate scripts or CI configuration, auth, and anything that changes behaviour.
3. **Local hooks stay.** The pre-commit, commit-msg and pre-push hooks run for every commit and push; `--no-verify` is not an escape hatch. They are fast local checks, not the merge gate.
4. **No branch protection or auto-merge for now.** The owner is the only maintainer; CI-before-merge is a rule the owner enforces by merging. Revisit when there is a second contributor, or when a direct push breaks `main`.
5. **No merge without a CI result.** If the hosted runners are unavailable (a GitHub incident on 2026-10-05 left the `ci` workflow's first job queued until it timed out), the PR waits and the run is retried; the owner may decide to merge on local evidence, but that is the owner's call.

## Consequences

- Base-diff gates (docs-affect and any later diff-based gate) run on the PR diff in CI and behave as designed; the push-to-`main` path in CI remains as a backstop for the direct pushes allowed above.
- Each PR body follows the `pr` skill's format (Summary, Evidence, Merge Danger), which is also where deviations from a ticket are recorded.
- Tickets reference their PR; GitHub closes only the first issue in a "Closes #a, #b" line, so the remaining tickets are closed by hand.

## Considered

- **Keep pushing to `main` and make every gate push-aware.** Least process, but loses PR review, the bot reviews and CI-before-merge, which is where the defects above were found.
- **No direct pushes at all, with branch protection.** Strictest, but a runner outage or a one-line lint fix would block on the whole process.

## Reopen when

- a second maintainer joins (turn on branch protection and required CI), or
- a direct push to `main` breaks it.
