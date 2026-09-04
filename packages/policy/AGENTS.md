# Policy package (`@watchdog/policy`)

> Scope: `packages/policy` (inherits root AGENTS.md)

Pure Graph write custody (`assertPatchGates` / Accept rules). No DB, Caps, or I/O.

## Commands

| Task       | Command                                    |
| ---------- | ------------------------------------------ |
| Typecheck  | `pnpm --filter @watchdog/policy typecheck` |
| Unit tests | `pnpm test:unit`                           |

## Rules

- Depend on `@watchdog/schemas` only (plus `effect` for the error channel).
- `assertPatchGates` / `assertPatchShape` return `Effect<void, CustodyViolation>`. Shape helpers `requireString` / `requireEnum` throw `CustodyViolation`; `runGate` rethrows that tagged error (no plain `Error`). Tests use `it.effect` from `@effect/vitest`.
- Browser UI: import `@watchdog/policy/patch-needs-confidence` — not the package root (Effect-tagged gates).
- Never import `db`, `core`, `caps`, `api`, or `apps/*`.
- Pure functions; callers in `core` own persistence.
