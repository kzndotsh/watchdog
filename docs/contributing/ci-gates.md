# CI and local gates

**What this is:** what each gate checks, where it runs, hook policy, the gate-test contract, pinning and CI permissions.  
**What this is not:** a command list (root [`AGENTS.md`](../../AGENTS.md) quick reference, `package.json`, `lefthook.yml`) or test methodology ([`testing/standards.md`](testing/standards.md)).

Hooks are installed by `lefthook install` (automatic in `nix develop` and by `pnpm install`, whose `prepare` script runs it); `lefthook-local.yml` overrides per clone. `lefthook.yml` is the SoT for which command runs at pre-commit, commit-msg and pre-push; `.github/workflows/ci.yml` for CI. The warn-only mode of `pnpm check:docs` exists for manual use and is never wired to a hook or CI.

## Gates

| Gate | What it checks | Stage | Escape hatch |
| --- | --- | --- | --- |
| `pnpm check` (`ultracite fix` on staged files at pre-commit, scripts and `e2e/` included) | Oxlint + Oxfmt, including the local `watchdog` plugin (`scripts/oxlint-plugin/`; add-a-rule recipe in [conventions](../reference/platform/conventions.md#adding-a-lint-rule)). `@shadcn/lint` (pinned, web only) fails raw palette colors, undeclared tokens, off-scale arbitrary values and Tailwind classes that generate no CSS. Warn-severity Effect rules do not fail it | pre-commit, CI | none |
| `pnpm typecheck` | Source **and** tests in one program per package (`tsconfig.test.json`, a superset of `tsconfig.json`), packages run unordered and in parallel (`pnpm -r --no-sort --workspace-concurrency=8`) with an incremental cache in `node_modules/.cache/` (nothing committed; CI starts cold). Root adds `scripts/tsconfig.test.json`, `e2e/tsconfig.test.json` and `check:test-coverage-guard` (every vitest-discovered test and Playwright spec is in some `tsconfig.test.json`), all in parallel with the packages. That program allows `.ts` imports and test code in `src`, so production source importing test-only code or a `.ts` path is a lint error instead ([`watchdog/no-test-imports-in-production`, `watchdog/no-ts-extension-import`](../reference/platform/conventions.md#packages-and-boundaries)). Measured on 16 threads under `nice -n 10`, median of 5: about 27.5 s before (dependency-ordered, two programs per package), 11.9 s cold and 5.0 s warm now. See [`testing/standards.md`](testing/standards.md#tests-are-typechecked) | pre-push (only when the push changes code, see below), CI | none |
| `pnpm check:agents:strict` | AGENTS.md hygiene: present in every `apps/*` / `packages/*`, size budget, Scope + Commands sections, relative links, banned mid-build terms (only in `AGENTS.md` files; the list is the `_Banned_:` lines of `docs/glossary.md` outside code fences, matched literally; the gate requires it), CLAUDE.md `@AGENTS.md` bridge, and the optional `## Canonical helpers` table (columns concern, module path in backticks, export in backticks): each module must exist and export the name by declaration, `export { X }` or `export { X } from` (`export *` does not count); no section, no check | pre-commit, CI, Cursor stop | none |
| `pnpm check:docs:strict` | Docs links and anchors resolve (docs/, root markdown, AGENTS.md files), leaf length budget (fail above 600 lines), and the conventions table ([`conventions.md`](../reference/platform/conventions.md)): every table has the exact header `Rule | Scope | Stated in | Enforced by | Status`(a mistyped table fails instead of being skipped), every row has five cells (escaped pipes are unsupported) and a non-empty`enforced by`cell and a status of`enforced`, `baselined`or`guidance`, an `enforced`/`baselined`row never says`guidance`, and every named `check:_`/`validate:_`/`test:_`script and test file exists. Index coverage in`docs/README.md` is a warning only | pre-commit, CI, Cursor stop | none |
| `pnpm check:docs-affected:strict` | Changed code that matches a rule in `scripts/doc-map.mjs` must touch that rule's docs (non-whitespace change) | commit-msg, CI | `docs:allow-affect — <reason>` (see below) |
| `pnpm check:tagged-errors:strict` | Every tagged error class (`Data.TaggedError`, `Schema.TaggedError`) in `packages/*/src` and `apps/*/src` ends in `Error`, declares a literal `code` field, and no two classes share a `code`. Tests are skipped | pre-commit, CI | none |
| `pnpm check:workspace-reexports` | No `apps/*` or `packages/*` source file re-exports another `@watchdog/*` package: `export ... from "@watchdog/x"`, `export *`, or `import { X } from "@watchdog/x"; export { X }` (also `export type`). Callers import from the owning package. Comments and string contents are ignored. Exempt: tests, and `@watchdog/ui/components/*` specifiers (only those) under `apps/web/src/shared/ui/primitives/` and in exactly `apps/web/src/shared/ui/toast.tsx`. Sanctioned seam: `packages/test-db/src/index.ts` `export const testDb = db` (api and caps tests reach the db handle through test-db so they never depend on `@watchdog/db`) | pre-commit, CI | none |
| `pnpm check:size` | Tracked `src` files at most 600 lines; files in `scripts/size-budget-baseline.json` may shrink, never grow (`--update` re-baselines downward) | pre-commit, CI | none |
| `pnpm check:bundle` | Per-route gzipped JavaScript of the production web build against `scripts/bundle-budget-baseline.json`: entry, signed-in shell and each route's own chunks may not grow more than 5% ([Bundle budget](#bundle-budget)). Needs a build first (`pnpm build`) | CI (Web build job) | none: raise the number by hand with a reason |
| `pnpm check:vendor` | `packages/ui` generated primitives match `vendor.json` (never hand-edit), and the shadcn CLI version recorded there equals the one `scripts/ui-vendor.mjs` pins | pre-commit, CI | none |
| `pnpm check:design-tokens` | The `DESIGN.md` front-matter values that have a CSS source equal it (CSS wins): every `colors` token against `wd-tokens.css` / `wd-dark.css`, `rounded.sm` / `md` / `lg` (`calc()` of `--radius`, compared in rem) and `components.filter-menu.width` against `wd-theme.css`, each `typography` `fontFamily` against `--font-sans` / `--font-mono`, and the `text-2xs` size and line height. Tailwind-scale sizes, weights, `rounded.full` and the component pairs have no CSS source and are not value-checked. Test: `scripts/__tests__/check-design-tokens.gate.test.ts` (drift fails per group) | pre-commit (when `DESIGN.md`, `wd-*.css` or the scripts change), CI (Gates job) | none |
| `pnpm lint:design` | The official DESIGN.md linter (`@google/design.md`, pinned, the `designmd` bin; format version `alpha`) over `DESIGN.md`: front-matter schema, token references, section order and the WCAG AA `contrast-ratio` of every component `backgroundColor` / `textColor` pair. `scripts/lint-design.mjs` wraps it because the CLI exits 1 on errors only: it reads the JSON summary and fails when errors plus warnings is above zero (infos pass). Dev dependency, so the [license gate](#license-gate) (production only) does not see it. Test: `scripts/__tests__/lint-design.gate.test.ts` | pre-commit (with `check:design-tokens`), CI (Gates job) | none |
| `pnpm check:action-pins` | Every third-party action in `.github/workflows/*.{yml,yaml}` is pinned to a 40-char SHA with a version comment ([Pinning](#pinning-and-ci-permissions)) | pre-commit, CI | none |
| `pnpm check:workspace` | Workspace consistency: `sherif --fail-on-warnings` (one version per dependency across packages, `@types/*` in devDependencies, a private root with devDependencies only, sorted dependency lists, similar dependencies on one version) then `scripts/check-catalog.mjs` (a dependency declared by two or more packages, root included, must be `"name": "catalog:"`, and every `catalog:` reference must exist in `pnpm-workspace.yaml`; peer ranges and `workspace:` links are exempt). Runs on `package.json`, `pnpm-workspace.yaml` or gate-script changes | pre-commit, CI | none |
| `pnpm check:migrations` | Runs `drizzle-kit generate` against the checkout and fails if it would write a migration or change a snapshot or the journal (a table changed without its migration); the output is rolled back. Fix: `pnpm db:generate --name=<what_changed>`. Runs on `packages/db` schema, migration or gate-script changes, and on `packages/schemas` changes (db schema files import from it) | pre-commit, CI | none |
| `pnpm check:boundaries` | Package boundaries, from `scripts/check-boundaries.mjs`: every `@watchdog/*` import in `apps/*` and `packages/*` source must name an existing workspace package the importer declares in its `package.json`, through a path its `exports` map lists (an internal path or a relative reach into another package fails and the message lists the public entry points), and apps are never imported by packages or other apps. The one exempt file is the generated `packages/client/src/generated/app-router.ts` type alias. Audit of what the other tools cover: knip reports unlisted dependencies only in CI and never reads `exports`; oxlint `no-restricted-imports` bans fixed names in fixed trees (web, cli, ui wrappers); `import/no-cycle` catches cycles; pnpm strict `node_modules` fails an undeclared import only when it is resolved. Runs on source, `package.json` or gate-script changes | pre-commit, CI | none |
| `pnpm check:licenses` | Every production dependency's license (`pnpm licenses list --prod`) is on the allowlist or has a reviewed entry in `scripts/license-exceptions.json` ([License gate](#license-gate)) | CI (Gates job) | none: add a reviewed exception |
| `pnpm check:notices` | `THIRD_PARTY_NOTICES.md` equals what `pnpm generate:notices` writes from the production dependencies | CI (Gates job) | none: run `pnpm generate:notices` |
| `pnpm check:env` | `env.example` and `docs/reference/platform/configuration.md` equal what `pnpm generate:env` writes from the env metadata (each field's `.meta()` in `packages/env/src/fragments.ts`, plus `reference.ts` for variables outside the schema), and `env.production.example` (hand-maintained: it is the compose file's environment) lists every variable the app validates and none the metadata does not know. A field without a description, `sensitive` flag and entrypoints makes the generator throw. One script, `scripts/generate-env-docs.mjs`, with a `--check` mode | pre-commit (when `packages/env/src`, the generated files or the script change), CI (Gates job) | none: run `pnpm generate:env` |
| `pnpm check:codeowners` | Every `.github/CODEOWNERS` pattern matches a tracked file, every rule has an owner, and owners are `@user`, `@org/team` or an email. Runs in CI on every change because renaming or deleting a file can orphan a pattern | pre-commit (when CODEOWNERS or the gate changes), CI | none |
| `pnpm validate:agents` | Agent Skills ([Skills gate](#skills-gate)) | pre-commit (`--staged`), CI (`--range`), Cursor stop | none; staleness is a warning |
| `pnpm test:gate` | The gate tests below | part of `pnpm test`; pre-push only when `scripts/**`, `packages/db/scripts/**`, `lefthook.yml`, `.github/workflows/**`, `skills-lock.json` or `vitest.config.ts` changes (the pre-push hook runs no other test project: [what runs where](testing/index.md#what-runs-where)) | none |
| `pnpm generate:caps`, `generate:client`, `generate-routes` | Regenerate `packages/caps/capabilities.gen.json`, `packages/client/src/generated/`, the web route tree; CI fails if committed output drifts | CI | none |
| OpenAPI breaking changes (CI Gates step, no pnpm script) | [oasdiff](https://github.com/oasdiff/oasdiff) compares the committed `packages/client/src/generated/openapi.json` with the pull request base's (the previous commit on a push to `main`) and fails on error-level breaking changes ([details](#openapi-breaking-changes)) | CI | a `BREAKING CHANGE:` commit footer |

`pnpm changed` is not a gate: it lists the workspace packages a diff affects, dependents included (merge-base with main plus the working tree; `--base <ref>`, `--json`), and `--run` typechecks and unit-tests only those. A root config change (`tsconfig*.json`, `pnpm-workspace.yaml`, root `package.json`, lockfile, vitest or oxlint config) selects every package; a change outside any package selects none. It never replaces `pnpm typecheck` / `pnpm test`, which stay the full gates.

**Scoped hooks.** Pre-commit lints only the staged files: `*.mjs` scripts and `e2e/` are linted by path like any other file, because `scripts/tsconfig.json` and `e2e/tsconfig.json` give the type-aware rules their program (without one, `no-unsafe-*` fired on node types, which is why a staged script used to run the whole-repo `pnpm check`, about 17 s, instead of about 2 to 3 s). Those two tsconfigs are lint programs only: they never emit and `pnpm typecheck` does not run them. Pre-push runs `pnpm typecheck` only when a pushed file is code: `*.ts`, `*.tsx`, `*.mts`, `*.cts`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`, any `*.json` (tsconfigs, `package.json`, JSON imports), `*.astro`, `pnpm-lock.yaml` or `pnpm-workspace.yaml`. A push of docs, skills or workflow YAML alone skips it (lefthook prints `no matching push files`); the other pre-push commands keep their own globs. CI runs everything regardless, and `pnpm check` over the whole repo stays authoritative there.

Local skipping goes through `lefthook-local.yml`; `--no-verify` is not an escape hatch.

## Hook policy: block or delete

Every hook either blocks (exits non-zero, or for the Cursor `stop` hook reports a `followup_message`) or is deleted. No hook runs a gate in a mode that always exits 0. Warnings that stay (skills staleness, line budgets) are advisory output of a gate that still fails on real errors. Enforced by `scripts/__tests__/hook-policy.gate.test.ts`. The Cursor `afterFileEdit` hook was deleted because Cursor never read its output.

## Skills gate

`scripts/validate-agents.mjs` reads [`skills-lock.json`](../../skills-lock.json). A skill whose folder name is a key there is **vendored** (installed by the `skills` CLI from a third-party repo, committed under `.agents/skills/`); every other skill is **owned**.

|  | Vendored | Owned |
| --- | --- | --- |
| `SKILL.md` present, frontmatter parses, `name` (matches folder) and `description` present | yes | yes |
| Folder content hash equals the lock's `computedHash` | yes: a hand edit fails, naming the folder and the reinstall command (`npx skills add <source> --skill <name>`) | no |
| `metadata.owner` / `metadata.sources`, trigger clause in `description`, `references/` hints | no | yes |
| Staleness: warns when a `metadata.sources` path changed in the diff and the skill's own files did not. An unresolvable range or SHA fails the gate | no | yes (warn) |
| `SKILL.md` line budget | no | warn above 400, fail above 500 |

Hash scheme (same as the `skills` CLI): sha256 over every file in the skill folder (excluding `.git`, `node_modules`), sorted by forward-slash relative path with `localeCompare`, feeding each file's relative path then its bytes. Never edit a vendored skill; update it with the CLI so the lock is rewritten with it.

## Doc-affect escape hatch

`docs:allow-affect — <reason>` (reason required) must be in the commit's own message; it excuses only that commit. The gate runs at commit-msg on the staged diff only. In CI it diffs the pull-request range or the pushed `before..after` range (an all-zero `before` falls back to the merge base with `main`; an unresolvable range fails), and the PR body or any commit message in the pull-request or pushed range may carry the marker. Use it only when no mapped doc applies. Rules live in `scripts/doc-map.mjs`: three rules (`caps`, `e2e` including the Vitest config and setup files, `cli`), all enforced. The map once held five more advisory rules (design, auth, domains hooks, api and client, e2e journeys) that no hook or CI read; they were deleted with the warn mode that ran them. Do not add a rule nothing enforces.

## Gate tests

Vitest project `gate` (`pnpm test:gate`, also in `pnpm test`): `scripts/__tests__/*.gate.test.ts`, named `<script basename>.gate.test.ts` (lint-rule tests, `oxlint-<rule>.gate.test.ts`, run oxlint over a fixture instead: see [conventions](../reference/platform/conventions.md#adding-a-lint-rule)). Each script test builds a temporary git repo, copies the gate script in (`scripts/__tests__/helpers/gate-repo.ts`), runs `node <script>` as lefthook or CI would, and asserts on exit code and key output phrases. Script tests never import a gate script's internals; the one exception is a script's pure decision helpers, which are separate modules built for it (`scripts/oxlint-plugin/lib/baseline-update.mjs`) and tested directly, while the spawned script test keeps the CLI wiring. Every gate needs a must-fail and a must-pass fixture; changing a gate script means changing its test.

The fixture strips `CI`, `GITHUB_*`, `DOCS_AFFECT_*` and `GIT_*` from the environment a gate sees, so a suite running under GitHub Actions cannot flip a gate into CI mode; a test that wants CI mode passes those variables through the `env` option.

**Meta-test.** `scripts/__tests__/gate-coverage.gate.test.ts` reads `lefthook.yml` (pre-commit, commit-msg, pre-push) and the CI `gates` job, resolves every `pnpm` command through `package.json`, and collects the gate scripts under `scripts/` and `packages/db/scripts/`. Each needs a `*.gate.test.ts` with at least one test named like `fails` / `must fail` / `rejects`. Third-party tools (ultracite, tsc, astro, vitest, knip, tsx) are allow-listed by name there; any other command wired into a hook or the `gates` job fails the meta-test, so a new gate cannot land untested.

**Shared git helpers.** `scripts/lib/git-range.mjs` is the one place gates talk to git for diffs: `git` throws with git's stderr instead of returning an empty result, `resolvePushRange` handles `before..after` (all-zero `before` falls back to the merge base with `origin/main`, then `main`; anything unresolvable throws), and `hasSubstantiveChange` returns true only on `git diff --quiet -w --ignore-blank-lines` exit 1 and throws on any other failure. A broken diff therefore fails `check-docs-affected` and `validate-agents` rather than counting as a doc touch or "no changes". The Cursor stop hook uses the same helper but keeps its fail-open contract (a hook never blocks the agent because it broke): its top-level catch answers `{}` and says so on stderr, while real gate failures still surface as `followup_message`.

## Pinning and CI permissions

- **Actions:** `uses: owner/repo@<40-char sha> # vX.Y.Z`. Tags move; SHAs do not. Resolve with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (an annotated tag, `object.type` of `tag`, needs one more hop to the commit). Local `./` and `docker://` references are exempt. Container base images are pinned by `@sha256:` digest too (the Dockerfile's `FROM`, the images in `docker-compose.prod.yml`, the CI service containers); `ci-workflow.gate.test.ts` fails on one without a digest. Dependabot's `github-actions` entry bumps the SHA and comment together. `check:action-pins` fails on tags, branches, short SHAs or a missing version comment.
- **shadcn CLI:** `scripts/ui-vendor.mjs` runs `shadcn@<exact version>` (never `latest`) and records it as `shadcn` in `packages/ui/vendor.json`; `check:vendor` fails if the two differ. To bump: edit the constant, run `pnpm ui:sync`, review the `packages/ui` diff.
- **desloppify:** installed as `desloppify[full]==<version>` in the Advisory job (also named in `scripts/desloppify-bootstrap.sh`'s install hint). Bump both together.
- **Permissions:** the workflow default is `contents: read` (Web build and Container image use it as is). A job that needs more declares it itself (Unit, property and component tests: `id-token: write` for Codecov OIDC and `pull-requests: write`; File detection: `pull-requests: read`; Advisory: `pull-requests: write`, `issues: write`). Add a job-level grant, never a workflow-level one.

## GitHub CI (summary)

Workflow: `.github/workflows/ci.yml`. PRs skip heavy jobs when path filters show docs-only; push to `main` runs full CI. After File detection, seven run in parallel: **Container image** ([below](#container-image)), **Web build** (`pnpm build`, then `pnpm check:bundle`: a production-only build break and the [bundle budget](#bundle-budget)), **Gates** (the table above, plus knip, the site build when `apps/site/**` changes, cap/client drift and db repos), **Unit, property and component tests** (job id `unit-component`; `pnpm test:coverage` runs the unit, web-unit, property, component, component-compiled and e2e-parser projects; Codecov upload under the `unit` flag, non-blocking), **Gate tests** (`pnpm test:gate`, the gate project, uncovered), **Integration** (`pnpm test:integration` with coverage, uploaded under the `integration` flag; Codecov merges both flags and carries a skipped job's last result forward) and **Playwright e2e** (`pnpm test:e2e`, run inside Microsoft's Playwright image pinned by digest with host networking, so the job has no apt step; a step fails it when the image tag and `@playwright/test` drift apart). Integration and Playwright each run on their own runner with their own Postgres service (`watchdog`, `watchdog_test`, `watchdog_e2e`) and S3 container, so neither waits for the other. Advisory (React Doctor / Desloppify via `pnpm desloppify:scan:ci`) runs separately and does not block. The aggregator job **Check** is the required status: it needs Gates, Unit, property and component tests, Gate tests, Integration, Playwright e2e, Web build and Container image and fails on any result other than `success` or `skipped`, so a job its path filter skipped never fails it (a new job must be added to its `needs` and its result list). Dependabot ([`.github/dependabot.yml`](../../.github/dependabot.yml)) updates npm/pnpm, GitHub Actions, docker-compose, the Dockerfile base image and Nix weekly on Mondays, grouped minor/patch.

### Trust rules (CI)

- **`Check` fails when File detection did not succeed.** A failed or cancelled `changes` job leaves every other job skipped, which would read as a pass. `Check` runs on every event except a draft pull request (whose `changes` job is skipped on purpose) and exits non-zero unless `changes` is `success`. Other jobs keep the skipped-by-path-filter semantics.
- **Path filters:** a change under `scripts/**` starts Gates, Unit, property and component tests and Gate tests (the `config` output), and an edit to any `package.json` (root, `apps/*`, `packages/*`; the `config_core` output) starts every job, Integration included.
- **Concurrency:** only a pull request cancels its own earlier run. A push to `main` runs in its own group (the commit SHA) and is never cancelled, so every commit on `main` gets a verdict.
- **Node:** CI (`actions/setup-node`, `node-version: 22`) and the nix shell (`pkgs.nodejs_22`) use the same major; `engines.node` is `>=22.19.0` (the floor of undici 8). Change all of them together.
- **Coverage comment:** the Codecov patch and project statuses are already `informational: true` (`codecov.yml`). Only the Unit, property and component tests job uploads coverage (unit, web-unit, property, component and component-compiled projects), so lines tested only by Integration show as missing in the comment. Not changed yet (issue #270 item left open).

### Nightly shuffle (advisory)

`.github/workflows/nightly-shuffle.yml` probes for order dependence, which the fixed file order of a pull request run cannot show while projects share workers (`isolate: false`). On a schedule (03:30 UTC) or by hand (`workflow_dispatch`, optional `seeds` input) it runs every Vitest project except integration (`unit`, `web-unit`, `property`, `component`, `component-compiled`, `gate`, `e2e-parser`), one matrix job each, with `--sequence.shuffle.files` under three seeds (the run id, `11`, `4242`), then once with `--sequence.shuffle.tests --repeats=2`. Every pass runs even after one fails. A failing pass prints an `::error` annotation and a step-summary line naming the seed and the command that reproduces it locally (`pnpm exec vitest run --project <name> --sequence.shuffle.files --sequence.seed=<n>`).

It never gates a pull request: it has no `push` or `pull_request` trigger, `Check` does not wait for it, it holds `contents: read` only and opens no issue, and it has a 25-minute `timeout-minutes` tripwire. A red nightly run is read by a person: what to do with a failure is the [flake policy](testing/flaky-tests.md). `scripts/__tests__/nightly-shuffle-workflow.gate.test.ts` fails if the workflow gains a gating trigger, a write permission or loses a project, a seed or its timeout.

### Main branch ruleset

The ruleset on `main` is active:

- Require a pull request before merging.
- Require the status check **`Check`** (the aggregate job; the only required check, since it waits for every other job and tolerates path-filtered skips).
- Block force pushes and deletion.
- Repository admins can bypass it; every bypass is logged in the repository's audit log.

### License gate

Watchdog is AGPL-3.0-only ([`LICENSE`](../../LICENSE)) and every `package.json` says so. `scripts/check-licenses.mjs` (`pnpm check:licenses`) reads `pnpm licenses list --json --prod` and fails a production dependency whose SPDX license is not allowed. SPDX expressions are parsed (`AND` binds tighter than `OR`, parentheses group, `X WITH Y` is judged on `X`): `A OR B` passes when either side does, `A AND B` needs both, and an expression that does not parse fails. An exception that no installed package uses prints a warning.

- **Allowlist:** MIT, MIT-0, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, BlueOak-1.0.0, Zlib; weak copyleft MPL-2.0 and `LGPL-*`; AGPL-compatible AGPL-3.0 and GPL-3.0 (only and or-later).
- **Reviewed exceptions:** `scripts/license-exceptions.json`, keyed by package name with the license pnpm `reported`, the license the review `license` found, and the `reason`. An exception holds only while pnpm reports the same value, so a changed license fails again. Current entries: `@better-auth-ui/core` and `@better-auth-ui/react` (reported Unknown: no license field or file in the package, but the README and the upstream repository say MIT), the two `@fontsource-variable/geist*` fonts (OFL-1.1), `argparse` (Python-2.0) and `caniuse-lite` (CC-BY-4.0, data).
- **Vendored code** keeps its own license: the shadcn components in `packages/ui` (MIT, see `vendor.json`) and the vendored skills in `.agents/skills/` (pinned in `skills-lock.json`) are not relicensed.
- **Notices:** `pnpm generate:notices` writes `THIRD_PARTY_NOTICES.md` (a reviewed package is filed under the license the review found); `pnpm check:notices` fails when it is stale (after a dependency change). Prebuilt per-platform native binaries are left out of the file so it is identical on every machine; the gate still checks whatever is installed.

Both scripts take `--input <file>` (the same JSON) for fixture tests. The one-script exception to the gate freeze is the shippable spec ([#290](https://github.com/kzndotsh/watchdog/issues/290)), which requires it. A second exception is `pnpm lint:design` ([DESIGN.md linter](#designmd-linter)).

### CLA collection

The CLA ([`CLA.md`](../../CLA.md)) is collected by hand: an outside contributor comments the agreement on their pull request ([`CONTRIBUTING.md`](../../CONTRIBUTING.md)) and the maintainer checks for it before merging. Employers sign [`CLA-corporate.md`](../../CLA-corporate.md) with the owner. No workflow, bot or hosted app is involved, and nothing is checked in CI. An automated workflow is planned for when outside contributions start.

### DESIGN.md linter

`DESIGN.md` follows the [DESIGN.md format](https://github.com/google-labs-code/design.md) (Google Labs, version `alpha`), and `pnpm lint:design` enforces it with the official linter. The owner asked for this directly, so it is an explicit exception to the gate freeze below (no real-regression citation). The CSS in `apps/web/src/styles/` stays the source of truth for values: `check:design-tokens` compares the front-matter groups that have a CSS source against it, and the linter owns structure and contrast. A component colour pair that fails AA is left out of the front matter (and recorded in `DESIGN.md` Colors) rather than silencing the rule; fix the CSS, then add the pair. Both gates run in the CI Gates job, and a `DESIGN.md`-only pull request starts that job (the `design` path filter).

### Gate freeze

Until the custody, hardening and shippable specs ([#288](https://github.com/kzndotsh/watchdog/issues/288), [#289](https://github.com/kzndotsh/watchdog/issues/289), [#290](https://github.com/kzndotsh/watchdog/issues/290)) are done, no new custom lint rule or gate script is added unless the pull request names a real regression it would have caught. Deletions and simplifications of existing gates are welcome. This is guidance enforced by review ([conventions](../reference/platform/conventions.md#testing-and-gates)).

### OpenAPI breaking changes

The generated spec is the API contract for the CLI and every external client. The drift step only proves it is current, not compatible ([#353](https://github.com/kzndotsh/watchdog/issues/353), under [#289](https://github.com/kzndotsh/watchdog/issues/289)). The `OpenAPI breaking changes` step in the Gates job runs oasdiff (`tufin/oasdiff`, pinned by version and `@sha256:` digest in the step's `OASDIFF_IMAGE`; `--network none`, so nothing leaves the runner) as `oasdiff breaking base head --fail-on ERR`. It takes about a second: the drift step already guarantees the committed spec equals the generated one, so it needs no build.

- **Compared:** the spec at the pull request base sha against the checked-out head; on a push to `main`, `github.event.before` against the pushed commit. A base without the spec file (a new branch, the first push) skips the step with a notice.
- **Fails on:** oasdiff's error-level rules: a removed route or method, a removed or newly required request property or parameter, a narrowed request enum or type, a removed required response property, a removed response status. Warning-level findings are printed and pass. Additions pass: a new route, a new optional field.
- **Runs:** on every push to `main`, and on pull requests that touch `packages/{api,client,core}` or root tooling (the `api` and `config` filters), like the drift step beside it.
- **Approving an intentional break:** add `BREAKING CHANGE: <what breaks and why>` as a footer line (conventional commits) on a commit in the range; `feat(api)!:` alone is not enough. The step finds it in the log of `base..HEAD`, passes, and prints the line as a workflow warning, so the acknowledgement sits in the commit history, the PR's commit list and the run log. On a squash merge, keep the footer in the squash message so the push to `main` still passes.
- **Why a footer and not a label:** a label needs a `labeled` trigger that restarts all of CI, is not in the history, and is invisible to the push-to-`main` run, which would fail on the squashed commit. The footer travels with the change and doubles as changelog input. It is the only bypass: there is no env switch, `continue-on-error` or ignore file, and `ci-workflow.gate.test.ts` fails if the step stops running on push, loses its digest pin or `--fail-on ERR`, or gains a second bypass.
- **Bumping oasdiff:** change the tag and digest together (`docker buildx imagetools inspect tufin/oasdiff:<tag>` prints the digest); Dependabot does not track it.
- **Gate freeze:** this gate is an explicit exception, requested in #353.

### Which jobs run

A pull request that touches only `scripts/**` (and docs) runs Gates, Unit, property and component tests and Gate tests (the gate scripts run in Gates; their `*.gate.test.ts` run in Gate tests as the `gate` project) and skips Integration and Playwright e2e, unless it touches one of the scripts those jobs run, which still starts them: `scripts/ensure-test-db.sh` (`pnpm test-db`), `scripts/ensure-readonly-role.sh` (called by it) and `scripts/s3-init.sh`. Everything else is unchanged: any other code or tooling change runs the same jobs as before, and a push to `main` runs all of them. The filters are the `changes` job in `ci.yml` (`config_core`, `integration_scripts`, `typescript_app`); add a script to `integration_scripts` when Integration or Playwright e2e starts calling it. Integration and Playwright e2e share one trigger set, the one the old combined job had: db, api, caps, web, e2e, app TypeScript, root tooling or `integration_scripts` changes (and every push to `main`). Neither is narrower than the other, so a backend-only change still runs Playwright. Web build runs on web, app TypeScript, root tooling or bundle-gate changes (`bundle_scripts`: the gate script and its baseline) and every push to `main`; it waits for File detection only. `scripts/__tests__/ci-workflow.gate.test.ts` parses `ci.yml` and fails if the two conditions differ or lose a term, if the unit-component job and Gate tests diverge, if Web build loses a trigger, its build-then-gate order or its dependency on File detection only, if a job has no `timeout-minutes`, or if `Check` stops waiting for a job or handling its result.

### Container image

Job `container` ("Container image"): builds the `web` and `worker` targets of the root `Dockerfile` (`docker/build-push-action` with the GitHub Actions layer cache, `load: true`, nothing pushed), scans both with Trivy, then runs `docker/smoke.sh` against a Postgres service container and SeaweedFS (`docker run`, as Integration does: a service container cannot take the `mini` command). Operator view: [`self-host`](../how-to/self-host.md).

- **Triggers:** every push to `main`, and a pull request that changes the `container` filter (Dockerfile, `.dockerignore`, `.trivyignore`, `docker/**`, `docker-compose.prod.yml`, `env.production.example`, `scripts/s3-init.sh`, `apps/web/**`, `apps/worker/**`, `packages/**`) or `config_core` (so a lockfile, manifest or `.github/**` change). It waits for File detection only, holds the read-only default token and has a 20-minute tripwire.
- **In `Check`:** yes. It runs beside Playwright e2e and is not longer than it, so the required status still waits for the slowest job (timings below). A new Trivy finding on an unchanged tree is the one source of nondeterminism; it only fails the job when a fix exists (`ignore-unfixed`), which is the signal to bump the base image digest or the dependency. If the scan ever flakes on its database download, take that step out of `Check`'s path before dropping the job.
- **Trivy:** `aquasecurity/trivy-action` pinned by SHA with an explicit scanner `version`, `scanners: vuln`, `severity: HIGH,CRITICAL`, `exit-code: 1`, `ignore-unfixed: true`, ignore file `.trivyignore`. Each entry there needs a reason comment on the line above (the gate test fails otherwise): why it does not apply or cannot be fixed yet, the review date and the condition that removes it. The scan sees the base image's OS packages and any `package.json` on disk. Dependencies bundled into the app files are invisible to it, so dependency advisories reach the images through the lockfile (Dependabot, `pnpm audit`), not through this scan; the release SBOM is #310.
- **Smoke test** (`docker/smoke.sh`, runnable locally with your own Postgres and SeaweedFS and free ports): two web replicas start at once on an empty database (advisory lock; both reach `/api/v1/ready` with `database` and `storage` ok), liveness, the sign-in page, non-root, the first-admin command (an admin who signs in with signup closed, a second run refused), a placeholder secret stopping a web container, a `pg_dump` restored into an empty database, the worker boots and skips migrations, the application role (`watchdog_app`, created by the script as the production compose creates it) owning nothing and being refused `ALTER`, `DROP`, `TRUNCATE`, trigger changes, object creation and edits to the audit tables while reads work, neither server process holding the owner URL, no log-drain write errors, then a fixture migration (`docker/smoke/failing-migration`, dated 2100 so it is the newest) must make the web container exit non-zero before it listens, and the same fixture with `WD_SKIP_MIGRATIONS=1` must start.
- **Guard:** `scripts/__tests__/ci-workflow.gate.test.ts` checks the job's triggers, its path filter, that it waits for File detection only with no extra permissions, that it builds both targets with the layer cache and never pushes, that both Trivy steps fail on high and critical with the ignore file, the build, scan, smoke order, that the Dockerfile's Node major equals CI's, and that every base image (Dockerfile, production compose) is digest-pinned.

### Bundle budget

`scripts/check-bundle-budget.mjs` (`pnpm check:bundle`) reads the TanStack Start manifest of a production web build (`apps/web/dist/server/assets/_tanstack-start-manifest*.js`), follows static `import "./x.js"` edges between client chunks and gzips each route's JavaScript. Three kinds of number, all gzip bytes:

| Metric | What it is |
| --- | --- |
| `entry` | The `__root__` preload closure: what every page downloads |
| `shell` | Entry plus the `/_protected` closure: the signed-in shell |
| `routes[id]` | The chunks a route's closure adds on top of the shell: its own cost |

`scripts/bundle-budget-baseline.json` is the committed baseline. A metric fails when it is more than 5% over its baseline; a route that is not in the baseline fails until it is added. Total client JavaScript is printed but never gated: most of it is lazily loaded syntax-highlighting grammars no route downloads up front. The Web build job runs it after `pnpm build`.

**Reading a failure.** Each line names the metric, its size, the baseline and the percentage over: `route /_protected/entities/: 410.2 KB gzip, baseline 366.8 KB (+11.8%, limit +5%)`. An `entry` or `shell` failure means something landed in the code every page loads (a new top-level import, a dependency pulled into the root layout); a route failure means that route's own chunks grew. Find what changed with `pnpm build` then `ls -S apps/web/dist/client/assets | head` or a diff of the manifest preloads; the usual fix is a dynamic `import()` for a heavy dependency.

**Updating the baseline.** The baseline only shrinks:

1. `nice -n 10 pnpm build && pnpm check:bundle --update` after a change that legitimately shrinks a route (for example lazy-loading the rich-text editor). It lowers every metric that got smaller, adds new routes, drops removed ones and never raises a number. Commit the JSON with the change; the output says how many metrics shrank.
2. A deliberate increase is a hand edit of the number in `scripts/bundle-budget-baseline.json`, with the reason in the PR body. `--update` refuses to do it because a ratchet that raises itself is not a ratchet.
3. `pnpm check:bundle --json` prints the measurement without comparing it.

The baseline is measured on `main` with the React Compiler on (the default; `REACT_COMPILER=off` changes sizes). Two builds of the same commit are byte-identical, so the numbers do not move between runs; across machines the gzip output can differ slightly with the zlib build, which the 5% margin absorbs.

Baseline when the gate landed (gzip KB; routes are own chunks beyond the shell):

| Metric                             | KB          |
| ---------------------------------- | ----------- |
| entry                              | 312.6       |
| shell                              | 413.4       |
| `/_protected/entities/$entitySlug` | 486.9       |
| `/_protected/identifiers/`         | 379.6       |
| `/_protected/entities/`            | 366.8       |
| `/_protected/ui/`                  | 360.6       |
| `/_protected/collect/`             | 126.7       |
| other routes                       | 1.0 to 74.5 |

(The Work routes moved under `/_protected/cases/$caseSlug/` when the Case entered the URL; their baselines carry over to the new route ids, e.g. `/_protected/cases/$caseSlug/entities/$entitySlug`.) The three routes near 370 to 490 KB carried the rich-text editor eagerly (audit finding W1). Lazy-loading it (#258) lowered the baseline to 85.2 KB (`/_protected/entities/`), 97.8 KB (`/_protected/identifiers/`), 205.3 KB (`/_protected/entities/$entitySlug`) and 78.9 KB (`/_protected/ui/`); what remains is page code (data table, combobox, select).

### Job timeouts

Every job sets `timeout-minutes` as a tripwire, about twice the observed p90 of its successful runs, so a hung step dies in minutes instead of the 360-minute default. They are deliberately loose: a timeout that flakes costs more than one that is a few minutes late. `ci-workflow.gate.test.ts` fails a job without one.

Durations (job start to finish, successful runs) from `gh run view --json jobs`, 54 runs of the `ci` workflow on `main` and on the layout PR branch, 2026-10-13; the split layout has only 4 samples, so the older combined-job data is kept for context:

| Job | Samples | p50 min | p90 min | max min | `timeout-minutes` |
| --- | --- | --- | --- | --- | --- |
| File detection | 53 | 0.1 | 0.1 | 0.2 | 3 |
| Gates | 46 | 2.2 | 2.4 | 2.4 | 5 |
| Unit, property and component tests (was Unit) | 47 | 2.5 | 2.8 | 3.0 | 6 |
| Gate tests | 4 | 1.4 | 2.3 | 2.3 | 5 |
| Integration | 5 | 1.7 | 1.8 | 1.8 | 8 |
| Playwright e2e | 5 | 4.5 | 4.9 | 4.9 | 10 |
| Integration + e2e (old combined job) | 41 | 5.3 | 5.6 | 5.7 | (split) |
| Web build | 1 (PR #263's run) | 0.9 | 0.9 | 0.9 | 5 |
| Advisory | 49 | 1.4 | 1.6 | 1.7 | 6 |
| Check | 46 | 0.1 | 0.1 | 0.1 | 2 |

Web build is new: one sample (install, build and gate in 55 s), so the 5-minute floor sets it. Rules used: twice the p90, rounded up, with a floor of 5 minutes for any job that installs dependencies (a cold pnpm cache adds time the samples barely show) and extra room for Integration (5 samples, Docker image pulls). Integration is 8 against 3.6 by the formula for that reason. Web build's first CI run printed the same sizes as a local build (Node 22 on the runner and in the nix shell), so gzip output matched across both. Re-derive the numbers when a job's p90 doubles or a job starts timing out; a timeout failure is a signal to look at the job, not only to raise the limit.

### CI speed choices

- **Coverage:** only `coverage/lcov.info` is read (Codecov), so CI passes `--coverage.reporter=lcovonly`; local `pnpm test:coverage` keeps the text and html reports. The gate project is outside `test:coverage`: its tests run the gate scripts as child processes, so v8 saw no covered code there. It runs as its own job (Gate tests, same path filter as the unit-component job) so it no longer adds to that job; its JUnit file goes to Codecov test results.
- **Playwright:** the CI reporter list adds `json` (`test-results/results.json`); the `playwright-json` artifact is uploaded on every run, the HTML report and traces only on failure. The browser cache is keyed on the installed `@playwright/test` version, not the lockfile. `psql` is installed only when `command -v psql` finds none.
- **Gate test files:** a gate test that runs oxlint or spawns real scripts is slow, and the project runs files in parallel but cases in a file serially, so split a file by concern before it passes about 20 s. Test a script's decisions as pure functions and keep real spawns for wiring: the oxlint baseline script keeps only I/O in `scripts/oxlint-baseline.mjs`, its rules are `scripts/oxlint-plugin/lib/baseline-update.mjs` (tested without a process in `oxlint-baseline-update.gate.test.ts`), and a stub `oxlint` stands in for the scan in the lock tests. The oxlint baseline CLI announces its lock timeout on stderr (`gives up after <n>ms`).

## Repo meta

Files GitHub reads from the repository, kept under `.github/` unless noted:

- `.github/CODEOWNERS`: one global owner while the repo is solo; kept honest by `check:codeowners`.
- `.github/ISSUE_TEMPLATE/`: bug report and feature request forms (the feature form uses the spec headings agents write) and `config.yml`, which disables blank issues and links the security policy. Not gated: a form schema error hides a template silently, so parse new forms with the `yaml` package.
- `.github/PULL_REQUEST_TEMPLATE.md`: linked issue, gates run, docs affected and the custody checklist.
- [`SECURITY.md`](../../.github/SECURITY.md) (`.github/`): supported versions and private vulnerability reporting.

## Stop hook (Cursor and Claude Code)

One script, `.cursor/hooks/stop-gate.mjs`, serves both harnesses through a small adapter: Cursor registers it in `.cursor/hooks.json` with `--client=cursor` (payload `status`, `loop_count`; answers `followup_message`; `loop_limit: 2`), and Claude Code registers it in `.claude/settings.json` (`hooks.Stop`) with `--client=claude` (payload `stop_hook_active`; answers `{"decision":"block","reason":...}`; a second pass with `stop_hook_active: true` is allowed to stop). Both run through `.cursor/hooks/run-node.sh` with a 60 s timeout, and without the flag the script sniffs the payload. `.claude/settings.json` also keeps commit and PR attribution off (`attribution.commit` and `attribution.pr` set to empty strings). A structural test in `hook-policy.gate.test.ts` pins both facts.

In a Claude Code session started in a worktree, `$CLAUDE_PROJECT_DIR` stays at the directory the session started in, so the hook runs that checkout's gate against that checkout's changes.

The gate lint-checks changed files, `check-agents.mjs --strict` when `AGENTS.md` is dirty, `check-docs.mjs --strict --fail-length` when `docs/**` is dirty, and `validate-agents.mjs` when `.agents/skills/**` or `.cursor/README.md` are dirty. Fix violations before ending the turn.

## Gotchas

- Plans are not SoT: durable contracts live in `docs/`. `.cursor/plans/` (incl. `_archived/`) are historical.
