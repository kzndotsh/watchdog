---
name: check-gates
description: >-
  Use when it is unclear which lint, typecheck, test, or drift gate applies
  to a change — after editing files and before considering a task done,
  when asked "what should I run before committing", "which gates apply
  here", "run the checks for this", or when a PR is about to open. Maps
  changed paths to `pnpm verify` plus the CI-only tests that cover them,
  then runs, reads failures, fixes, and reruns until clean or blocked. Do
  NOT trigger when the user names one specific command directly (e.g. "run
  pnpm typecheck") — just run it.
metadata:
  owner: watchdog
  sources: package.json, scripts/verify.mjs, lefthook.yml, .github/workflows/ci.yml, AGENTS.md, docs/contributing/ci-gates.md
---

# Check gates

Closes the loop CI only opens: run, read failure, fix, rerun. `pnpm verify` is the default; this skill adds what it leaves out.

## Outcomes

- **Clean** — every applicable gate passes; report which ones ran.
- **Changed** — files were fixed to pass a gate; list what changed and which gate forced it.
- **Blocked** — a gate fails for a reason this skill cannot fix (missing service, ambiguous product decision); report the failure verbatim and stop instead of guessing.

## Edit scope

May edit any file a failing gate points at, to make that gate pass. Does not change gate configuration (`lefthook.yml`, `package.json`, CI) unless asked to.

## Instructions

1. Run `pnpm verify`: lint and format on the changed files, every static gate, typecheck, and the tests of the affected packages. `pnpm verify --dry-run` shows what it will run; `pnpm verify --full` is what the CI `gates` job runs.
2. Add what verify leaves out, mapped from the changed paths via the CI jobs in `.github/workflows/ci.yml` and [`docs/contributing/ci-gates.md`](../../../docs/contributing/ci-gates.md): `pnpm test:component` for `apps/web` UI, `pnpm test:integration` for db/core/api/caps code, e2e for flows, `pnpm build` plus `pnpm check:bundle` for web bundle changes.
3. On failure, read the actual error output before editing.
4. Fix, then rerun only the gate that failed (each verify step names its pnpm script), then `pnpm verify` once more.
5. Stop and report Blocked after a fix attempt does not resolve the same gate twice.

## Gotchas

- Pre-commit only formats staged files. Lint, gates, typecheck and tests run in `pnpm verify` (the agent stop hook runs it) and in CI; Knip, licenses, notices and generated-file drift only in `pnpm verify --full`.
- `test:integration` needs Postgres (`just test-db`). If services are down, report **Blocked**; do not skip silently.
- The list plan gate (`list-conformance-plans.scale.int.test.ts`, in the `scale` vitest project: `pnpm test:scale`, not part of `test:integration`) needs `WD_PERF_DATABASE_URL` at a perf-seeded database (`PERF_SEED_DIV=1 just perf-seed`); without it the file skips locally, and CI seeds one.
- `generate:caps` fails on drift: run the generator and commit the artifact; do not hand-edit generated output. `generate:client` output (`apps/cli/client/src/generated/`) is gitignored and rebuilt by install, `pnpm typecheck` and `pnpm build:cli`. `generate-routes` drift is checked by `pnpm verify --full`; run it when route files change.
- The `watchdog/db-repo-*` lint rules (part of `pnpm check`) are mechanical only; passing does not satisfy the review-only repo rules in `packages/server/AGENTS.md` (Database).
- `pnpm doctor:react` and desloppify are advisory (CI Advisory job / main only), not merge gates.
