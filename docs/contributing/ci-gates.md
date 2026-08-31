# CI and local gates

**What this is:** lefthook, CI jobs, regen commands, doc-affect map, Cursor stop hook.  
**What this is not:** test methodology ([`testing/standards.md`](testing/standards.md)).

## Local hooks (lefthook)

Installed via `lefthook install` (auto in `nix develop`). Override with `lefthook-local.yml`.

| Hook | Commands (glob-scoped; see `lefthook.yml`) |
| --- | --- |
| **pre-commit** | `pnpm fix` · `pnpm check:agents:strict` (AGENTS/docs) · `pnpm check:docs` (docs) · `pnpm check:docs-affected:strict` (mapped code paths) · `pnpm validate:agents` (skills) |
| **pre-push** | `pnpm typecheck` · `pnpm ds:check` from `apps/web/` |

Run gates manually anytime (root [`AGENTS.md`](../../AGENTS.md) quick reference):

| Command | Purpose |
| --- | --- |
| `pnpm check` | Oxlint + Oxfmt (Ultracite) |
| `pnpm typecheck` | Workspace TS |
| `pnpm check:agents:strict` | AGENTS.md hygiene + doc length on agents |
| `pnpm check:docs:strict` | Docs links, index, leaf length budget |
| `pnpm check:docs-affected:strict` | Changed code must touch mapped docs |
| `pnpm validate:agents` | Agent Skills frontmatter / structure |
| `pnpm --filter @watchdog/web ds:check` | Web design-system bans |
| `pnpm test` / `pnpm test:e2e:smoke` | Tests (see [`testing/index.md`](testing/index.md)) |

## Regen (commit artifacts)

| Command                | Artifact                              |
| ---------------------- | ------------------------------------- |
| `pnpm generate:caps`   | `packages/caps/capabilities.gen.json` |
| `pnpm generate:client` | `packages/client/src/generated/`      |
| `pnpm generate-routes` | `apps/web` route tree                 |

CI fails if regen output drifts from committed files.

## GitHub CI (summary)

Workflow: `.github/workflows/ci.yml`. PRs skip heavy jobs when path filters show docs-only; push to `main` runs full CI.

Fast gates (change-aware on PRs): Ultracite → AGENTS strict → docs strict → docs-affect strict → validate agents → typecheck → knip → web DS → cap/client drift → unit/property → component → db repo check → integration/e2e with Postgres + MinIO.

Doc-affect escape hatch: commit message, `.git/docs-allow-affect` stamp, or PR body keyword (see `scripts/check-docs-affected.mjs`).

## Cursor stop hook

`.cursor/hooks/stop-gate.mjs` lint-checks changed files, runs `ds:ban` when web UI paths are dirty, `check-agents.mjs --strict` when `AGENTS.md` is dirty, and `validate-agents.mjs` when `.agents/skills/**` or `.cursor/README.md` are dirty; fix violations before ending the turn. `wd-ui-files.mjs` is bidirectional with `shared/ui` except `shadcn/` and `__tests__/`.

## Gotchas

- **Plans are not SoT**: durable contracts live in `docs/` (incl. `docs/reference/web/`). `.cursor/plans/` (incl. `_archived/`) are historical; don't reintroduce Tape/Console/Inspector/Workbench nouns from old plans.
- **Duplicate React imports**: strReplace can create duplicate `import { useState } from "react"`: check the first lines after edits.
