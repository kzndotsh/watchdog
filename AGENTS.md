# AGENTS.md — Watchdog

Watchdog platform monorepo: Postgres + TypeScript under `apps/` · `packages/`. Investigation content (corpus, entity notes, vault vocabulary) lives in a separate private repo and never enters this one.

Authority: product nouns → [`docs/glossary.md`](docs/glossary.md) (doctrine and narrative: [`docs/explanation/product.md`](docs/explanation/product.md); layout: [`docs/agents/domain.md`](docs/agents/domain.md)). Platform/UI contracts → [`docs/`](docs/README.md) and [`docs/reference/web/`](docs/reference/web/README.md). Design values → [`DESIGN.md`](DESIGN.md), where the CSS in `apps/web/src/styles/` wins. Hooks and CI gates: [`docs/contributing/ci-gates.md`](docs/contributing/ci-gates.md).

## Quick reference

| Task | Command |
| --- | --- |
| Toolchain | `nix develop` (installs lefthook) |
| Local infra (Postgres + S3 + migrate) | `just up` · `just docker-up` (containers only) |
| Wipe case data | `just wipe` · `just wipe yes` (keeps auth incl. organizations, and vault) |
| Screenshot seed | `just seed-demo` · `just seed-demo --force` |
| Perf baseline (scratch DB at audit scale, query stats) | `just perf-seed` · `just perf-seed-drop` ([`perf-baseline`](docs/how-to/perf-baseline.md)) |
| Install / migrate | `pnpm install` · `pnpm db:migrate` |
| Local `.env` · first admin · vault key | `just env` (generated secrets) · `just admin --email you@example.com` (no signup) · `WD_MASTER_VAULT_KEY_OLD=... just vault-rekey` (rotate) |
| Dev | `just dev` (infra + web :3000 + site :3001 + worker) · `pnpm dev:web` · `pnpm dev:site` · `pnpm dev:worker` · `pnpm exec wd` (after `pnpm build:cli`) |
| Lint / fix | `pnpm check` · `pnpm fix` |
| Affected packages | `pnpm changed` (list, with dependents) · `pnpm changed --run` (typecheck + unit tests for them only) |
| Typecheck / test | `pnpm typecheck` · `pnpm test` · `pnpm test:component` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm test:e2e:smoke` |
| Gates | `pnpm check:agents:strict` · `pnpm validate:agents` · `pnpm check:docs:strict` · `pnpm check:docs-affected:strict` · `pnpm check:tagged-errors:strict` · `pnpm check:design-tokens` · `pnpm lint:design` · `pnpm check:size` · `pnpm check:bundle` · `pnpm check:vendor` · `pnpm check:workspace` · `pnpm check:boundaries` · `pnpm check:workspace-reexports` · `pnpm check:migrations` · `pnpm check:env` · `pnpm check:licenses` · `pnpm check:notices` |
| Container images (web, worker) | `docker build --target web .` · `docker build --target worker .` · prod stack: [`self-host`](docs/how-to/self-host.md) · smoke: `docker/smoke.sh` |
| Vendored shadcn | `pnpm ui:add <name>` · `pnpm ui:sync` |
| Regenerate | `pnpm generate:caps` · `pnpm generate:client` · `pnpm generate:env` (`env.example`, configuration reference) |
| Desloppify (local, advisory) | `pnpm desloppify:bootstrap` · `:scan` · `:status` · `:next` |

Package manager: **pnpm** only. Solo signup: `BETTER_AUTH_ALLOW_SIGNUP=1` → `/auth/sign-up` → set `0` (first account is the instance admin; see [`auth-setup`](docs/how-to/auth-setup.md)). Vitest projects share workers: tests must restore any `process.env`, `globalThis`, timers, or DOM they change ([`standards.md`](docs/contributing/testing/standards.md)).

## Effect

Before writing Effect code, read `node_modules/effect/AGENTS.md` completely, then search `node_modules/effect/src` for APIs it skips. Watchdog runtime conventions (`run*` edges, `JobFibers`, Cap `run`, browser policy) live in the `/effect` skill. One deliberate departure: boundary schemas are Zod, not Effect Schema ([ADR-0001](docs/adr/0001-zod-at-the-boundary.md)). `repos/effect` is an optional gitignored clone: never import from it.

## Nested AGENTS.md

Read the nested `AGENTS.md` before editing its tree, as an explicit step: auto-attachment of nested files is not reliable. One exists in each of `apps/{cli,site,web,worker}` and `packages/{ai,api,auth,caps,client,core,db,env,log,policy,schemas,test-db,test-kit,tools,ui}`.

## Agent skills

Workflows live in [`.agents/skills/`](.agents/skills/) (and per package, e.g. [`packages/caps/.agents/skills/`](packages/caps/.agents/skills/)); `.claude/skills` symlinks to the root set. Load them by name: `/audit-contract`, `/check-gates`, `/finalize`, `/create-cap`, `/effect`. Vendored skills are pinned in `skills-lock.json` and read `docs/agents/` (issue tracker, triage labels, domain docs).

## Boundaries

Every convention is enforced by a lint rule or gate, labeled guidance, or deleted: [`docs/reference/platform/conventions.md`](docs/reference/platform/conventions.md) is the table (add a rule's row in the same change as the rule).

Canonical detail: [`docs/reference/contracts/`](docs/reference/contracts/README.md). Package import boundaries (declared dependency, public `exports` entry, no app imports) are enforced by `pnpm check:boundaries`, plus `no-restricted-imports` in `oxlint.config.ts` for named bans; the matrix is not restated here.

| Do | Don’t | Enforced by |
| --- | --- | --- |
| Postgres = Case Graph SoT; Export is a projection | Hand-edit Export as a second SoT | guidance ([`ingress`](docs/reference/contracts/ingress.md)) |
| Collect → Evidence; Caps `interpret` → Proposal → Triage Accept | Caps/machines write Graph or set `confirmed` | `@watchdog/policy` gates at runtime; caps has no db dep ([`custody`](docs/reference/contracts/custody.md)) |
| Agents/CLI default to propose; a graph write needs `userOverride` and lands `unverified` + `graph_writes` | Silent machine Graph writes | policy gates + `apps/cli/src/custody.ts` ([`agent-ingress`](docs/reference/contracts/agent-ingress.md)) |
| Secrets via vault / `ctx.getCredential` | Cap secrets in env or `Job.input` | guidance |
| Chrome: Queue + Detail | Console / Workbench / Tape surfaces; a screen named `*Panel` | `watchdog/no-banned-surface-name` for the first three; `*Panel` is guidance ([ui lexicon](docs/reference/web/ui/README.md#chrome-lexicon-ui-parts)) |
| Process logs via `@watchdog/log` | Secrets/Evidence bodies in logs; treating evlog as Graph audit | guidance ([`evlog`](docs/reference/contracts/evlog.md)) |

Ingress: Collect → Evidence · Caps → artifacts + Proposal · Triage Accept → Graph · Dossier = human Graph edit. Accept tiers and breach caveats: [`custody`](docs/reference/contracts/custody.md).

## House rules

The rules agents break most. The full set, with enforcers, is the [conventions table](docs/reference/platform/conventions.md); the graph-write, nested-`AGENTS.md` and test-isolation rules are above.

- Reuse before you write: check [Canonical helpers](#canonical-helpers) for an existing util, constant or predicate. A second copy is the most common AI-authored defect. Guidance; the table's entries are verified by `check:agents:strict`.
- A server-side failure is `InternalError` (500, fixed message), never `InvalidError`, which is only for caller input. The mapping is tested in `packages/api/src/__tests__/map-domain-error.test.ts`; choosing the right error is guidance.
- Never silence a test type error with a cast or `@ts-expect-error`; fix the types. Guidance (`pnpm typecheck` covers tests).
- Tracked `src` files stay at most 600 lines: `check:size`.
- Code mapped in `scripts/doc-map.mjs` changes with its doc: `check:docs-affected:strict`.

## Gotchas

- `pnpm test` runs the unit, web-unit, e2e-parser, property and gate projects in one vitest invocation and reports every failing project; the gate tests (`scripts/__tests__/*.gate.test.ts`) spawn real scripts in throwaway git repos. `pnpm typecheck` checks each package once on `tsconfig.test.json` (source and tests, incremental cache in `node_modules/.cache`), plus `scripts/` and `e2e/`, with the test-coverage guard in parallel: a new test file missing from its `tsconfig.test.json` fails. Production code importing test-only code or a `.ts` path is a lint error, not a typecheck one.
- `docs-affect` runs at **commit-msg**, not pre-commit. When no mapped doc applies, put `docs:allow-affect — <reason>` in that commit's own message.
- The formatter ignores `docs/glossary.md`, `.agents/`, `.cursor/` and `.claude/`: `ultracite` run on only those files exits 2 (the pre-commit hook excludes them). `.mjs` scripts and `e2e/` lint correctly by path (`scripts/tsconfig.json` and `e2e/tsconfig.json` give them type context; they are lint programs, never typechecked or emitted), and the pre-commit hook lints only the staged ones.
- A dependency declared by two or more packages (root included) takes its version from the default `catalog:` in `pnpm-workspace.yaml` (`"effect": "catalog:"`); a literal range there fails `pnpm check:workspace`. Peer ranges stay literal. Every `overrides` entry carries a reason and a revisit condition.
- `pnpm knip` loads the Drizzle config, so it needs `DATABASE_URL` set (any value). It ignores `.claude/worktrees/`.

## Canonical helpers

Verified by `check:agents:strict`: each module exists and exports the name. Add a row when a helper lands.

| Concern | Module | Export |
| --- | --- | --- |
| DB call into the domain error channel: a non-repo driver call, or a repo call with `opts` (a repo call without them is `xRepoFx`, below) | `packages/core/src/infra/postgres-effect.ts` | `tryDb` |
| `tryDb` with the client from the `Db` service, for the same cases (module `db` import is banned in core) | `packages/core/src/infra/postgres-effect.ts` | `tryDbWith` |
| The Postgres pool's one owner per process (`Db.owned`, scoped: release ends the client; `Db.layer` borrows it; production code never imports the global `db` / `client`) | `packages/core/src/infra/db-service.ts` | `Db` |
| A repo call in an Effect (all of core, #444/#445; a repo call is never wrapped in `tryDb`/`tryDbWith` unless it passes `opts`: `watchdog/no-repo-wrapper`): `xRepoFx.m(exec, ...)` with an explicit handle, `xRepoFxDb.m(...)` on the pool (`R = Db`) | `packages/core/src/infra/repos-fx.ts` | `jobsRepoFx`, `jobsRepoFxDb` |
| A helper whose handle is optional (a caller's `tx`, else the pool): `onExec(exec, (h) => xRepoFx.m(h, ...))` | `packages/core/src/infra/repo-fx.ts` | `onExec` |
| A declared list's SQL binding (ADR-0007): filters, sorts with their key type, search columns; typed against the declaration and the table | `packages/db/src/repos/_list-query.ts` | `defineListRepo` |
| A declared list's service body: cursor v2, page, capped total; rows by id | `packages/core/src/infra/list-page.ts` | `listPageEffect`, `listByIdsEffect` |
| A write that must return a row (or `true`, for link writes): a miss is `InternalError` (`Failed to <what>`); never hand-write it | `packages/core/src/infra/postgres-effect.ts` | `requireWritten` |
| Outbound HTTP from Caps and tools (never `fetch` directly; lint-enforced): the scoped client whose pools close at shutdown | `packages/tools/src/http/outbound-client.ts` | `OutboundClient`, `outboundClientLayer` |
| Cap HTTP user agent (never hard-code one; `defineCollectCap` hands it to `fetch(ctx, { userAgent })`, lint-enforced) | `packages/tools/src/errors/user-agent.ts` | `watchdogUserAgent` |
| A Cap's data provider and its terms (required `provider`; `unknown` when the terms are unclear, never a guess; shared constants in `packages/caps/src/providers/`) | `packages/caps/src/sdk/provider.ts` | `defineProvider` |
| Web failure copy (`Couldn't <verb> <noun>`) | `apps/web/src/lib/utils.ts` | `couldnt`, `errMessage`, `serverFailureMessage`, `isServerFailure` |
| Unsaved-changes guard (router blocker + `beforeunload` while a form or editor is dirty; render `UnsavedChangesDialog` with the result) | `apps/web/src/shared/hooks/use-unsaved-guard.ts` | `useUnsavedGuard` |
| Typing debounce (named delays in `shared/lib/debounce.ts`) | `apps/web/src/shared/hooks/use-debounced-value.ts` | `useDebouncedValue` |
| External link showing only the hostname (a narrow column; `urlHost` in `shared/lib/url-host.ts`) | `apps/web/src/shared/ui/external-host-link.tsx` | `ExternalHostLink` |
| A declared list's web view: keys under the domain root, pages to `LIST_MAX_PAGES`, throttled refresh (built in the domain's `queries.ts`) | `apps/web/src/shared/lib/list/list-view.ts` | `listView` |
| A list screen's state (URL view, search draft, status, count, Load more, selection; never per-screen filter state) | `apps/web/src/shared/hooks/list/use-list.ts` | `useList` |
| A list's table in server mode (declared sorts only, `getRowId` required) | `apps/web/src/shared/hooks/list/use-list-table.ts` | `useListTable` |
| A list's per-viewer columns, toggles and density | `apps/web/src/shared/hooks/list/use-list-display.ts` | `useListDisplay` |
| A route's search patch writer (history replace) | `apps/web/src/shared/hooks/list/use-patch-search.ts` | `usePatchSearch` |
| The list toolbar, table, body and count | `apps/web/src/shared/ui/list/index.ts` | `ListToolbar`, `ListTable`, `ListBody`, `ListCount` |
| A tab's count from a list's first-page `total` (never a whole read) | `apps/web/src/shared/hooks/list/use-list-count.ts` | `useListCount` |
| A list page ServerFn double for screen tests (filters, `q`, sort, cursors, total on page one) | `apps/web/src/testing/memory-list.ts` | `memoryListPage` |
| A server-searched picker's state: one small page by `q` (recent when empty), selected values by id; linked-row titles by id (never a whole list) | `apps/web/src/shared/hooks/use-picker-source.ts` | `usePickerSource`, `useRecordsByIds` |
| A picker port over in-memory rows for shared-UI tests (spied `search` / `byIds`) | `apps/web/src/testing/memory-picker-port.tsx` | `memoryPickerPort` |
| Class merging | `apps/web/src/lib/utils.ts` | `cn` |
| Slugs | `apps/web/src/lib/utils.ts` | `slugifyName`, `nextAutoSlug` |
| Opaque id text | `apps/web/src/shared/ui/format-opaque-id.ts` | `formatOpaqueId` |
| Opaque id chip | `apps/web/src/shared/ui/id-chip.tsx` | `IdChip` |
| Query invalidation after mutation or SSE | `apps/web/src/shared/lib/query-invalidation.ts` | `invalidateAfterEntityChanged`, `bindCasesChangedInvalidation` |
| Hotkey registry and mod-key label | `apps/web/src/shared/lib/hotkeys.ts` | `HOTKEYS`, `modKeyLabel` |
| Mod-key label in components | `apps/web/src/shared/hooks/use-mod-key-label.ts` | `useModKeyLabel` |
| A declared list: filters, sorts, search and the one canonical query (key, URL, cursor fingerprint); generic code calls it through `opsOf` | `packages/schemas/src/lists/define-list.ts` | `defineList`, `opsOf` |
| Search minimum query length | `packages/schemas/src/search.ts` | `SEARCH_MIN_QUERY_LENGTH` |
| Accept gate | `apps/web/src/domains/triage/lib/accept-gate.ts` | `acceptGate` |
| Confirmed requires evidence (rule and message; retyping the text fails `watchdog/no-reimplemented-custody-message`) | `packages/policy/src/confirmed-evidence.ts` | `confirmedNeedsEvidence`, `confirmedEvidenceViolation`, `CONFIRMED_REQUIRES_EVIDENCE` |
| Confirmed-blocked check over a web form's evidence ids | `apps/web/src/shared/lib/confirmed-evidence.ts` | `isConfirmedBlocked` |
| Active-Case switch | `apps/web/src/domains/cases/hooks/use-select-active-case.ts` | `useSelectActiveCase` |
| Case in caller's org (guard) | `packages/core/src/graph/patch/guards.ts` | `assertCaseInOrgEffect` |
| Case ids visible to an org | `packages/core/src/cases/cases.ts` | `listVisibleCaseIdsEffect` |
| Age a seeded Job in tests | `packages/test-db/src/db/seed/job.ts` | `backdateJob` |
| Who writes the Graph, for `graph_history` and `created_by` / `updated_by` (first statement of every Graph write transaction; the database triggers do the rest) | `packages/core/src/graph/graph-activity.ts` | `setHistoryContextEffect` |
| Job status change (the only writer; a lint rule bans others): claim, finish, fail, cancel, reclaim | `packages/core/src/jobs/lifecycle/settle.ts` | `settleJobEffect` |
| Cancel Jobs inside the caller's transaction (API cancel, Case delete; `afterCommit` aborts fibers and advances runs) | `packages/core/src/jobs/lifecycle/cancel.ts` | `cancelWithin` |
| Stop Jobs from outside a transaction (abort, timeout, access loss) | `packages/core/src/jobs/lifecycle/stop.ts` | `stop` |
| The worker's one Job settle (claim, preflight, Cap body, release from the Exit) | `packages/core/src/jobs/lifecycle/run.ts` | `run` |
| Worker reconcile tick (stale, access-lost, stuck and orphaned Jobs; drifted Collect queue Cases) | `packages/core/src/jobs/lifecycle/reconcile.ts` | `reconcileJobsEffect` |
| Two-writer race with controlled interleaving (writer A runs to a named point, B runs or blocks on A's lock, A continues; read the activity log with `listAllActivity`, never the commit-safe `drain`) | `packages/test-db/src/db/two-writers.ts` | `twoWriters` |
| Collect's queue projection in a rolled-back test (runs the flush the COMMIT would; the `seed*` helpers call it) | `packages/test-db/src/db/collect-queue.ts` | `flushCollectQueue` |
| Collect's queue rules in TypeScript (the oracle for the SQL projection and for `buildCollectIndex`) and the 12-case fixture | `packages/schemas/src/testing/collect-queue-reference.ts` | `collectQueueReference` |
| Gate-script test repo | `scripts/__tests__/helpers/gate-repo.ts` | `gateRepoFactory` |
| `@/auth/server` in web tests (registered for every web test by a setup file; never copy `vi.mock("@/auth/server", ...)`) | `apps/web/src/testing/auth-server-double.ts` | `authServerDouble` |
| Shared lazy chunks in web tests (list popovers, the Evidence checklist, the Identifier composer row; `beforeAll` in every test file that renders one, so `findBy*` never races a cold chunk; `shared-lazy-chunks.test.ts` fails on a shared `memoizeImport` loader it misses) | `apps/web/src/testing/shared-lazy-chunks.ts` | `preloadSharedLazyChunks` |
| `@/shared/ui/toast` spies in web tests | `apps/web/src/testing/toast-double.ts` | `toastModuleDouble` |
| Web test records (Evidence, Entity, Entity and Identifier list rows, Job, Proposal, Task board card, provider call, Cap and Playbook catalog entries; never a local `evidence()` / `job()` factory) | `apps/web/src/testing/records.ts` | `buildEvidenceRecord`, `buildEntityRecord`, `buildEntityListItem`, `buildEntityListConnection`, `buildCaseIdentifierRecord`, `buildJobListRecord`, `buildJobRecord`, `buildProposalRecord`, `buildProposalQueueItem`, `buildTaskListItem`, `buildCapListItem`, `buildPlaybookListItem`, `buildProviderCallRecord`, `buildProviderCallList` |

## Where to look

[`docs/README.md`](docs/README.md) (platform) · [`docs/reference/web/README.md`](docs/reference/web/README.md) (UI, Query, domains) · [`caps-lexicon`](docs/reference/platform/caps-lexicon.md) (Caps, playbooks) · [`docs/roadmap.md`](docs/roadmap.md) · [`README.md`](README.md) (run the app).
