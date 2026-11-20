# Policy package (`@watchdog/policy`)

> Scope: `packages/policy` (inherits root AGENTS.md)

Pure Graph write custody (`assertPatchGates` / Accept rules). No DB, Caps, or I/O: it depends on `@watchdog/schemas` (plus `effect` for the error channel) only, which `package.json` holds. Callers in `core` own persistence.

## Commands

| Task       | Command                                    |
| ---------- | ------------------------------------------ |
| Typecheck  | `pnpm --filter @watchdog/policy typecheck` |
| Unit tests | `pnpm test:unit`                           |

## Gotchas

- `assertPatchGates` returns `Effect<void, CustodyViolationError>` and holds only rules that span a patch's ops (the confidence a patch needs, the Evidence a `confirmed` Accept needs). An op's own shape is the op union's (`patchOpSchema` in `@watchdog/schemas/graph`), refused where the Proposal is created; never add a per-op shape check here. Tests use `it.effect` from `@effect/vitest`.
- Browser UI imports `@watchdog/policy/patch-needs-confidence` and `@watchdog/policy/confirmed-evidence`, never the package root (Effect-tagged gates). Guidance; no lint rule.
- `confirmed-evidence.ts` is the one home of the "confirmed needs Evidence" predicate and message (pure, no Effect or node). Never retype the message elsewhere: lint rule `watchdog/no-reimplemented-custody-message` fails on a string, template or concatenation that spells it (tests included); `confirmed-evidence-literal.test.ts` is the raw-text backstop.
