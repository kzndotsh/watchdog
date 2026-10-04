# Conventions

Every convention stated in an `AGENTS.md` file or a doc is enforced by a lint rule or gate, labeled `guidance`, or deleted. This table is the one index: rule, where it is stated, and what fails when it is broken. Agents follow what a tool enforces; `guidance` rows are judgment calls checked in review.

**Adding a rule:** add its row here in the same change as the rule (or the prose that states it). Name the enforcer in the `enforced by` cell: a lint rule id, a gate or script (`check:size`), a test file path, a type, or exactly `guidance`. `pnpm check:docs:strict` fails a row with an empty enforcer, a status outside the three below, an `enforced` or `baselined` row that says `guidance`, a named script that no `package.json` defines, or a named test file that does not exist.

**Status:** `enforced` fails the build when broken. `baselined` has an enforcer that tolerates known violations (a shrink-only baseline file or a warn-level rule). `guidance` has no enforcer. A `package.json` dependency list, CSS or a doc is not an enforcer: nothing fails when it changes, so such a rule is `guidance`. One row per rule; `stated in` names the single doc that owns it, and other docs link there. For a rule the code breaks today, the rule cell records the decision (fix and enforce, or delete); the status stays `guidance` until the enforcer exists.

## Ingress and custody

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| Postgres Case Graph is the SoT; Export is a projection, never hand-edited | repo | `docs/reference/contracts/ingress.md` Rules | guidance | guidance |
| Investigation content (corpus, entity notes, vault vocabulary) never enters this repo | repo | `AGENTS.md` intro | guidance | guidance |
| Caps `interpret` is pure and returns Proposal ops (`CapInterpretResult`): it receives the report only, no `ctx` | caps | `docs/reference/contracts/ingress.md` Rules | type: `CapabilityDef.interpret` in `packages/caps/src/sdk/define.ts` | enforced |
| Caps and machines never write the Graph (`packages/caps` declares no `@watchdog/db` today; nothing fails if one is added) | caps, core | `docs/reference/contracts/ingress.md` Rules | guidance | guidance |
| `PatchOp` claim/identifier/edge ops carry no `confidence`; the human picks it at Accept | schemas, policy | `docs/reference/contracts/custody.md` Accept tiers | `packages/schemas/src/__tests__/patch.test.ts` | enforced |
| `confirmed` needs human Accept or Dossier with evidence; agent and CLI writes land `unverified` | policy, cli | `docs/reference/contracts/custody.md` Accept tiers | `packages/policy/src/__tests__/patch-gates.test.ts`, `apps/cli/src/__tests__/custody.test.ts`, `e2e/specs/custody/accept-gates.spec.ts` | enforced |
| The rule message text ("confirmed requires at least one Evidence attachment") lives only in `@watchdog/policy`; core, api and web import `CONFIRMED_REQUIRES_EVIDENCE` and `confirmedNeedsEvidence` | repo | `docs/reference/contracts/custody.md` Accept tiers | `packages/policy/src/__tests__/confirmed-evidence-literal.test.ts` | enforced |
| Agents propose by default; a graph write needs `userOverride` and lands `unverified` with a `graph_writes` row in the same tx | api, core, cli | `docs/reference/contracts/agent-ingress.md` Escape hatch | `packages/core/src/proposals/__tests__/agent-ingress.int.test.ts`, `packages/api/src/procedures/__tests__/graph.int.test.ts` | enforced |
| The child-write custody rule (user override required, `confirmed` refused) has one definition, `childWriteViolation` in `@watchdog/policy`; API and CLI only map the violation to their transport | policy, api, cli | `docs/reference/contracts/agent-ingress.md` Escape hatch | `packages/policy/src/__tests__/custody-child-write.test.ts` (rule) · `packages/api/src/__tests__/custody-shared-message.test.ts` · `apps/cli/src/__tests__/custody-shared-message.test.ts` (transports use the shared message) · `packages/policy/src/__tests__/confirmed-evidence-literal.test.ts` (no second copy of the text) | enforced |
| Invalid Identifier values block Accept; collisions only warn | core, web | `docs/reference/contracts/custody.md` Identifier / patch gates | `packages/schemas/src/__tests__/validate-identifier.test.ts`, `apps/web/src/domains/triage/lib/__tests__/accept-gate.test.ts` | enforced |
| A foreign-org Case is `not_found`; a missing org is 403 | api, core | `docs/reference/contracts/README.md` Org isolation | `packages/api/src/__tests__/org-isolation.int.test.ts` | enforced |
| Every new case-scoped procedure is added to the org-isolation test (nothing enumerates the router) | api | `docs/reference/contracts/README.md` Org isolation | guidance | guidance |
| Cap secrets come from the vault via `ctx.getCredential`; never `process.env`, `Job.input`, Export or logs | caps | `docs/reference/platform/caps-boundary.md` Cap credentials | guidance | guidance |
| A breach hit proves a record exists in a dump, not control of the account; adversarially test identity links | repo | `docs/reference/contracts/custody.md` Breach caveat | guidance | guidance |
| Never claim without evidence; cite everything; disclose uncertainty | repo | `docs/explanation/product.md` Investigation | guidance | guidance |

## Packages and boundaries

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| A `@watchdog/*` import must be a declared dependency (pnpm strict `node_modules`: an undeclared import does not resolve) | packages, apps | `docs/reference/platform/packages.md` Enforcement | `pnpm typecheck` | enforced |
| Import direction follows the matrix in `packages.md` (nothing fails when a package declares a forbidden dependency) | packages, apps | `docs/reference/platform/packages.md` Forbidden imports | guidance | guidance |
| Web never imports `@watchdog/db` | web | `docs/reference/platform/packages.md` Forbidden imports | oxlint `eslint/no-restricted-imports` | enforced |
| A component with a Watchdog wrapper imports from `@/shared/ui/primitives/*`, not `@watchdog/ui/components/*` | web | `docs/reference/web/ui/vendor.md` Layers | oxlint `eslint/no-restricted-imports`, `apps/web/src/shared/ui/primitives/__tests__/wrapper-lint-coverage.test.ts` | enforced |
| The CLI never imports `@watchdog/core`, `db`, `api`, `env` or `log` (it talks HTTP through `@watchdog/client`; stdout is the agent contract) | cli | `apps/cli/AGENTS.md` | oxlint `eslint/no-restricted-imports` | enforced |
| `@watchdog/client` lists neither `@watchdog/api` (it aliases `AppRouter` type-only) nor `@watchdog/log` | client | `packages/client/AGENTS.md` Rules | guidance | guidance |
| No import cycles | repo | `docs/reference/platform/packages.md` Enforcement | oxlint `import/no-cycle` | enforced |
| core, api and caps declare no `drizzle-orm`; api and caps declare no `@watchdog/db` | core, api, caps | `docs/reference/platform/packages.md` Forbidden imports | guidance | guidance |
| `apps/site` declares no `@watchdog/*` runtime package; tokens are copied | site | `apps/site/AGENTS.md` | guidance | guidance |
| `test-kit` and `test-db` are never imported from production code | test-kit, test-db | `docs/reference/platform/packages.md` Forbidden imports | guidance | guidance |
| Browser code imports `@watchdog/policy/patch-needs-confidence`, `@watchdog/policy/confirmed-evidence` and `@watchdog/core/job-display`, never the package roots | web | `docs/reference/web/domains.md` Rules | guidance | guidance |
| Product vocab comes from `@watchdog/schemas`; domains never re-export it through `types.ts` or `*.functions.ts` | web, api | `docs/reference/platform/types.md` File map | guidance | guidance |
| `packages/ui/src/components` is never hand-edited; the pinned shadcn CLI version matches the lock | ui | `docs/reference/web/ui/vendor.md` Lock | `check:vendor` | enforced |
| Generated `capabilities.gen.json` and `packages/client/src/generated/` are never hand-edited | caps, client | `docs/reference/platform/caps-boundary.md` Caps | `packages/caps/src/__tests__/capabilities-gen.test.ts`, CI jobs "CapDescriptor drift" and "OpenAPI client contract drift" | enforced |
| The schema never changes without a generated migration; migrations are generated with an explicit `--name`, and a released migration is never edited or renamed | db | `packages/db/AGENTS.md` Schema conventions | `check:migrations` (drift only; naming and never-edit are review) | enforced |
| Tracked `src` files stay at most 600 lines (baselined files may only shrink) | repo | `docs/contributing/ci-gates.md` Gates | `check:size` | baselined |
| Effect `run*` only at allowlisted edges; `tryPromise` uses `{ try, catch }`; no production `throw new DomainError` | repo | `docs/contributing/ci-gates.md` Gates | `check:effect-edges:strict` | enforced |
| Effect language-service rules (unknown in catch, async function, try/catch in `Effect.gen`) | core, tools | `.agents/skills/effect/SKILL.md` | oxlint `effecttsgo/*` at warn level | baselined |
| Services are `*Effect` programs that keep `DomainTag` in `E`; tests bridge with `runDomain` | core | `packages/core/AGENTS.md` Rules | guidance | guidance |
| Enqueue only through `enqueueCapJobEffect` and the boss helpers; one pg-boss boss per process | core, worker | `docs/reference/platform/jobs-orpc.md` Jobs path | guidance | guidance |
| Tools vendor clients export `*Effect` only, never call raw `fetch`; `toolsHttpClientLayer` is provided once at the root | tools | `packages/tools/AGENTS.md` Rules | guidance | guidance |
| One Zod version workspace-wide | repo | `docs/reference/platform/types.md` Foundations | `zod` in the `pnpm-workspace.yaml` catalog and `overrides`; `check:workspace` | enforced |
| A dependency declared by two or more workspace packages takes its version from the pnpm catalog (`"name": "catalog:"`) | repo | `AGENTS.md` Gotchas | `check:workspace` (`scripts/check-catalog.mjs`) | enforced |
| Dependency versions agree across packages; `@types/*` and root tooling stay in devDependencies | repo | `AGENTS.md` Gotchas | `check:workspace` (sherif) | enforced |
| Schema is the SoT (`z.infer`, no twin interfaces); `z.enum(CONST)`, not copied literals; no `z.any()` | schemas, web, api | `docs/reference/platform/types.md` Foundations | guidance | guidance |
| Web, API and CLI share one input schema per create/update/delete shape; never fork it per surface | schemas | `packages/schemas/AGENTS.md` Gotchas | guidance | guidance |
| Wire objects are named in `schemas.ts` (no anonymous inline Zod); no DB rows or drizzle types on the wire | api | `packages/api/AGENTS.md` Rules | guidance | guidance |
| Package manager is pnpm only | repo | `AGENTS.md` Quick reference | guidance | guidance |

## Web

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| No `RoutePending` and no raw `Skeleton` in `domains/` or `routes/` | web | `docs/reference/web/ui/loading.md` Enforcement | oxlint `eslint/no-restricted-imports` | enforced |
| No raw palette hues, undeclared `--color-*`, or hex in SVG attributes | web | `DESIGN.md` Colors | oxlint `shadcn/no-raw-colors` | enforced |
| No `text-[Npx]` or other off-scale arbitrary values (layout values allowed) | web | `DESIGN.md` Typography | oxlint `shadcn/no-arbitrary-values` | enforced |
| Every Tailwind class must generate CSS | web | `docs/reference/web/ui/rules.md` Consistency | oxlint `shadcn/no-unknown-classes` | enforced |
| Callers don't restyle components in `domains/` and `routes/`; pick a size or variant | web | `docs/reference/web/ui/atoms.md` Variants, not overrides | oxlint `shadcn/no-restyle` | enforced |
| Opaque ids render via `IdChip` / `formatOpaqueId`, never `.slice(0, N)` | web | `docs/reference/web/ui/atoms.md` Gotchas | `ds:check` (`ds:ban` `opaque-id`, `domains/` only, narrow pattern) | enforced |
| Screens are named by layout kind; no `*Console`, `*Workbench` or `*Tape` exports | web | `docs/reference/web/ui/README.md` Chrome lexicon | `ds:check` (`ds:ban` `surface-name`) | enforced |
| Never a screen named `*Panel`; never a component named `Entity` | web | `docs/reference/web/ui/README.md` Chrome lexicon | guidance | guidance |
| No gradients, gradient text, glass or backdrop blur (`// ds:allow-decorative - reason` for functional blur) | web | `DESIGN.md` Do's and Don'ts | `ds:check` (`ds:ban` `decorative`) | enforced |
| Status is never color-only (one glyph shape per status via `STATUS_GLYPH`) | web | `DESIGN.md` Colors | `apps/web/src/shared/ui/__tests__/status.component.test.tsx` | enforced |
| Label and tone maps in `shared/ui/vocab/` are exhaustive `Record`s over schema unions; no fictional vocab (`probable`, `dormant`, `merged`) | web | `docs/reference/web/ui/atoms.md` Which atom | `pnpm typecheck` | enforced |
| Router keeps `scrollRestoration: false`, `defaultPendingMs` 400, `defaultPendingMinMs` 500, `defaultPreloadStaleTime` 0 | web | `docs/reference/web/ui/loading.md` Doctrine | `apps/web/src/__tests__/router.test.ts` | enforced |
| Radius ladder sm / md / lg (`--radius-xl..4xl` capped); writing fields tint the border on focus, no outer ring | web | `DESIGN.md` Shapes | guidance | guidance |
| `DESIGN.md` front-matter colors equal `wd-tokens.css` and `wd-dark.css` | web | `DESIGN.md` | `check:design-tokens` | enforced |
| `shared/ui` never fetches, mutates or routes | web | `docs/reference/web/ui/atoms.md` | guidance | guidance |
| TanStack Form only (`@tanstack/react-form`), no `react-hook-form` (it is absent from `apps/web/package.json` today) | web | `docs/reference/web/ui/forms.md` | guidance | guidance |
| Field errors render through `fieldInvalid` / `fieldErrorList`; one `useForm` per composer | web | `docs/reference/web/ui/forms.md` Conventions | guidance | guidance |
| One QueryClient per request via `createAppQueryClient()`; never copy server lists from `useLoaderData` into `useState` (`task-board.tsx` does; decision: fix and enforce with a lint rule, planned in spec #55 / #62) | web | `docs/reference/web/data.md` TanStack Query | guidance | guidance |
| Loaders await identity only; lists via `void prefetchQuery` in `warm*Queries` | web | `docs/reference/web/ui/loading.md` Rules | guidance | guidance |
| Mutations and SSE use the named contracts in `shared/lib/query-invalidation.ts`, not ad-hoc `invalidateQueries` lists; one mutation machine per noun (13 stray sites and a few forks exist; decision: fix and enforce with a lint rule, planned in spec #55 / #62) | web | `docs/reference/web/data.md` Invalidation contracts | guidance | guidance |
| One `useLiveEvents` connection per case; nested workspaces pass `live: false`; no manual Refresh on live paths | web | `docs/reference/web/data.md` Live events | guidance | guidance |
| Skeleton gating via `listPending()`, never on error; `DataTable` takes `pending`, never `PendingRegion` | web | `docs/reference/web/ui/loading.md` Rules | guidance | guidance |
| The rest of the loading doctrine (shape parity, hydration-safe skeletons, one pending surface, error granularity) | web | `docs/reference/web/ui/loading.md` Rules | guidance | guidance |
| `<Navigate>` is a sibling in the returned JSX, never an early return | web | `docs/reference/web/ui/loading.md` Gotchas | guidance | guidance |
| `animate-pulse` and `aria-busy` only inside `shared/ui` | web | `docs/reference/web/ui/loading.md` Enforcement | guidance | guidance |
| `Button` + `render={<Link/>}` sets `nativeButton={false}`; no `<button>` inside `<button>` | web | `docs/reference/web/ui/atoms.md` Gotchas | guidance | guidance |
| Every shortcut is listed in `HOTKEYS`; Mod+B belongs to the vendored `SidebarProvider`, never rebind it | web | `docs/reference/web/ui/atoms.md` Keyboard | guidance | guidance |
| `PageHeader` is the sole inset top chrome; no identity titles or `description=`; Case id never in Work URLs | web | `docs/reference/web/ui/page-shell.md` Page shell | guidance | guidance |
| Domain folder shape: `createServerFn` only in `*.functions.ts`; `*.server.ts` never reaches the client; DTOs in `types.ts` | web | `docs/reference/web/domains.md` Rules | guidance | guidance |
| Types and DTOs are imported from a domain's `types.ts`, never from its `*.functions.ts` (violations exist; decision: fix and enforce with a lint rule, planned in spec #55 / #62) | web | `docs/reference/web/architecture.md` Shape | guidance | guidance |
| Handlers call `orpcFromContext(context)`; no Drizzle in `apps/web`; `apps/web` no longer declares `drizzle-orm`, and nothing enforces keeping it out | web | `docs/reference/web/architecture.md` Server boundary | guidance | guidance |
| Auth is the global `requireAuth` in `start.ts`; no per-function `.middleware([requireAuth])`; public endpoints go in `routes/api/*` | web | `docs/reference/web/architecture.md` Server boundary | guidance | guidance |
| Hand-written files use the `@/*` alias, not relative hops (violations exist; decision: fix and enforce with a lint rule, planned in spec #55 / #62) | web | `docs/reference/web/architecture.md` Shape | guidance | guidance |
| `lib/` holds pure helpers and hooks live in `hooks/` (four hooks sit elsewhere today) | web | `docs/reference/web/domains.md` Shape | guidance | guidance |
| Taste: no nested cards, glow, icon-tile grids or bounce easing; flat surfaces; selection is an amber wash; motion budgets | web | `DESIGN.md` Do's and Don'ts | guidance | guidance |
| Copy: `Couldn't` / `Can't` / `Failed to`, never `Unable to` or `Oops`; Title Case labels; `Verb + Noun` primaries | web | `docs/explanation/ux.md` | guidance | guidance |
| One failure gets one feedback layer; irreversible actions use type-to-confirm; empty states use `EmptyState` intents | web | `docs/explanation/ux.md` | guidance | guidance |
| Build new atoms on `/ui` first; extract a named generic at the second call site | web | `docs/reference/web/ui/README.md` Delivery | guidance | guidance |

## DB

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| Repos: no `notifyEvent`, no throw, no transaction, no `SQL`-typed parameters, leading `exec: DbExec`, no `trimmedOrNull` | db | `packages/db/AGENTS.md` Repo contract | `pnpm --filter @watchdog/db check:repos` | enforced |
| Job status sets (open, cancellable, live, terminal) are defined in `@watchdog/schemas` vocab; repository modules define no job status sets | db, schemas | `packages/db/AGENTS.md` Repo contract | `pnpm --filter @watchdog/db check:repos` | enforced |
| Repos return rows, not DTOs (`check:repos` only flags `.toISOString()` calls) | db | `packages/db/AGENTS.md` Repo contract | guidance | guidance |
| Services own transactions and pass `exec` first to repos (the repo side is in the row above; nothing checks services) | core | `packages/core/AGENTS.md` Rules | guidance | guidance |
| Repo lookups trim scoped ids; an invalid UUID returns `[]` / `null` | db | `packages/db/AGENTS.md` Repo contract | `packages/db/src/repos/__tests__/scoped-ids.test.ts` | enforced |
| Soft delete is the repo's job: only `evidence`, excluded by default, `includeDeleted` is explicit | db | `packages/db/AGENTS.md` Repo contract | guidance | guidance |
| Enums via `text().$type<T>()`, never `pgEnum`; no `relations()` | db | `packages/db/AGENTS.md` Schema conventions | guidance | guidance |
| Repos use the builder API only: no `db.query`, no raw `sql` fragments (fragments exist in repos today; decision: fix and enforce by extending `check:repos`, Tier 2 in spec #55) | db | `packages/db/AGENTS.md` Schema conventions | guidance | guidance |
| Never set `updatedAt` by hand; migrations keep `drizzle/meta` in sync with `_journal.json` | db | `packages/db/AGENTS.md` Schema conventions | guidance | guidance |
| Case lookup defaults to `getById(exec, id, organizationId)`; `getByIdUnchecked` only for worker and export | db, core | `packages/db/AGENTS.md` Gotchas | guidance | guidance |
| Normalize display fields (trim, slugify, `InvalidError`) in services before repo writes | core | `packages/core/AGENTS.md` Rules | guidance | guidance |
| The local-only `watchdog_readonly` role has SELECT on `public` and `auth` and nothing else; credential tables (`auth.account`, `auth.apikey`, `auth.session`, `auth.verification`, `auth.invitation`, `public.credentials`) are revoked | db | `docs/how-to/local-dev.md` Read-only database role | `packages/db/src/__tests__/readonly-role.int.test.ts` | enforced |

## Caps

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| `run` returns an Effect (`CapRun`); `interpret` is pure and sync | caps | `packages/caps/AGENTS.md` Rules | type: `CapabilityDef` in `packages/caps/src/sdk/define.ts` | enforced |
| `run` returns artifact metadata only: no absolute paths, no inline bytes | caps | `docs/reference/platform/caps-boundary.md` Caps | guidance | guidance |
| Job-internal artifacts (`report.json`, `evidence-snapshot.json`, ...) never become Evidence rows | caps, core | `docs/reference/platform/caps-boundary.md` Caps | `packages/schemas/src/__tests__/job-artifacts.test.ts` | enforced |
| `timeoutMs` on the Cap is the only place to set timing; never hardcode derived timings | caps, worker | `docs/reference/platform/caps-boundary.md` Caps | guidance | guidance |
| Playbook ids are kebab-case with the first token equal to `seedKinds[0]` | caps | `docs/reference/platform/caps-lexicon.md` What is enforced | `packages/caps/src/playbooks/__tests__/naming.test.ts` | enforced |
| Cap ids are `<category>.<axis>.<method>`, lowercase snake_case, path mirrors id (`evidence.harvest` is the exception) | caps | `docs/reference/platform/caps-lexicon.md` Three layers | guidance | guidance |
| Method vocabulary, categories, D1-D5 pre-code decisions, one Cap per source contract | caps | `docs/reference/platform/caps-lexicon.md` Pre-code decisions | guidance | guidance |
| Banned mid-build terms: the `_Banned_` lines of `GLOSSARY.md`, in `AGENTS.md` files | repo | `GLOSSARY.md` header | `check:agents:strict` | enforced |
| Other refuse words (module, analyzer, neuron, enricher, transform, connector) in UI, docs and Cap titles, and the `_Avoid_` lines of `GLOSSARY.md` | repo | `docs/reference/platform/caps-lexicon.md` What is enforced | guidance | guidance |
| Tools own producer Zod; Caps re-export it from a Cap-local `report-schema.ts` | caps, tools | `packages/caps/AGENTS.md` Rules | guidance | guidance |
| Inside `playbooks/`, import Caps from `../registry`, not the `@watchdog/caps` barrel | caps | `packages/caps/AGENTS.md` Rules | guidance | guidance |
| Do not proxy investigation URLs through `markdown.new` (OPSEC) | caps | `docs/reference/platform/caps-boundary.md` Intake | guidance | guidance |
| Playbooks are user-initiated: a Playbook run never auto-fires | caps, core | `docs/reference/platform/caps-boundary.md` Caps (boundary) | guidance | guidance |

## Errors and logging

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| `InvalidError` maps to 400 and `InternalError` to a 500 with a fixed message, its cause going only to the request log (untagged defects are not covered by this test) | api, core | `docs/reference/contracts/README.md` Error taxonomy | `packages/api/src/__tests__/map-domain-error.test.ts` | enforced |
| CLI stdout is compact JSON; failures are `{ ok: false, error }` on stdout with exit 1 (error) or 3 (server failure) | cli | `apps/cli/AGENTS.md` Contract | `apps/cli/src/__tests__/output-contract.test.ts` | enforced |
| Never `log.set({ error })`; use `log.error(err)` or `{ name, message }`; auth denials are `warn` + `auth.denied` | log, worker, web | `docs/reference/contracts/evlog.md` Rules | guidance | guidance |
| Never log secrets, Evidence bodies or Bearer / `x-api-key` plaintext (the redaction preset covers part) | repo | `docs/reference/contracts/evlog.md` Rules | guidance | guidance |
| Process logs go through `@watchdog/log`; evlog is not Graph audit (`Job.logs`, `graph_writes` stay the custody SoT) | repo | `docs/reference/contracts/evlog.md` Rules | guidance | guidance |
| evlog `redact.builtins` stays false; the FS drain stays compact NDJSON | log | `packages/log/AGENTS.md` Gotchas | guidance | guidance |
| CSRF middleware runs after evlog; never wrap handlers with `withEvlog` | web | `docs/reference/platform/jobs-orpc.md` Process logging | guidance | guidance |
| Never hand-roll `/api/v1` paths; use `@watchdog/client` and regenerate it after API changes | cli, agents | `docs/reference/platform/jobs-orpc.md` oRPC | guidance | guidance |

## Testing and gates

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| Tests are typechecked: each package has `tsconfig.test.json` and every discovered test is included | repo | `docs/contributing/testing/standards.md` Tests are typechecked | `pnpm typecheck`, `check:test-coverage-guard`, `scripts/__tests__/typecheck-contract.gate.test.ts` | enforced |
| Every package and app `tsconfig.json` extends the root `tsconfig.base.json` (shared strictness, module, target and plugin options; the package keeps only jsx, lib, paths, rootDir, include and exclude), `tsconfig.test.json` extends its package config, and no package extends `apps/web`'s | repo | `docs/contributing/testing/standards.md` Tests are typechecked | `scripts/__tests__/tsconfig-base.gate.test.ts` | enforced |
| Never silence a test type error with a cast or `@ts-expect-error` | repo | `docs/contributing/testing/standards.md` Tests are typechecked | guidance | guidance |
| Every gate wired into a hook or CI has a `*.gate.test.ts` with a must-fail case | scripts | `docs/contributing/ci-gates.md` Gate tests | `scripts/__tests__/gate-coverage.gate.test.ts` | enforced |
| Every hook blocks or is deleted; none runs a gate in a mode that always exits 0 | repo | `docs/contributing/ci-gates.md` Hook policy | `scripts/__tests__/hook-policy.gate.test.ts` | enforced |
| Third-party actions are pinned to a 40-char SHA with a version comment | repo | `docs/contributing/ci-gates.md` Pinning | `check:action-pins` | enforced |
| CODEOWNERS paths resolve and every owned path has an owner | repo | `.github/CODEOWNERS` | `check:codeowners` | enforced |
| Code mapped in `scripts/doc-map.mjs` changes with its doc (or `docs:allow-affect - reason`) | repo | `docs/contributing/ci-gates.md` Doc-affect escape hatch | `check:docs-affected:strict` | enforced |
| Claude Code project settings keep commit and PR attribution off and register only the shared Stop hook | repo | `docs/contributing/ci-gates.md` Stop hook | `scripts/__tests__/hook-policy.gate.test.ts` | enforced |
| Local skipping goes through `lefthook-local.yml`; `--no-verify` is not an escape hatch | repo | `docs/contributing/ci-gates.md` Gates | guidance | guidance |
| Vitest projects share workers (`isolate:false`): tests restore `process.env`, `globalThis`, timers and DOM | repo | `docs/contributing/testing/standards.md` Test speed | guidance | guidance |
| Test naming and shape: `describe(subject)` + `it("rejects X when Y")`, AAA, one behavior, no bare `test()`, no `sleep` | repo | `docs/contributing/testing/standards.md` AAA, one behavior | guidance | guidance |
| Anti-cheat: no trivially-true assertions, parked `.skip`, or expected values re-derived from the source | repo | `docs/contributing/testing/standards.md` Anti-cheat | guidance | guidance |
| Mock HTTP via `@watchdog/test-kit/http`, never `msw`; Effect tests use `it.effect` | repo | `docs/contributing/testing/index.md` Runner facts | guidance | guidance |
| Every Collect Cap ships `__tests__/interpret.test.ts` | caps | `docs/contributing/testing/index.md` Runner facts | guidance | guidance |
| e2e specs import `test` and `expect` from `e2e/fixtures/test.ts` | e2e | `docs/contributing/testing/index.md` Runner facts | guidance | guidance |
| Integration seeds go through real repos (`seed*`); `resetE2eDb` is Playwright-only | test-db | `packages/test-db/AGENTS.md` Rules | guidance | guidance |

## Docs and agents

| Rule | Scope | Stated in | Enforced by | Status |
| --- | --- | --- | --- | --- |
| Docs links and anchors resolve; leaf files stay at most 600 lines | docs | `docs/contributing/ci-gates.md` Gates | `check:docs:strict` | enforced |
| Every convention row names an enforcer and a valid status (this table) | docs | `docs/reference/platform/conventions.md` | `check:docs:strict` | enforced |
| Dev MCP config (`.mcp.json`): Postgres connects as the read-only role, local MCP packages are pinned to exact versions, remote servers are https-only on a host allowlist without headers or credentials, no literal credentials | repo | `docs/how-to/local-dev.md` Agent MCP servers | `scripts/__tests__/mcp-config.gate.test.ts` | enforced |
| Every doc leaf is listed in `docs/README.md` (warning only) | docs | `docs/contributing/ci-gates.md` Gates | `check:docs` | baselined |
| `AGENTS.md` hygiene: present in every app and package, size budget, Scope + Commands sections, links, `CLAUDE.md` bridge | agents | `docs/contributing/ci-gates.md` Gates | `check:agents:strict` | enforced |
| Every row of an `AGENTS.md` `Canonical helpers` table still resolves: the module exists and exports the helper (an `export *` does not count) | agents | `AGENTS.md` Canonical helpers | `check:agents:strict` (`scripts/__tests__/check-agents.gate.test.ts`) | enforced |
| Agent skills have valid frontmatter; vendored skills match the lock hash | agents | `docs/contributing/ci-gates.md` Skills gate | `validate:agents` | enforced |
| Read the nested `AGENTS.md` before editing its tree | agents | `AGENTS.md` Nested AGENTS.md | guidance | guidance |
