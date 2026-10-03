# CI and local gates

**What this is:** what each gate checks, where it runs, hook policy, the gate-test contract, pinning and CI permissions.  
**What this is not:** a command list (root [`AGENTS.md`](../../AGENTS.md) quick reference, `package.json`, `lefthook.yml`) or test methodology ([`testing/standards.md`](testing/standards.md)).

Hooks are installed by `lefthook install` (automatic in `nix develop`); `lefthook-local.yml` overrides per clone. `lefthook.yml` is the SoT for which command runs at pre-commit, commit-msg and pre-push; `.github/workflows/ci.yml` for CI. Warn-only modes (`pnpm check:docs`, non-strict `pnpm check:docs-affected`) exist for manual use and are never wired to a hook or CI.

## Gates

| Gate | What it checks | Stage | Escape hatch |
| --- | --- | --- | --- |
| `pnpm check` (`ultracite fix` on staged files at pre-commit) | Oxlint + Oxfmt. `@shadcn/lint` (pinned, web only) fails raw palette colors, undeclared tokens, off-scale arbitrary values and Tailwind classes that generate no CSS. Warn-severity Effect rules do not fail it | pre-commit, CI | none |
| `pnpm typecheck` | Source **and** tests: each package runs `tsconfig.json` and `tsconfig.test.json`; root adds `scripts/tsconfig.test.json`, `e2e/tsconfig.test.json` and `check:test-coverage-guard` (every vitest-discovered test and Playwright spec is in some `tsconfig.test.json`). See [`testing/standards.md`](testing/standards.md#tests-are-typechecked) | pre-push, CI | none |
| `pnpm check:agents:strict` | AGENTS.md hygiene: present in every `apps/*` / `packages/*`, size budget, Scope + Commands sections, relative links, banned mid-build terms (only in `AGENTS.md` files; the list is the `_Banned_:` lines of root `GLOSSARY.md`, which the gate requires), CLAUDE.md `@AGENTS.md` bridge | pre-commit, CI, Cursor stop | none |
| `pnpm check:docs:strict` | Docs links and anchors resolve (docs/, root markdown, AGENTS.md files), leaf length budget (fail above 600 lines). Index coverage in `docs/README.md` is a warning only | pre-commit, CI, Cursor stop | none |
| `pnpm check:docs-affected:strict` | Changed code that matches a rule in `scripts/doc-map.mjs` must touch that rule's docs (non-whitespace change) | commit-msg, CI | `docs:allow-affect — <reason>` (see below) |
| `pnpm check:effect-edges:strict` | `Effect.runPromise` / `runSync` only on allowlisted edges; `tryPromise`/`try` must use `{ try, catch }`; no production `throw new DomainError` | pre-commit, CI | none |
| `pnpm check:size` | Tracked `src` files at most 600 lines; files in `scripts/size-budget-baseline.json` may shrink, never grow (`--update` re-baselines downward) | pre-commit, CI | none |
| `pnpm check:vendor` | `packages/ui` generated primitives match `vendor.json` (never hand-edit), and the shadcn CLI version recorded there equals the one `scripts/ui-vendor.mjs` pins | pre-commit, CI | none |
| `pnpm check:design-tokens` | `DESIGN.md` front-matter colors match `wd-tokens.css` / `wd-dark.css` | pre-commit | none |
| `pnpm check:action-pins` | Every third-party action in `.github/workflows/*.{yml,yaml}` is pinned to a 40-char SHA with a version comment ([Pinning](#pinning-and-ci-permissions)) | pre-commit, CI | none |
| `pnpm validate:agents` | Agent Skills ([Skills gate](#skills-gate)) | pre-commit (`--staged`), CI (`--range`), Cursor stop | none; staleness is a warning |
| `pnpm --filter @watchdog/web ds:check` | Web design-system bans (inventory: [`ui/rules.md`](../reference/web/ui/rules.md)) | pre-push, CI | none |
| `pnpm test:gate` | The gate tests below | part of `pnpm test`; pre-push when `scripts/**` changes | none |
| `pnpm generate:caps`, `generate:client`, `generate-routes` | Regenerate `packages/caps/capabilities.gen.json`, `packages/client/src/generated/`, the web route tree; CI fails if committed output drifts | CI | none |

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

`docs:allow-affect — <reason>` (reason required) must be in the commit's own message; it excuses only that commit. The gate runs at commit-msg on the staged diff only. In CI it diffs the pull-request range or the pushed `before..after` range (an all-zero `before` falls back to the merge base with `main`; an unresolvable range fails), and the PR body or any commit message in the pushed range may carry the marker. Use it only when no mapped doc applies. Rules live in `scripts/doc-map.mjs`.

## Gate tests

Vitest project `gate` (`pnpm test:gate`, also in `pnpm test`): `scripts/__tests__/*.gate.test.ts`, named `<script basename>.gate.test.ts`. Each test builds a temporary git repo, copies the gate script in (`scripts/__tests__/helpers/gate-repo.ts`; gates that resolve paths from their own location, such as `packages/db/scripts/check-repo-rules.mjs` and `apps/web/scripts/ds-ban-check.mjs`, keep their package layout), runs `node <script>` as lefthook or CI would, and asserts on exit code and key output phrases. Tests never import gate internals. Every gate needs a must-fail and a must-pass fixture; changing a gate script means changing its test.

The fixture strips `CI`, `GITHUB_*`, `DOCS_AFFECT_*` and `GIT_*` from the environment a gate sees, so a suite running under GitHub Actions cannot flip a gate into CI mode; a test that wants CI mode passes those variables through the `env` option.

**Meta-test.** `scripts/__tests__/gate-coverage.gate.test.ts` reads `lefthook.yml` (pre-commit, commit-msg, pre-push) and the CI `gates` job, resolves every `pnpm` command through `package.json`, and collects the gate scripts under `scripts/`, `packages/db/scripts/` and `apps/web/scripts/`. Each needs a `*.gate.test.ts` with at least one test named like `fails` / `must fail` / `rejects`. Third-party tools (ultracite, tsc, astro, vitest, knip, tsx) are allow-listed by name there; any other command wired into a hook or the `gates` job fails the meta-test, so a new gate cannot land untested.

**Shared git helpers.** `scripts/lib/git-range.mjs` is the one place gates talk to git for diffs: `git` throws with git's stderr instead of returning an empty result, `resolvePushRange` handles `before..after` (all-zero `before` falls back to the merge base with `origin/main`, then `main`; anything unresolvable throws), and `hasSubstantiveChange` returns true only on `git diff --quiet -w --ignore-blank-lines` exit 1 and throws on any other failure. A broken diff therefore fails `check-docs-affected` and `validate-agents` rather than counting as a doc touch or "no changes". The Cursor stop hook uses the same helper but keeps its fail-open contract (a hook never blocks the agent because it broke): its top-level catch answers `{}` and says so on stderr, while real gate failures still surface as `followup_message`.

## Pinning and CI permissions

- **Actions:** `uses: owner/repo@<40-char sha> # vX.Y.Z`. Tags move; SHAs do not. Resolve with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (an annotated tag, `object.type` of `tag`, needs one more hop to the commit). Local `./` and `docker://` references are exempt. Dependabot's `github-actions` entry bumps the SHA and comment together. `check:action-pins` fails on tags, branches, short SHAs or a missing version comment.
- **shadcn CLI:** `scripts/ui-vendor.mjs` runs `shadcn@<exact version>` (never `latest`) and records it as `shadcn` in `packages/ui/vendor.json`; `check:vendor` fails if the two differ. To bump: edit the constant, run `pnpm ui:sync`, review the `packages/ui` diff.
- **desloppify:** installed as `desloppify[full]==<version>` in the Advisory job (also named in `scripts/desloppify-bootstrap.sh`'s install hint). Bump both together.
- **Permissions:** the workflow default is `contents: read`. A job that needs more declares it itself (Unit: `id-token: write` for Codecov OIDC and `pull-requests: write`; File detection: `pull-requests: read`; Advisory: `pull-requests: write`, `issues: write`). Add a job-level grant, never a workflow-level one.

## GitHub CI (summary)

Workflow: `.github/workflows/ci.yml`. PRs skip heavy jobs when path filters show docs-only; push to `main` runs full CI. After File detection, three run in parallel: **Gates** (the table above, plus knip, the site build when `apps/site/**` changes, cap/client drift and db repos), **Unit** (`pnpm test:coverage`; Codecov upload is non-blocking) and **Integration + e2e** (Postgres + S3). Advisory (React Doctor / Desloppify via `pnpm desloppify:scan:ci`) runs separately and does not block. The aggregator job **Check** is the required status (it treats skipped siblings as OK). Dependabot ([`.github/dependabot.yml`](../../.github/dependabot.yml)) updates npm/pnpm, GitHub Actions, docker-compose and Nix weekly on Mondays, grouped minor/patch.

## Cursor stop hook

`.cursor/hooks/stop-gate.mjs` lint-checks changed files, runs `ds:ban` when web UI paths are dirty, `check-agents.mjs --strict` when `AGENTS.md` is dirty, `check-docs.mjs --strict --fail-length` when `docs/**` is dirty, and `validate-agents.mjs` when `.agents/skills/**` or `.cursor/README.md` are dirty. Fix violations before ending the turn.

## Gotchas

- Plans are not SoT: durable contracts live in `docs/`. `.cursor/plans/` (incl. `_archived/`) are historical.
