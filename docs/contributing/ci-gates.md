# CI and local gates

**What this is:** lefthook, CI jobs, regen commands, doc-affect map, Cursor stop hook.  
**What this is not:** test methodology ([`testing/standards.md`](testing/standards.md)).

## Local hooks (lefthook)

Installed via `lefthook install` (auto in `nix develop`). Override with `lefthook-local.yml`.

| Hook | Commands (glob-scoped; see `lefthook.yml`) |
| --- | --- |
| **pre-commit** | `ultracite fix` on staged files only (`.mjs` → read-only repo-wide `pnpm check`) · `pnpm check:agents:strict` (AGENTS.md) · `pnpm check:docs:strict` (docs) · `pnpm check:effect-edges:strict` (Effect run* allowlist) · `pnpm check:size` (file-size ratchet) · `pnpm check:design-tokens` (DESIGN.md colors vs CSS; pre-commit only) · `pnpm check:vendor` (locked `packages/ui`) · `pnpm validate:agents` (skills) · `pnpm check:action-pins` (workflow action pins) |
| **commit-msg** | `pnpm check:docs-affected:strict {1}` (mapped code paths vs the staged diff, reading the real message file) |
| **pre-push** | `pnpm typecheck` · `pnpm ds:check` from `apps/web/` |

Run gates manually anytime (root [`AGENTS.md`](../../AGENTS.md) quick reference):

| Command | Purpose |
| --- | --- |
| `pnpm check` | Oxlint + Oxfmt (Ultracite). `effecttsgo` recommended is on; warn-severity Effect rules do not fail this gate. `@shadcn/lint` (pinned, web only) fails raw palette colors, undeclared tokens, off-scale arbitrary values, and Tailwind classes that generate no CSS. |
| `pnpm typecheck` | Workspace TS (source only; tests are excluded from the main configs) |
| `pnpm typecheck:tests` | Test typecheck ratchet (`scripts/typecheck-tests.mjs`): runs every package's `typecheck:tests` plus the `scripts/` and `e2e/` test configs, prints errors and files-with-errors per package and a total. Exits nonzero only when a package on `scripts/test-typecheck-clean.json` has errors (or crashes), or the list names an unknown package. CI job **Test typecheck**; not in pre-push until the contract step (see [Test typecheck rollout](#test-typecheck-rollout)) |
| `pnpm check:test-coverage-guard` | Every test file `vitest list` discovers is included by some `tsconfig.test.json` (`scripts/check-test-coverage-guard.mjs`). CI job **Test typecheck** |
| `pnpm check:agents:strict` | AGENTS.md hygiene: presence in every `apps/*` / `packages/*`, size budget, Scope + Commands sections, relative links, banned terms, CLAUDE.md `@AGENTS.md` bridge. Docs-tree links and length are `check:docs` only |
| `pnpm check:docs:strict` | Docs links, index, leaf length budget |
| `pnpm check:docs-affected:strict` | Changed code must touch mapped docs |
| `pnpm check:effect-edges:strict` | `Effect.runPromise` / `runSync` only on allowlisted edges; `tryPromise`/`try` must use `{ try, catch }`; no production `throw new DomainError` |
| `pnpm check:size` | Tracked `src` files ≤ 600 lines; files in `scripts/size-budget-baseline.json` may shrink, never grow (`--update` re-baselines downward) |
| `pnpm validate:agents` | Agent Skills: vendored skills match their `skills-lock.json` pin; owned skills follow house rules (see [Skills gate](#skills-gate)) |
| `pnpm test:gate` | Gate tests: each gate script run as a CLI against a temporary git repo (part of `pnpm test`; pre-push when `scripts/**` changes) |
| `pnpm check:design-tokens` | DESIGN.md front-matter colors match `wd-tokens.css` / `wd-dark.css` (pre-commit only) |
| `pnpm check:vendor` | `packages/ui` generated primitives match `vendor.json` (never hand-edit), and the shadcn CLI version recorded there equals the one `scripts/ui-vendor.mjs` pins |
| `pnpm check:action-pins` | Every third-party action in `.github/workflows/*.{yml,yaml}` is pinned to a 40-char commit SHA with a version comment (see [Pinning](#pinning-and-ci-permissions)) |
| `pnpm --filter @watchdog/web ds:check` | Web design-system bans (inventory + reasons: [`ui/rules.md`](../reference/web/ui/rules.md)) |
| `pnpm test` / `pnpm test:e2e:smoke` | Tests (see [`testing/index.md`](testing/index.md)) |

## Skills gate

`scripts/validate-agents.mjs` reads [`skills-lock.json`](../../skills-lock.json). A skill whose folder name is a key there is **vendored** (installed by the `skills` CLI from a third-party repo, committed under `.agents/skills/`); every other skill is **owned**.

|  | Vendored | Owned |
| --- | --- | --- |
| `SKILL.md` present, frontmatter parses, `name` (matches folder) and `description` present | yes | yes |
| Folder content hash equals the lock's `computedHash` | yes: a hand edit fails, naming the folder and the reinstall command (`npx skills add <source> --skill <name>`) | no |
| `metadata.owner` / `metadata.sources`, trigger clause in `description`, `references/` hints, staleness | no | yes |
| Staleness: warns only when a `metadata.sources` path changed in the diff and the skill's own files did not. Diff = `--staged` (pre-commit), `--range=<a..b>` (CI pull request), `--before=<sha> --after=<sha>` (CI push; an all-zero `before` falls back to the merge base with `main`), default working tree. An unresolvable range or SHA fails the gate; it never skips the check. A clean tree never warns | no | yes (warn) |
| `SKILL.md` line budget | no | warn above 400 lines, fail above 500 |

Hash scheme (same as the `skills` CLI): sha256 over every file in the skill folder (excluding `.git`, `node_modules`), sorted by forward-slash relative path with `localeCompare`, feeding each file's relative path then its bytes. Never edit a vendored skill; update it with the CLI so the lock is rewritten with it. Claude Code frontmatter keys (`disable-model-invocation`, `argument-hint`, `user-invocable`, `allowed-tools`, `model`) are accepted on both kinds.

## Hook policy: block or delete

Every hook either blocks (exits non-zero, or for the Cursor `stop` hook reports a `followup_message`) or is deleted. No hook runs a gate in a mode that always exits 0. Warn-only modes (`pnpm check:docs`, non-strict `pnpm check:docs-affected`) exist for manual use only and are never wired to a hook or CI. Warnings that stay (skills staleness, line budgets) are advisory output of a gate that still fails on real errors.

| Gate | Stage | Strict mode | Escape hatch |
| --- | --- | --- | --- |
| `ultracite fix` / `pnpm check` | pre-commit | always blocks | none |
| `pnpm check:agents:strict` | pre-commit, CI, Cursor stop | `--strict` | none |
| `pnpm check:docs:strict` | pre-commit, CI, Cursor stop | `--strict --fail-length` | none |
| `pnpm check:docs-affected:strict` | commit-msg, CI | `--strict --strict-only` | `docs:allow-affect — <reason>` in the commit's own message (CI: a message in the pushed range, or the PR body) |
| `pnpm check:effect-edges:strict` | pre-commit, CI | `--strict` | none |
| `pnpm check:size` / `check:vendor` / `check:design-tokens` | pre-commit (+ CI for size, vendor) | always blocks | none |
| `pnpm validate:agents` | pre-commit (`--staged`), CI (`--range`), Cursor stop | fails on errors; staleness is a warning | none |
| `pnpm typecheck` / `pnpm ds:check` | pre-push, CI | always blocks | none |
| `pnpm typecheck:tests` | CI (Test typecheck job) | blocks only for packages on the clean list | none |
| `pnpm check:test-coverage-guard` | CI (Test typecheck job) | always blocks | none |

Local, per-clone skipping goes through `lefthook-local.yml`; `--no-verify` is not an escape hatch. The Cursor `afterFileEdit` hook was deleted: Cursor never read its output.

## Gate tests

Vitest project `gate` (`pnpm test:gate`, also in `pnpm test`): `scripts/__tests__/*.gate.test.ts`, named `<script basename>.gate.test.ts`. Each test builds a temporary git repo, copies the gate script in (`scripts/__tests__/helpers/gate-repo.ts`; gates that resolve paths from their own location, such as `packages/db/scripts/check-repo-rules.mjs` and `apps/web/scripts/ds-ban-check.mjs`, keep their package layout), runs `node <script>` as lefthook or CI would, and asserts on the exit code and key output phrases. Tests never import gate internals. Every gate needs a must-fail and a must-pass fixture; changing a gate script means changing its test.

The fixture strips `CI`, `GITHUB_*`, `DOCS_AFFECT_*` and `GIT_*` from the environment a gate sees, so a suite running under GitHub Actions cannot flip a gate into CI mode. A test that wants CI mode passes those variables through the `env` option.

**Meta-test.** `scripts/__tests__/gate-coverage.gate.test.ts` reads `lefthook.yml` (pre-commit, commit-msg, pre-push) and the CI `gates` and `test-typecheck` jobs, resolves every `pnpm` command through `package.json` (including `pnpm --filter <pkg> <script>` and package-level scripts), and collects the gate scripts under `scripts/`, `packages/db/scripts/` and `apps/web/scripts/`. Each needs a `*.gate.test.ts` with at least one test named like `fails` / `must fail` / `rejects`. Third-party tools (ultracite, tsc, astro, vitest, knip, tsx) are allow-listed by name in that file; any other command wired into a hook or one of those jobs fails the meta-test, so a new gate cannot land untested.

**Shared git helpers.** `scripts/lib/git-range.mjs` is the one place gates talk to git for diffs: `git` throws with git's stderr instead of returning an empty result, `resolvePushRange` handles `before..after` (an all-zero `before` falls back to the merge base with `origin/main`, then `main`; anything unresolvable throws), and `hasSubstantiveChange` returns true only on `git diff --quiet -w --ignore-blank-lines` exit 1 and throws on any other failure. A broken diff therefore fails `check-docs-affected` and `validate-agents` rather than counting as a doc touch or "no changes". The Cursor stop hook uses the same helper but keeps its documented fail-open contract (a hook never blocks the agent because it broke): its top-level catch answers `{}` and says so on stderr, while real gate failures still surface as `followup_message`.

## Pinning and CI permissions

- **Actions:** `uses: owner/repo@<40-char sha> # vX.Y.Z`. Tags move; SHAs do not. Resolve with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (an annotated tag, `object.type` of `tag`, needs one more hop to the commit). Local `./` and `docker://` references are exempt. Dependabot's `github-actions` entry bumps the SHA and the comment together. `pnpm check:action-pins` fails on tags, branches, short SHAs, or a missing version comment.
- **shadcn CLI:** `scripts/ui-vendor.mjs` runs `shadcn@<exact version>` (never `latest`) and records it as `shadcn` in `packages/ui/vendor.json`; `pnpm check:vendor` fails if the two differ. To bump: edit the constant, run `pnpm ui:sync`, review the `packages/ui` diff.
- **desloppify:** installed as `desloppify[full]==<version>` in the Advisory job (also named in `scripts/desloppify-bootstrap.sh`'s install hint). Bump both together.
- **Permissions:** the workflow default is `contents: read`. A job that needs more declares it itself: Test typecheck (`contents: read`, stated explicitly), Unit (`id-token: write` for Codecov OIDC, `pull-requests: write`), File detection (`pull-requests: read` for paths-filter), Advisory (`pull-requests: write`, `issues: write` for React Doctor comments); Check has none. Add a job-level grant, never a workflow-level one.

## Test typecheck rollout

Tests are typechecked in three steps (spec [#54](https://github.com/kzndotsh/watchdog/issues/54)); methodology in [`testing/standards.md`](testing/standards.md#tests-are-typechecked).

1. **Expand (now).** Each package or app with tests has a `tsconfig.test.json` and a `typecheck:tests` script. The CI job **Test typecheck** runs `pnpm typecheck:tests`, which reports per-package error counts and fails only for packages on `scripts/test-typecheck-clean.json` (initially empty), then `pnpm check:test-coverage-guard`. The main `typecheck` and pre-push are unchanged. The job is part of the **Check** aggregate like the others.
2. **Ratchet.** Each fixing change adds its package (the path as printed in the table, e.g. `packages/api`) to the clean list in the same commit that brings it to zero errors.
3. **Contract.** When the list covers every project, each package's `typecheck` runs both configs, pre-push picks tests up through `pnpm typecheck`, and the job, the list and `scripts/typecheck-tests.mjs` are removed. The coverage guard moves into the gates job.

## Regen (commit artifacts)

| Command                | Artifact                              |
| ---------------------- | ------------------------------------- |
| `pnpm generate:caps`   | `packages/caps/capabilities.gen.json` |
| `pnpm generate:client` | `packages/client/src/generated/`      |
| `pnpm generate-routes` | `apps/web` route tree                 |

CI fails if regen output drifts from committed files.

## GitHub CI (summary)

Workflow: `.github/workflows/ci.yml`. PRs skip heavy jobs when path filters show docs-only; push to `main` runs full CI.

Parallel after File detection: **Gates** (Ultracite, AGENTS/docs/effect/skills, typecheck, knip, web DS, `pnpm --filter @watchdog/site build` when `apps/site/**` changes, cap/client drift, db repos) ‖ **Test typecheck** (`pnpm typecheck:tests` ratchet + `pnpm check:test-coverage-guard`; runs when TypeScript or config changes) ‖ **Unit** (`pnpm test:coverage` for unit/property/component; Codecov + Test Analytics upload is non-blocking; OIDC, optional `CODECOV_TOKEN`) ‖ **Integration + e2e** (Postgres + S3 storage). Advisory (React Doctor / Desloppify) runs separately and does not block — Desloppify CI uses `pnpm desloppify:scan:ci` (bootstrap excludes `repos`/`data`/generated trees first). Aggregator job **Check** stays the required status (treats skipped siblings as OK).

Dependabot version updates: [`.github/dependabot.yml`](../../.github/dependabot.yml) (npm/pnpm root lockfile, GitHub Actions, docker-compose, Nix flakes) — weekly Mondays, grouped minor/patch.

Doc-affect escape hatch: `docs:allow-affect — <reason>` (reason required) must be in the commit's own message; it excuses only that commit. The gate runs at commit-msg on the staged diff only, and in CI diffs the pull-request range or the pushed `before..after` range (all-zero `before` falls back to the merge base with `main`; an unresolvable range fails). A doc counts as touched only for a non-whitespace change. In CI, the PR body or any commit message in the pushed range may carry the marker (see `scripts/check-docs-affected.mjs`).

## Cursor stop hook

`.cursor/hooks/stop-gate.mjs` lint-checks changed files, runs `ds:ban` when web UI paths are dirty, `check-agents.mjs --strict` when `AGENTS.md` is dirty, `check-docs.mjs --strict --fail-length` when `docs/**` is dirty, and `validate-agents.mjs` when `.agents/skills/**` or `.cursor/README.md` are dirty; fix violations before ending the turn.

## Gotchas

- **Plans are not SoT**: durable contracts live in `docs/` (incl. `docs/reference/web/`). `.cursor/plans/` (incl. `_archived/`) are historical; don't reintroduce Tape/Console/Inspector/Workbench nouns from old plans.
- **Duplicate React imports**: strReplace can create duplicate `import { useState } from "react"`: check the first lines after edits.
