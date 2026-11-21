# Platform workspaces

**What this is:** the five workspaces (plus the standalone `apps/site`), the folders inside them, and the import-direction rules between them.  
**What this is not:** Cap SPI ([`caps-boundary.md`](caps-boundary.md)), jobs/oRPC ([`jobs-orpc.md`](jobs-orpc.md)), web Start/Query ([`../web/architecture.md`](../web/architecture.md)).

## Layout

| Workspace | Folders | What it holds |
| --- | --- | --- |
| `packages/domain` (`@watchdog/domain`) | `schemas`, `policy`, `test-kit` | Pure types and vocabulary, custody rules, the test harness every workspace's tests share. No workspace dependency |
| `packages/caps` (`@watchdog/caps`) | `src` (Caps, Playbooks, SDK), `tools`, `ai` | Caps and the provider tools and model calls they use. Depends on domain only |
| `packages/server` (`@watchdog/server`) | `core`, `api`, `db`, `auth`, `env`, `log`, `test-db`, `worker` | The services, the oRPC router, the schema and repos, identity, boot config, logging and the Job runner. Depends on domain and caps |
| `apps/web` (`@watchdog/web`) | `src`, `ui` (vendored shadcn) | The web app and its HTTP entry. Depends on domain and server |
| `apps/cli` (`@watchdog/cli`) | `src`, `client` (generated API client) | `wd`. Depends on domain only; talks HTTP |

`apps/site` is the static Astro page and depends on no workspace. A feature usually touches one or two workspaces: the server folder that owns it and the web screen that shows it.

A folder imports another folder of its own workspace through the workspace's subpath imports (`package.json` `imports`: `#db`, `#core/jobs`, `#tools/http`, `#ui/components/button`, `#client`). Another workspace imports it through `exports` (`@watchdog/server/core/jobs`, `@watchdog/caps/tools/http`, `@watchdog/domain/schemas/shared`). Only the entries those maps list resolve.

## Enforcement

- **Declared `dependencies`**: pnpm's strict `node_modules` means an undeclared `@watchdog/*` import does not resolve (`pnpm typecheck` fails).
- **`pnpm check:boundaries`** (`scripts/check-boundaries.mjs`, `pnpm verify` and CI): a `@watchdog/*` import names a declared workspace through its `exports`; a `#` import names an entry of the importer's `imports`; a relative path into another workspace or from one folder into another fails; apps are never imported. **`DENY_LIST`** is the one statement of which code may not import what, tests included, relative paths into a denied folder counted:

  | Code under | Never imports | Why |
  | --- | --- | --- |
  | `packages/caps/` | `@watchdog/server`, `drizzle-orm`, `postgres`, `pg` | A Cap cannot write the Graph |
  | `packages/server/api/` | `#db`, `drizzle-orm` | api goes through core |
  | `packages/server/core/` | `drizzle-orm`, `#api`, `#auth`, `#worker` | core calls repos and sits below the entries |
  | `packages/server/worker/` | `#db`, `drizzle-orm`, `#api`, `#auth` | The worker runs core and nothing else |
  | `packages/server/auth/` | `#core`, `#api`, `#worker` | auth takes its database handle as a parameter |
  | `packages/server/db/` | `#core`, `#api`, `#auth`, `#worker` | db is below every service |
  | `packages/server/env/`, `packages/server/log/` | the other server folders | Leaves every folder reads |
  | `packages/domain/schemas/` | `#policy` | policy is written in the schema vocabulary |
  | `packages/domain/test-kit/` | `#schemas`, `#policy` | Usable by every workspace's tests |
  | `packages/caps/tools/` | `#ai` | Model calls belong to the Cap that makes them |

  It also keeps Cap ids and Vault slot names out of `packages/caps/tools/src`, and holds the core and web domain folders acyclic.

- **oxlint `no-restricted-imports`** (`oxlint.config.ts`): `apps/web` may not import `@watchdog/server/db` or unwrapped primitives; `apps/cli` may not import the server; core and auth may not import the global pool from `#db`.
- **`import/no-cycle: error`** across the repo.
- **oxlint `watchdog/db-repo-*` rules** (`scripts/oxlint-plugin/`, scoped to `packages/server/db/src/repos/*.repo.ts`) enforce the repos rules: no `SQL` type, no transaction, no throw, no notify, `exec: DbExec` first, no `.toISOString()` (its only DTO check), no `trimmedOrNull`, `trimmedOrUndefined` only in lookup methods, no job status set literal, no zod import, and no raw `sql` fragment (baselined).
- `test-kit` and `test-db` are dev only: production code never imports them (`watchdog/no-test-imports-in-production`).

## Where shared contracts live

`PatchOp`, `patchOpSchema` and `EvidenceSnapshot` live in **`packages/domain/schemas`** (imported from `@watchdog/domain/schemas/graph` and `@watchdog/domain/schemas/evidence`; there is no schemas root export) so Caps never depend on Drizzle. Accept/apply-patch custody (`assertPatchGates`, `patchNeedsConfidence`) lives in **`@watchdog/domain/policy`**: pure, DB-free; import policy and schemas directly, do not re-export through core. Browser code imports `@watchdog/domain/policy/patch-needs-confidence`, not the barrel ([`../contracts/custody.md`](../contracts/custody.md)). Full ownership map: [`types.md`](types.md).
