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
  sources: package.json, lefthook.yml, .github/workflows/ci.yml, AGENTS.md
---

# Check gates

Closes the loop lefthook and CI only open: run, read failure, fix, rerun.

## Outcomes

- **Clean** — every applicable gate passes; report which ones ran.
- **Changed** — files were fixed to pass a gate; list what changed and
  which gate forced it.
- **Blocked** — a gate fails for a reason this skill cannot fix (missing
  service, ambiguous product decision); report the failure verbatim and
  stop instead of guessing.

## Edit scope

May edit any file a failing gate points at, to make that gate pass. Does
not change gate configuration (`lefthook.yml`, `package.json`, CI) unless
asked to.

## Gate map

| Changed paths | Run |
| --- | --- |
| any `*.ts` / `*.tsx` | `pnpm check` (lint+format), `pnpm typecheck` |
| `AGENTS.md` anywhere | `pnpm check:agents:strict` |
| `.agents/skills/**`, `.cursor/README.md` | `pnpm validate:agents` |
| `apps/web/**` | `pnpm --filter @watchdog/web ds:check`, `pnpm test:component` |
| `packages/caps/**` | `pnpm generate:caps` then `git diff --exit-code -- packages/caps/capabilities.gen.json` |
| `packages/api/**`, `packages/client/**`, `packages/core/**` | `pnpm generate:client` then `git diff --exit-code -- packages/client/src/generated/` |
| `packages/db/**` | `pnpm --filter @watchdog/db check:repos` |
| `e2e/**`, `playwright.config.ts` | `pnpm exec vitest run --project e2e-parser`, `pnpm test:e2e` (or `pnpm test:e2e:smoke` for harness-only edits) |
| anything under `packages/`, `apps/` | `pnpm test:unit` |
| `package.json`, lockfile, workspace/config files | full gate set — treat as if everything changed |

Mirrors [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) path
filters and [`lefthook.yml`](../../lefthook.yml); if they diverge, CI wins.

## Instructions

1. Get the changed-file list: `git status --porcelain` for uncommitted
   work, or `git diff --name-only <base>...HEAD` for a branch.
2. Match each path against the Gate map above; union the commands across
   all matches.
3. Run them, fastest first — lint/typecheck before tests — so a cheap
   failure surfaces before a slow one.
4. On failure, read the actual error output, not just the exit code,
   before editing anything.
5. Fix, then rerun only the gate that failed, not the whole set.
6. Stop and report Blocked after a fix attempt does not resolve the same
   gate twice.

## Gotchas

- `generate:caps` and `generate:client` gates fail on drift, not lint — the
  fix is running the generator and committing the diff, not hand-editing
  generated output.
- `pnpm --filter @watchdog/db check:repos` only catches the mechanically
  checkable half of the repo contract (`packages/db/AGENTS.md`); passing it
  is not the same as satisfying the review-only rules.
