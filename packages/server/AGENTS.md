# Server guide

> Scope: the server workspace `packages/server` (`core`, `api`, `db`, `auth`, `env`, `log`, `test-db`, `worker`) and the server-facing parts of `packages/domain` (`schemas`, `policy`, `test-kit`). Inherits the root [AGENTS.md](../../AGENTS.md).

Layers: `schemas` (Zod types and vocabulary, a leaf) → `db` (Drizzle schema and repos: the only SQL) → `core` (Effect services) → `api` (oRPC procedures) and `worker` (the Job runner). `policy` is pure custody rules, `tools` is fetch and parse with no Graph, `auth` is server identity, `env` the boot config, `log` process logging. Inside the workspace a folder imports another through the package's subpath imports (`#db`, `#core/jobs`); other workspaces use `@watchdog/server/<folder>/...`. `pnpm check:boundaries` holds the deny list and the public subpaths; reference: [`docs/reference/platform/`](../../docs/reference/platform/README.md).

## Database (`packages/server/db`)

- The TypeScript schema is the source. `pnpm db:generate --name=<what_changed>`, then `pnpm db:migrate`; `check:migrations` fails a schema edit without its migration. Functions, triggers and grants are hand-written SQL in `0000_baseline`: change one with a new `--custom` migration holding `CREATE OR REPLACE`.
- Three roles: the owner (`DATABASE_URL_MIGRATE`) owns every object and migrates; the app connects as `watchdog_app` with data privileges only; the worker as `watchdog_worker`, the same minus Graph writes. A new append-only table joins `AUDIT_TABLES` and a new Graph table joins `GRAPH_TABLES` (`db/src/app-role.ts`): revocations cannot live in a migration, because default privileges re-grant on each new table.
- An API-key request runs as `watchdog_worker` unless its procedure declares `graph:write`; a session never switches. A route outside the router passes its credential with `runAppAs`.
- Triggers own `updated_at`, the Graph row `version`, `created_by` / `updated_by`, `graph_history`, the activity NOTIFY and the row-level security `organization_id`. Code never writes them.
- Enums are `text().$type<T>()` with a `vocabCheck` (never `pgEnum`), JSONB columns have a concrete `$type`, there is no `relations()`, and a branded id column is `.$type<CaseId>()` / `.$type<OrganizationId>()`.
- A child row carries `case_id` and composite foreign keys `(x_id, case_id)` to its parent; every foreign key has an index led by its column (`fk-indexes.int.test.ts`).
- Deleted Cases and Evidence stay as tombstones and are excluded by default (every read of `cases` takes `visibleCase`); a method that looks past that is named `*IncludingDeleted` (any state) or `*Deleted*` (tombstones only).
- Repos return rows, take `exec` first, never throw a domain error (a miss is `null` / `[]`), never open a transaction and never send a NOTIFY; the `watchdog/db-repo-*` lint messages give each reason. Search patterns go through `containsPattern`.
- `db/drizzle.config.ts` loads the repo `.env` with dotenv: it cannot resolve `#env`.

## Services (`packages/server/core`)

- Services are `*Effect` programs that keep `DomainTag` in `E`. The only `run*` edges are `runApp` / `runDomain` and the sanctioned ones in `oxlint.config.ts`; tests bridge with `runDomainWith(layer)`.
- `Db.owned` is the process's one owner of the Postgres pool; production code never imports the global `db` / `client`. Repo calls go through `xRepoFx` (`@canonical` in `infra/repos-fx.ts`).
- A `transact` inside another `transact` body dies with a defect: pass `tx` down. A detached fiber resets the guard with `outsideTransaction` and may open its own. Inside a transaction pass `tx` into the `assert*InCase` helpers, never the pool.
- Case-scoped Effects take the actor's `organizationId`, gate with `assertCaseInOrgEffect` and run in `inOrganization`; only worker and export paths use `inCaseOrganizationUnchecked` ([organization isolation](../../docs/reference/contracts/custody.md#organization-isolation)).
- The Graph mutation module (`graph/mutation/`) is the only Graph write path. `setHistoryContextEffect` is the first statement of every Graph write transaction; without it the database refuses the write (`WD001`).
- Every domain change appends to the activity log with `appendActivityEffect` on its own `tx`; the database trigger notifies at commit. A new status-changing path appends in the same transaction; add no notify call.
- Only `jobs/lifecycle/` writes a Job's status (lint). Enqueue only with `enqueueCapJobEffect(tx, ...)` inside the Job's transaction. A process composes one queue role Layer (`jobQueueProducerLayer` or `jobQueueWorkerLayer`) and never builds a `PgBoss` itself.
- `Vault`, `BlobStore`, `JobQueue` and `OutboundClient` are composed once per process (`coreServicesLayer`, `AppLive`). Tests use `fakeVault`, `recordingBlobStore`, `recordingJobQueue`; never `vi.mock` those modules.
- Time comes from Effect's `Clock` (`nowDateEffect`, `TestClock` in tests), never `new Date()` for now.
- A Case rename forks an export write with its own services: a test that changes a Case name or slug provides `isolatedExportWriteServices()`.
- Case delete is a tombstone. Every lifecycle change goes through `recordDeletionEventEffect` (the database guard `WD002` refuses one without its record).
- Playbooks are user-initiated and never auto-fire; `advancePlaybookRunEffect` is the only chain.
- Job status subsets come from `vocab.ts` in schemas; never repeat a status array.

## API (`packages/server/api`)

- Procedures are built from `authed` (lint), declare `.meta({ scope })` (`org-isolation-coverage.test.ts`), and pass `context.actor.organizationId` to core. Triage accept and reject, Case delete, restore and purge, credential writes and organization settings are `sessionAuthed`: an API key is refused whatever its scopes.
- A new procedure joins the org-isolation attack matrix or its reasoned allowlist; a list procedure is a declared list (ADR-0007) or a bounded list in `pagination-coverage.test.ts`.
- Credentials procedures expose vault slots, never plaintext. A new transport error code changes `apiErrorMap`, `toOrpcError` and the client types together.

## Identity, config and logs (`packages/server/auth`, `env`, `log`)

- Auth takes its database handle as a parameter. Framework plugins go last (`createAuth({ trailingPlugins })`). API keys are created only by `createScopedApiKey`. Never log an invitation accept URL.
- The session cookie cache stays 60 s without refresh unless the revocation window in [`auth-setup`](../../docs/how-to/auth-setup.md) changes with it; an endpoint that changes roles, bans or membership joins `needsAuthoritativeSession`.
- An env field carries `.meta({ description, sensitive, usedBy })`; run `pnpm generate:env` and add it to `env.production.example`. Read `env.FOO`, not `process.env`. `SKIP_ENV_VALIDATION=1` parses leniently, so code never restates a default.
- Log an error with `log.error(err)`, never `log.set({ error })` (an `Error` serializes to `{}`). Redaction keeps only evlog's `secrets` builtin (the value maskers corrupt UUIDs); `error-scrub.ts` is the one scrubber.

## Worker (`packages/server/worker`)

- The worker is thin: logic stays in core, and it never imports `#db`. `main.ts` imports `#env/worker` first, which swaps in `DATABASE_URL_WORKER`; keep it first. A repeated task is one entry in core's `MAINTENANCE_TASKS`.
- The image runs a bundle (`dist/worker.mjs`): boot code reads no file beside the source tree. Timing comes from the Cap's `timeoutMs`, never a hard-coded timeout.

## Tests

- Integration: `withTestTx` when the code under test takes `tx` (it always rolls back); `resetTestDb()` when a test must commit; `resetE2eDb()` from Playwright only. Seed through the `seed*` helpers (real repos); a direct Graph write in a test runs in `withSystemHistoryContext` / `withSystemTestTx`.
- Races use `twoWriters`, never a sleep. Count activity with `listAllActivity()`, never `activityLogRepo.drain` (commit-safe: it hides rows behind open transactions). Read Collect's queue after `flushCollectQueue(tx)`.
- `test-kit` imports no workspace package. Branded id fixtures (`testCaseId`, `TEST_ORGANIZATION_ID`, `testActor`, `untrusted*`) live in `@watchdog/domain/schemas/testing`, the one tree exempt from `watchdog/no-brand-cast`.
- Core tests never import `drizzle-orm`; generic padded-UUID trimming is tested once in its owners, not again per service.
