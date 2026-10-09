---
name: check-gates
description: >-
  Use when it is unclear which lint, typecheck, test, or drift gate applies
  to a change — after editing files and before considering a task done,
  when asked "what should I run before committing", "which gates apply
  here", "run the checks for this", or when a PR is about to open. Maps
  changed paths to the pnpm scripts and lefthook/CI gates that cover them,
  then runs, reads failures, fixes, and reruns until clean or blocked. Do
  NOT trigger when the user names one specific command directly (e.g. "run
  pnpm typecheck") — just run it.
metadata:
  owner: watchdog
  sources: package.json, lefthook.yml, .github/workflows/ci.yml, AGENTS.md, docs/contributing/ci-gates.md
---

# Check gates

Closes the loop lefthook and CI only open: run, read failure, fix, rerun.

## Outcomes

- **Clean** — every applicable gate passes; report which ones ran.
- **Changed** — files were fixed to pass a gate; list what changed and which gate forced it.
- **Blocked** — a gate fails for a reason this skill cannot fix (missing service, ambiguous product decision); report the failure verbatim and stop instead of guessing.

## Edit scope

May edit any file a failing gate points at, to make that gate pass. Does not change gate configuration (`lefthook.yml`, `package.json`, CI) unless asked to.

## Instructions

1. Get the changed-file list: `git status --porcelain` for uncommitted work, or `git diff --name-only <base>...HEAD` for a branch.
2. Map paths to gates from the sources, never from memory: the globs in `lefthook.yml` (pre-commit, commit-msg, pre-push), the path filters and jobs in `.github/workflows/ci.yml` (CI wins on divergence), and the command list in [`docs/contributing/ci-gates.md`](../../../docs/contributing/ci-gates.md). Union the commands for all changed paths.
3. Run fastest first: lint/typecheck before tests, integration and e2e last.
4. On failure, read the actual error output before editing.
5. Fix, then rerun only the gate that failed.
6. Stop and report Blocked after a fix attempt does not resolve the same gate twice.

## Gotchas

- Pre-commit runs `pnpm fix` on staged files, not `pnpm check`; Knip, typecheck, tests, drift, and e2e are CI / pre-push.
- `test:integration` needs Postgres (`just test-db`). If services are down, report **Blocked**; do not skip silently.
- `generate:caps` / `generate:client` fail on drift: run the generator and commit the artifact; do not hand-edit generated output. `generate-routes` is not a CI drift job; run it when route files change.
- `check:docs-affected:strict` needs paired doc touches in the same commit (or `docs:allow-affect — reason` in that commit's own message). It runs at commit-msg on the staged diff, and on mapped **code** paths, not only `docs/**`.
- The `watchdog/db-repo-*` lint rules (part of `pnpm check`) are mechanical only; passing does not satisfy the review-only repo rules in `packages/db/AGENTS.md`.
- `pnpm doctor:react` and desloppify are advisory (CI Advisory job / main only), not merge gates.
