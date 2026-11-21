# AGENTS.md — Watchdog

Watchdog platform monorepo: Postgres + TypeScript under `apps/` · `packages/`. Investigation content (corpus, entity notes, vault vocabulary) lives in a separate private repo and never enters this one.

Authority: product nouns → [`docs/glossary.md`](docs/glossary.md) (doctrine: [`docs/explanation/product.md`](docs/explanation/product.md)). Platform and UI contracts → [`docs/`](docs/README.md) and [`docs/reference/web/`](docs/reference/web/README.md). Design values → [`DESIGN.md`](DESIGN.md) (its tokens are generated from `apps/web/src/styles/`).

## Quick reference

| Task | Command |
| --- | --- |
| Toolchain | `nix develop` (installs lefthook) · pnpm only |
| Local infra (Postgres + S3 + migrate) | `just up` · `just docker-up` (containers only) |
| Local `.env` · first admin · vault key | `just env` · `just admin --email you@example.com` · `WD_MASTER_VAULT_KEY_OLD=... just vault-rekey` |
| Wipe case data · screenshot seed · perf seed | `just wipe yes` (keeps auth, organizations, vault) · `just seed-demo` · `just perf-seed` ([`perf-baseline`](docs/how-to/perf-baseline.md)) |
| Install · migrate · new migration | `pnpm install` · `pnpm db:migrate` · `pnpm db:generate --name=<what_changed>` |
| Dev | `just dev` (infra + web :3000 + site :3001 + worker) · `pnpm dev:web` · `pnpm dev:worker` · `pnpm exec wd` (after `pnpm build:cli`) |
| Done? | `pnpm verify` (changed files and affected packages; the stop hook runs it) · `pnpm verify --full` (the CI merge gate) |
| Lint · typecheck · tests | `pnpm check` · `pnpm fix` · `pnpm typecheck` · `pnpm test` · `pnpm test:component` · `pnpm test:integration` (`just test-db` first) · `pnpm test:e2e:smoke` |
| Regenerate (never hand-edit the output) | `pnpm generate:caps` · `pnpm generate:client` · `pnpm generate:env` · `pnpm generate:design` · `pnpm generate-routes` |
| Vendored shadcn (`apps/web/ui`, never edited) | `pnpm ui:add <name>` · `pnpm ui:sync` |
| Container images | `docker build --target web .` · `--target worker` · [`self-host`](docs/how-to/self-host.md) |

Solo signup: `BETTER_AUTH_ALLOW_SIGNUP=1` → `/auth/sign-up` → set `0` (the first account is the instance admin; [`auth-setup`](docs/how-to/auth-setup.md)).

## Custody invariants

These hold everywhere. The structure enforces most of them; never route around it.

- Postgres holds the Case Graph, the source of truth. The Case Export is a projection: never hand-edit it.
- Ingress: Collect → Evidence · Cap `interpret` → Proposal · Triage Accept → Graph · the Dossier is a human Graph edit. Caps and machine Jobs never write the Graph or set `confirmed` ([`custody`](docs/reference/contracts/custody.md)).
- Agents and the CLI propose by default. A direct Graph write needs `userOverride`, lands `unverified` and is recorded by its `agent_write` changeset ([`agent-ingress`](docs/reference/contracts/agent-ingress.md)).
- Organization isolation is row-level security keyed on the organization: a Case-scoped read runs in the caller's organization, and a foreign or missing Case is `not_found`, never a distinct signal.
- Secrets live in the vault and reach a Cap through `ctx.getCredential`: never in env, `Job.input`, the Export or a log.
- Process logs go through `@watchdog/server/log`, never with secrets or Evidence bodies. evlog is not Graph audit: `Job.logs`, `changesets` and `graph_history` are ([`evlog`](docs/reference/contracts/evlog.md)).
- Never claim without evidence; cite everything; disclose uncertainty. A breach hit proves a record exists in a dump, not control of the account.

## Judgement rules

No tool checks these; review does.

- Reuse before you write. The kit is tagged in the code: `git grep -n '@canonical'` lists every shared helper, hook, test double and record builder with when to use it. A second copy is the most common AI-authored defect. A new shared helper gets an `@canonical` tag on its export.
- A server-side failure is `InternalError` (500, fixed message); `InvalidError` is only for input the caller can fix ([error taxonomy](docs/reference/contracts/README.md#which-tag-to-raise)).
- Nobody uses Watchdog yet: replace a format outright. No compatibility shims, upgraders, data migrations or dual paths.
- The Zod schema is the source of a type (`z.infer`, no twin interfaces; `z.enum(CONST)`, not copied literals). Web, API and CLI share one input schema per create, update or delete shape; wire objects are named, and no database row or Drizzle type reaches the wire.
- Services own transactions, pass `exec` first to repos, and normalize display fields (trim, slugify, `InvalidError`) before a repo write.
- Never silence a test type error with a cast or `@ts-expect-error`; fix the types.
- Tests: `describe(subject)` + `it("rejects X when Y")`, arrange-act-assert, one behaviour, no sleeps, no trivially true assertions or expected values re-derived from the source ([`standards`](docs/contributing/testing/standards.md)). Vitest projects share workers: restore any `process.env`, `globalThis`, timers or DOM a test changes. Mock HTTP through `@watchdog/domain/test-kit/http`, never `msw` directly; Effect tests use `it.effect`.
- Gate freeze: until the custody, hardening and shippable specs (#288, #289, #290) are done, a new lint rule or gate lands only when the PR names a real regression it would have caught. Deletions are welcome. A lint message states its rule's reason; there is no prose copy of a rule elsewhere.
- Hooks: skip locally through `lefthook-local.yml`, never `--no-verify`. Claude Code project settings keep commit and PR attribution off.
- Outside contributors sign the CLA by comment on their first PR; the maintainer checks it before merging.

## Nested guides

Read the nested guide before editing its tree, as an explicit step: auto-attachment is not reliable. There are three:

- [`packages/server/AGENTS.md`](packages/server/AGENTS.md): every server-side package (`core`, `api`, `db`, `auth`, `policy`, `tools`, `log`, `env`, `schemas`, `ai`, `test-db`, `test-kit`) and `packages/server/worker`.
- [`packages/caps/AGENTS.md`](packages/caps/AGENTS.md): Caps, Playbooks and the Cap SDK.
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md): the web app (UI contracts: [`docs/reference/web/`](docs/reference/web/README.md)).

The rest of the tree has none:

- `apps/cli` (`wd`) reaches the API only through `@watchdog/client`. Its stdout is the agent contract: compact JSON, failures as `{ ok: false, error: { code, message } }`, exit 1 on error and 3 on a server failure ([`agent-cli`](docs/how-to/agent-cli.md)). It and `@watchdog/client` never depend on `@watchdog/server/log`.
- `packages/client`'s `src/generated/` is gitignored build output of `pnpm generate:client` (install, `typecheck` and `build:cli` run it). Never hand-roll an `/api/v1` path.
- `apps/site` is a static Astro page with no `@watchdog/*` runtime dependency; its tokens are copied from `apps/web/src/styles/`, and its copy comes from `README.md` and `docs/explanation/product.md`.
- `apps/web/ui` is the shadcn CLI's output, hashed by `pnpm check:vendor`. Change a token or wrap the primitive in `apps/web/src/shared/ui/primitives/`.

## Effect

Before writing Effect code, read `node_modules/effect/AGENTS.md` completely, then search `node_modules/effect/src` for APIs it skips. Watchdog runtime conventions (`run*` edges, `JobFibers`, Cap `run`, browser policy) live in the `/effect` skill. Boundary schemas are Zod, not Effect Schema ([ADR-0001](docs/adr/0001-zod-at-the-boundary.md)). `repos/effect` is an optional gitignored clone: never import from it.

## Skills

Repo workflows live in [`.agents/skills/`](.agents/skills/) (`.claude/skills` links to it) and [`packages/caps/.agents/skills/`](packages/caps/.agents/skills/): `/audit-contract`, `/check-gates`, `/finalize`, `/effect`, `/create-cap`. Vendored generic skills (`/to-spec`, `/to-tickets`, `/tdd`, ...) sit beside them, pinned in `skills-lock.json`; [`docs/agents/`](docs/agents/) holds the issue-tracker, triage-label and domain settings they read.

## Gotchas

- `pnpm test` runs the unit, web-unit, e2e-parser, property and gate projects in one vitest run. The gate tests (`scripts/__tests__/*.gate.test.ts`) run real scripts in throwaway git repos.
- `pnpm typecheck` checks each package on its `tsconfig.test.json` (source and tests), plus `scripts/` and `e2e/`: a new test file missing from its `tsconfig.test.json` fails. Production code importing test-only code or a `.ts` path is a lint error.
- Pre-commit only formats staged files. The formatter ignores `docs/glossary.md`, `.agents/`, `.cursor/` and `.claude/`.
- A dependency declared by two or more packages takes its version from the default `catalog:` in `pnpm-workspace.yaml`; peer ranges stay literal. Every `overrides` entry carries a reason and a revisit condition.
- Tracked `src` files stay at most 600 lines (`check:size`).
- `pnpm knip` loads the Drizzle config, so it needs `DATABASE_URL` set (any value).
- Postgres `53300` (too many clients) in dev is usually HMR leaking pools: restart vite and the worker.

## Where to look

[`docs/README.md`](docs/README.md) (platform) · [`docs/reference/web/README.md`](docs/reference/web/README.md) (UI, Query, domains) · [`caps-lexicon`](docs/reference/platform/caps-lexicon.md) (Caps, Playbooks) · [`ci-gates`](docs/contributing/ci-gates.md) (what each gate checks) · [`docs/roadmap.md`](docs/roadmap.md) · [`README.md`](README.md) (run the app).
