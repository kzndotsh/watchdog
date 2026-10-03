# Policy package (`@watchdog/policy`)

> Scope: `packages/policy` (inherits root AGENTS.md)

Pure Graph write custody (`assertPatchGates` / Accept rules). No DB, Caps, or I/O: it depends on `@watchdog/schemas` (plus `effect` for the error channel) only, which `package.json` holds. Callers in `core` own persistence.

## Commands

| Task       | Command                                    |
| ---------- | ------------------------------------------ |
| Typecheck  | `pnpm --filter @watchdog/policy typecheck` |
| Unit tests | `pnpm test:unit`                           |

## Gotchas

- `assertPatchGates` / `assertPatchShape` return `Effect<void, CustodyViolation>`. The shape helpers `requireString` / `requireEnum` throw `CustodyViolation` and `runGate` rethrows that tagged error (never a plain `Error`). Tests use `it.effect` from `@effect/vitest`.
- Browser UI imports `@watchdog/policy/patch-needs-confidence`, never the package root (Effect-tagged gates). Guidance; no lint rule.
