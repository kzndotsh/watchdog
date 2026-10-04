# Platform packages

**What this is:** the import-direction matrix for `apps/*` and `packages/*` (15 packages, 4 apps).  
**What this is not:** Cap SPI ([`caps-boundary.md`](caps-boundary.md)), jobs/oRPC ([`jobs-orpc.md`](jobs-orpc.md)), web Start/Query ([`../web/architecture.md`](../web/architecture.md)).

The package list is `packages/*/package.json` and `apps/*/package.json`; each package's own `AGENTS.md` says what it owns. Do not duplicate the list here.

## Enforcement

- **Declared `dependencies`** are the matrix: pnpm's strict `node_modules` means an undeclared `@watchdog/*` import does not resolve (`pnpm typecheck` fails). Declaring a forbidden dependency fails nothing, so the rows below are guidance unless another bullet names a gate.
- **`pnpm check:boundaries`** (`scripts/check-boundaries.mjs`, pre-commit and CI): an import of `@watchdog/*` must name a workspace package the importer declares, through a path its `exports` map lists; the failure names the public entry points. Packages and apps never import an app.
- **oxlint `no-restricted-imports`** (`oxlint.config.ts`): `apps/web` may not import `@watchdog/db` or unwrapped primitives; `apps/cli` may not import `core`, `db`, `api`, `log` or `env`; `packages/ui` wrappers may not import `db`.
- **`import/no-cycle: error`** across the workspace.
- **`packages/db/scripts/check-repo-rules.mjs`** (CI "Repo layer contract") enforces the repos rules: no `SQL`-typed parameters, no transaction, no throw, no notify, `exec` first, and no `.toISOString()` (its only DTO check).
- Everything else in the "Must not import" column is guidance backed only by the dependency declarations.

## Forbidden imports

| Package | Must not import |
| --- | --- |
| `@watchdog/env`, `@watchdog/schemas`, `@watchdog/ui`, `@watchdog/log` | any other `@watchdog/*` (leaf packages) |
| `@watchdog/policy` | db, caps, core, api, apps, tools, ai |
| `@watchdog/db` | caps, core, api, apps. Owns schema + `repos`. Dev-only `test-db` is the one allowed cycle ([`packages/test-db/AGENTS.md`](../../../packages/test-db/AGENTS.md)) |
| `@watchdog/ai` | db, caps, core |
| `@watchdog/tools` | db, caps, core, ai, api, apps (prefer zero workspace deps) |
| `@watchdog/caps` (incl. SPI `@watchdog/caps/sdk`) | **db**, core, api, apps |
| `@watchdog/auth` | api, core, caps, apps, `@tanstack/*`. Depends on db (Better Auth adapter), env, log, schemas |
| `@watchdog/core` | api, apps. Uses db **repos only** (no `drizzle-orm`); callers import per-domain subpaths (`@watchdog/core/cases`, `/graph`, `/jobs`, ...); worker imports `@watchdog/core/worker` |
| `@watchdog/api` | apps, **db**, drizzle-orm (goes through core) |
| `@watchdog/client` | api, apps, db, caps, core, log (generated JSON in `src/generated`; the `app-router` type entry aliases the live `AppRouter` in-monorepo only) |
| `@watchdog/test-kit`, `@watchdog/test-db` | dev only: never imported from production code |
| `apps/cli` | core, db, api, env, log (talks HTTP via `@watchdog/client` + schemas) |
| `apps/web` | **db** (auth's db access is `@watchdog/auth`; the SSE route uses core) |
| `apps/worker` | declares only core, env, log, schemas |
| `apps/site` | any `@watchdog/*` runtime package, `apps/web/src` (tokens are copied, not imported) |

## Where shared contracts live

`PatchOp`, `patchOpSchema` and `EvidenceSnapshot` live in **`@watchdog/schemas`** so Caps never depend on Drizzle. Accept/apply-patch custody (`assertPatchGates`, `patchNeedsConfidence`) lives in **`@watchdog/policy`**: pure, DB-free; import policy and schemas directly, do not re-export through core. Browser code imports `@watchdog/policy/patch-needs-confidence`, not the barrel ([`../contracts/custody.md`](../contracts/custody.md)). Full ownership map: [`types.md`](types.md).
