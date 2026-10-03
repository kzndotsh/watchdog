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
| Typecheck / test | `pnpm typecheck` · `pnpm test` · `pnpm test:component` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm test:e2e:smoke` |
| Gates | `pnpm check:agents:strict` · `pnpm validate:agents` · `pnpm check:docs:strict` · `pnpm check:docs-affected:strict` · `pnpm check:effect-edges:strict` · `pnpm check:design-tokens` · `pnpm check:size` · `pnpm check:vendor` |
| Web DS | `pnpm --filter @watchdog/web ds:check` |
| Vendored shadcn | `pnpm ui:add <name>` · `pnpm ui:sync` |
| Regenerate | `pnpm generate:caps` · `pnpm generate:client` |
| Desloppify (local, advisory) | `pnpm desloppify:bootstrap` · `:scan` · `:status` · `:next` |

Package manager: **pnpm** only. Solo signup: `BETTER_AUTH_ALLOW_SIGNUP=1` → `/auth/sign-up` → set `0` (first account is the instance admin; see [`auth-setup`](docs/how-to/auth-setup.md)). Vitest projects share workers: tests must restore any `process.env`, `globalThis`, timers, or DOM they change ([`standards.md`](docs/contributing/testing/standards.md)).

## Effect

Before writing Effect code, read `node_modules/effect/AGENTS.md` completely, then search `node_modules/effect/src` for APIs it skips. Watchdog runtime conventions (`run*` edges, `JobFibers`, Cap `run`, browser policy) live in the `/effect` skill. `repos/effect` is an optional gitignored clone: never import from it.

## Nested AGENTS.md

Read the nested `AGENTS.md` before editing its tree, as an explicit step: auto-attachment of nested files is not reliable. One exists in each of `apps/{cli,site,web,worker}` and `packages/{ai,api,auth,caps,client,core,db,env,log,policy,schemas,test-db,test-kit,tools,ui}`.

## Agent skills

Workflows live in [`.agents/skills/`](.agents/skills/) (and per package, e.g. [`packages/caps/.agents/skills/`](packages/caps/.agents/skills/)); `.claude/skills` symlinks to the root set. Load them by name: `/audit-contract`, `/check-gates`, `/finalize`, `/create-cap`, `/effect`. Vendored skills are pinned in `skills-lock.json` and read `docs/agents/` (issue tracker, triage labels, domain docs).

## Boundaries

Canonical detail: [`docs/reference/contracts/`](docs/reference/contracts/README.md). Package import boundaries are enforced by `package.json` dependencies and `no-restricted-imports` in `oxlint.config.ts`, not restated here.

| Do | Don’t | Enforced by |
| --- | --- | --- |
| Postgres = Case Graph SoT; Export is a projection | Hand-edit Export as a second SoT | guidance ([`ingress`](docs/reference/contracts/ingress.md)) |
| Collect → Evidence; Caps `interpret` → Proposal → Triage Accept | Caps/machines write Graph or set `confirmed` | `@watchdog/policy` gates at runtime; caps has no db dep ([`custody`](docs/reference/contracts/custody.md)) |
| Agents/CLI default to propose; a graph write needs `userOverride` and lands `unverified` + `graph_writes` | Silent machine Graph writes | policy gates + `apps/cli/src/custody.ts` ([`agent-ingress`](docs/reference/contracts/agent-ingress.md)) |
| Secrets via vault / `ctx.getCredential` | Cap secrets in env or `Job.input` | guidance |
| Chrome: Queue + Detail | Console / Workbench / Tape surfaces; a screen named `*Panel` | `ds:check` for the first three; `*Panel` is guidance ([ui lexicon](docs/reference/web/ui/README.md#chrome-lexicon-ui-parts)) |
| Process logs via `@watchdog/log` | Secrets/Evidence bodies in logs; treating evlog as Graph audit | guidance ([`evlog`](docs/reference/contracts/evlog.md)) |

Ingress: Collect → Evidence · Caps → artifacts + Proposal · Triage Accept → Graph · Dossier = human Graph edit. Accept tiers and breach caveats: [`custody`](docs/reference/contracts/custody.md).

## Where to look

[`docs/README.md`](docs/README.md) (platform) · [`docs/reference/web/README.md`](docs/reference/web/README.md) (UI, Query, domains) · [`caps-lexicon`](docs/reference/platform/caps-lexicon.md) (Caps, playbooks) · [`ROADMAP.md`](ROADMAP.md) · [`README.md`](README.md) (run the app).
