# AGENTS.md — Watchdog

Watchdog platform monorepo: Postgres + TypeScript under `apps/` · `packages/`. Investigation content (corpus, entity notes, vault vocabulary) lives in a separate private repo and never enters this one.

Authority: product nouns → [`GLOSSARY.md`](GLOSSARY.md) (doctrine and narrative: [`docs/explanation/product.md`](docs/explanation/product.md); layout: [`docs/agents/domain.md`](docs/agents/domain.md)). Platform/UI contracts → [`docs/`](docs/README.md) and [`docs/reference/web/`](docs/reference/web/README.md). Design values → [`DESIGN.md`](DESIGN.md), where the CSS in `apps/web/src/styles/` wins. Hooks and CI gates: [`docs/contributing/ci-gates.md`](docs/contributing/ci-gates.md).

## Quick reference

| Task | Command |
| --- | --- |
| Toolchain | `nix develop` (installs lefthook) |
| Local infra (Postgres + S3 + migrate) | `just up` · `just docker-up` (containers only) |
| Wipe case data | `just wipe` · `just wipe yes` (keeps auth incl. organizations, and vault) |
| Screenshot seed | `just seed-demo` · `just seed-demo --force` |
| Install / migrate | `pnpm install` · `pnpm db:migrate` |
| Dev | `just dev` (infra + web :3000 + site :3001 + worker) · `pnpm dev:web` · `pnpm dev:site` · `pnpm dev:worker` · `pnpm exec wd` (after `pnpm build:cli`) |
| Lint / fix | `pnpm check` · `pnpm fix` |
| Affected packages | `pnpm changed` (list, with dependents) · `pnpm changed --run` (typecheck + unit tests for them only) |
| Typecheck / test | `pnpm typecheck` · `pnpm test` · `pnpm test:component` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm test:e2e:smoke` |
| Gates | `pnpm check:agents:strict` · `pnpm validate:agents` · `pnpm check:docs:strict` · `pnpm check:docs-affected:strict` · `pnpm check:effect-edges:strict` · `pnpm check:tagged-errors:strict` · `pnpm check:design-tokens` · `pnpm check:size` · `pnpm check:vendor` · `pnpm check:workspace` · `pnpm check:boundaries` · `pnpm check:workspace-reexports` · `pnpm check:migrations` |
| Web DS | `pnpm --filter @watchdog/web ds:check` |
| Vendored shadcn | `pnpm ui:add <name>` · `pnpm ui:sync` |
| Regenerate | `pnpm generate:caps` · `pnpm generate:client` |
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
| Chrome: Queue + Detail | Console / Workbench / Tape surfaces; a screen named `*Panel` | `ds:check` for the first three; `*Panel` is guidance ([ui lexicon](docs/reference/web/ui/README.md#chrome-lexicon-ui-parts)) |
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

- `pnpm test` runs unit, property and gate projects; the gate tests (`scripts/__tests__/*.gate.test.ts`) spawn real scripts in throwaway git repos. `pnpm typecheck` also typechecks tests, `scripts/` and `e2e/`, then runs the test-coverage guard: a new test file missing from its `tsconfig.test.json` fails.
- `docs-affect` runs at **commit-msg**, not pre-commit. When no mapped doc applies, put `docs:allow-affect — <reason>` in that commit's own message.
- The formatter ignores `GLOSSARY.md`, `.agents/`, `.cursor/` and `.claude/`: `ultracite` run on only those files exits 2 (the pre-commit hook excludes them). Lint `.mjs` and `e2e/` with `pnpm check`: `ultracite <path>` on them loses type context and reports false `no-unsafe-*` errors.
- A dependency declared by two or more packages (root included) takes its version from the default `catalog:` in `pnpm-workspace.yaml` (`"effect": "catalog:"`); a literal range there fails `pnpm check:workspace`. Peer ranges stay literal. Every `overrides` entry carries a reason and a revisit condition.
- `pnpm knip` loads the Drizzle config, so it needs `DATABASE_URL` set (any value). It ignores `.claude/worktrees/`.

## Canonical helpers

Verified by `check:agents:strict`: each module exists and exports the name. Add a row when a helper lands.

| Concern | Module | Export |
| --- | --- | --- |
| DB call into the domain error channel | `packages/core/src/infra/postgres-effect.ts` | `tryDb` |
| DB client as an Effect service (all of core; module `db` import is banned there) | `packages/core/src/infra/postgres-effect.ts` | `tryDbWith` |
| Cap HTTP user agent (never hard-code one) | `packages/tools/src/errors/user-agent.ts` | `watchdogUserAgent` |
| Web failure copy | `apps/web/src/lib/utils.ts` | `errMessage`, `serverFailureMessage`, `isServerFailure` |
| Class merging | `apps/web/src/lib/utils.ts` | `cn` |
| Slugs | `apps/web/src/lib/utils.ts` | `slugifyName`, `nextAutoSlug` |
| Opaque id text | `apps/web/src/shared/ui/format-opaque-id.ts` | `formatOpaqueId` |
| Opaque id chip | `apps/web/src/shared/ui/id-chip.tsx` | `IdChip` |
| Query invalidation after mutation or SSE | `apps/web/src/shared/lib/query-invalidation.ts` | `invalidateAfterEntityChanged`, `bindCasesChangedInvalidation` |
| Hotkey registry and mod-key label | `apps/web/src/shared/lib/hotkeys.ts` | `HOTKEYS`, `modKeyLabel` |
| Mod-key label in components | `apps/web/src/shared/hooks/use-mod-key-label.ts` | `useModKeyLabel` |
| Search minimum query length | `packages/schemas/src/search.ts` | `SEARCH_MIN_QUERY_LENGTH` |
| Accept gate | `apps/web/src/domains/triage/lib/accept-gate.ts` | `acceptGate` |
| Confirmed requires evidence (rule and message) | `packages/policy/src/confirmed-evidence.ts` | `confirmedNeedsEvidence`, `confirmedEvidenceViolation`, `CONFIRMED_REQUIRES_EVIDENCE` |
| Confirmed-blocked check over a web form's evidence ids | `apps/web/src/shared/lib/confirmed-evidence.ts` | `isConfirmedBlocked` |
| Active-Case switch | `apps/web/src/domains/cases/hooks/use-select-active-case.ts` | `useSelectActiveCase` |
| Case in caller's org (guard) | `packages/core/src/graph/patch/guards.ts` | `assertCaseInOrgEffect` |
| Case ids visible to an org | `packages/core/src/cases/cases.ts` | `listVisibleCaseIdsEffect` |
| Age a seeded Job in tests | `packages/test-db/src/db/seed/job.ts` | `backdateJob` |
| Gate-script test repo | `scripts/__tests__/helpers/gate-repo.ts` | `gateRepoFactory` |

## Where to look

[`docs/README.md`](docs/README.md) (platform) · [`docs/reference/web/README.md`](docs/reference/web/README.md) (UI, Query, domains) · [`caps-lexicon`](docs/reference/platform/caps-lexicon.md) (Caps, playbooks) · [`ROADMAP.md`](ROADMAP.md) · [`README.md`](README.md) (run the app).
