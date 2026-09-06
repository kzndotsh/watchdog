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
2. Load [gate-map.md](references/gate-map.md) and union the commands for those paths.
3. Run fastest first — lint/typecheck before tests.
4. On failure, read the actual error output before editing.
5. Fix, then rerun only the gate that failed.
6. Stop and report Blocked after a fix attempt does not resolve the same gate twice.

## Gotchas

- `generate:caps` / `generate:client` fail on drift — run the generator; do not hand-edit generated output.
- `check:docs-affected:strict` needs paired doc touches in the same commit (or `docs:allow-affect — reason` / `DOCS_ALLOW_AFFECT=1` when split). It also runs on mapped **code** paths, not only `docs/**`.
- `pnpm --filter @watchdog/db check:repos` is mechanical only; passing is not the same as satisfying review-only repo rules in `packages/db/AGENTS.md`.
- `pnpm doctor:react` is advisory. Desloppify is CI-on-main advisory only.
