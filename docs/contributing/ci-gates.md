# CI and local gates

**What this is:** lefthook, CI jobs, regen commands, doc-affect map, Cursor stop hook.  
**What this is not:** test methodology ([`testing/standards.md`](testing/standards.md)).

## Local hooks (lefthook)

Installed via `lefthook install` (auto in `nix develop`). Override with `lefthook-local.yml`.

| Hook | Commands (glob-scoped; see `lefthook.yml`) |
| --- | --- |
| **pre-commit** | `ultracite fix` on staged files only (`.mjs` → read-only repo-wide `pnpm check`) · `pnpm check:agents:strict` (AGENTS.md) · `pnpm check:docs` (docs) · `pnpm check:docs-affected:strict` (mapped code paths) · `pnpm check:effect-edges:strict` (Effect run* allowlist) · `pnpm check:size` (file-size ratchet) · `pnpm check:design-tokens` (DESIGN.md colors vs CSS; pre-commit only) · `pnpm check:vendor` (locked `packages/ui`) · `pnpm validate:agents` (skills) |
| **pre-push** | `pnpm typecheck` · `pnpm ds:check` from `apps/web/` |

Run gates manually anytime (root [`AGENTS.md`](../../AGENTS.md) quick reference):

| Command | Purpose |
| --- | --- |
| `pnpm check` | Oxlint + Oxfmt (Ultracite). `effecttsgo` recommended is on; warn-severity Effect rules do not fail this gate. `@shadcn/lint` (pinned, web only) fails raw palette colors, undeclared tokens, off-scale arbitrary values, and Tailwind classes that generate no CSS. |
| `pnpm typecheck` | Workspace TS |
| `pnpm check:agents:strict` | AGENTS.md hygiene: presence in every `apps/*` / `packages/*`, size budget, Scope + Commands sections, relative links, banned terms, CLAUDE.md `@AGENTS.md` bridge. Docs-tree links and length are `check:docs` only |
| `pnpm check:docs:strict` | Docs links, index, leaf length budget |
| `pnpm check:docs-affected:strict` | Changed code must touch mapped docs |
| `pnpm check:effect-edges:strict` | `Effect.runPromise` / `runSync` only on allowlisted edges; `tryPromise`/`try` must use `{ try, catch }`; no production `throw new DomainError` |
| `pnpm check:size` | Tracked `src` files ≤ 600 lines; files in `scripts/size-budget-baseline.json` may shrink, never grow (`--update` re-baselines downward) |
| `pnpm validate:agents` | Agent Skills: vendored skills match their `skills-lock.json` pin; owned skills follow house rules (see [Skills gate](#skills-gate)) |
| `pnpm test:gate` | Gate tests: each gate script run as a CLI against a temporary git repo (part of `pnpm test`; pre-push when `scripts/**` changes) |
| `pnpm check:design-tokens` | DESIGN.md front-matter colors match `wd-tokens.css` / `wd-dark.css` (pre-commit only) |
| `pnpm check:vendor` | `packages/ui` generated primitives match `vendor.json` (never hand-edit) |
| `pnpm --filter @watchdog/web ds:check` | Web design-system bans (inventory + reasons: [`ui/rules.md`](../reference/web/ui/rules.md)) |
| `pnpm test` / `pnpm test:e2e:smoke` | Tests (see [`testing/index.md`](testing/index.md)) |

## Skills gate

`scripts/validate-agents.mjs` reads [`skills-lock.json`](../../skills-lock.json). A skill whose folder name is a key there is **vendored** (installed by the `skills` CLI from a third-party repo, committed under `.agents/skills/`); every other skill is **owned**.

|  | Vendored | Owned |
| --- | --- | --- |
| `SKILL.md` present, frontmatter parses, `name` (matches folder) and `description` present | yes | yes |
| Folder content hash equals the lock's `computedHash` | yes: a hand edit fails, naming the folder and the reinstall command (`npx skills add <source> --skill <name>`) | no |
| `metadata.owner` / `metadata.sources`, trigger clause in `description`, `references/` hints, staleness | no | yes |
| `SKILL.md` line budget | no | warn above 400 lines, fail above 500 |

Hash scheme (same as the `skills` CLI): sha256 over every file in the skill folder (excluding `.git`, `node_modules`), sorted by forward-slash relative path with `localeCompare`, feeding each file's relative path then its bytes. Never edit a vendored skill; update it with the CLI so the lock is rewritten with it. Claude Code frontmatter keys (`disable-model-invocation`, `argument-hint`, `user-invocable`, `allowed-tools`, `model`) are accepted on both kinds.

## Gate tests

Vitest project `gate` (`pnpm test:gate`, also in `pnpm test`): `scripts/__tests__/*.gate.test.ts`. Each test builds a temporary git repo, copies the gate script in (`scripts/__tests__/helpers/gate-repo.ts`), runs `node scripts/<gate>.mjs` as lefthook or CI would, and asserts on the exit code and key output phrases. Tests never import gate internals. Every gate needs a must-fail and a must-pass fixture; changing a gate script means changing its test.

## Regen (commit artifacts)

| Command                | Artifact                              |
| ---------------------- | ------------------------------------- |
| `pnpm generate:caps`   | `packages/caps/capabilities.gen.json` |
| `pnpm generate:client` | `packages/client/src/generated/`      |
| `pnpm generate-routes` | `apps/web` route tree                 |

CI fails if regen output drifts from committed files.

## GitHub CI (summary)

Workflow: `.github/workflows/ci.yml`. PRs skip heavy jobs when path filters show docs-only; push to `main` runs full CI.

Parallel after File detection: **Gates** (Ultracite, AGENTS/docs/effect/skills, typecheck, knip, web DS, `pnpm --filter @watchdog/site build` when `apps/site/**` changes, cap/client drift, db repos) ‖ **Unit** (`pnpm test:coverage` for unit/property/component; Codecov + Test Analytics upload is non-blocking; OIDC, optional `CODECOV_TOKEN`) ‖ **Integration + e2e** (Postgres + S3 storage). Advisory (React Doctor / Desloppify) runs separately and does not block — Desloppify CI uses `pnpm desloppify:scan:ci` (bootstrap excludes `repos`/`data`/generated trees first). Aggregator job **Check** stays the required status (treats skipped siblings as OK).

Dependabot version updates: [`.github/dependabot.yml`](../../.github/dependabot.yml) (npm/pnpm root lockfile, GitHub Actions, docker-compose, Nix flakes) — weekly Mondays, grouped minor/patch.

Doc-affect escape hatch: commit message, `.git/docs-allow-affect` stamp, or PR body keyword (see `scripts/check-docs-affected.mjs`).

## Cursor stop hook

`.cursor/hooks/stop-gate.mjs` lint-checks changed files, runs `ds:ban` when web UI paths are dirty, `check-agents.mjs --strict` when `AGENTS.md` is dirty, and `validate-agents.mjs` when `.agents/skills/**` or `.cursor/README.md` are dirty; fix violations before ending the turn.

## Gotchas

- **Plans are not SoT**: durable contracts live in `docs/` (incl. `docs/reference/web/`). `.cursor/plans/` (incl. `_archived/`) are historical; don't reintroduce Tape/Console/Inspector/Workbench nouns from old plans.
- **Duplicate React imports**: strReplace can create duplicate `import { useState } from "react"`: check the first lines after edits.
