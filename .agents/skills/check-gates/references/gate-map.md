# Gate map

Load this when: deciding which `pnpm` scripts to run for dirty paths.
CI (`.github/workflows/ci.yml`) wins if this file and lefthook diverge.

`pnpm check` = Ultracite (Oxlint + Oxfmt). Pre-commit runs `pnpm fix`,
not `check`. Knip, typecheck, tests, drift, and e2e are CI / pre-push,
not pre-commit.

## Path → commands

Union rows. Fastest first: fix/check → typecheck/effect-edges/knip →
ds/agents/docs → unit/component → integration → e2e.

| Dirty paths | Run |
| --- | --- |
| `*.ts` / `*.tsx` / `tsconfig*.json` | `pnpm check`, `pnpm typecheck`, `pnpm check:effect-edges:strict`, `pnpm knip` |
| `packages/**` or `apps/**` TS | plus `pnpm test:unit`, `pnpm test:property`. CI also `pnpm test:integration` (needs `pnpm test-db` + Postgres; **Blocked** if services are down — do not skip silently) |
| `AGENTS.md`, `scripts/check-agents.mjs` | `pnpm check:agents:strict` |
| `docs/**`, `scripts/check-docs.mjs`, `scripts/doc-map.mjs`, `scripts/check-docs-affected.mjs` | `pnpm check:docs:strict`, `pnpm check:docs-affected:strict`. Lefthook also `check:agents:strict` on `docs/**` |
| `.agents/skills/**`, `scripts/validate-agents.mjs`, `.cursor/README.md` | `pnpm validate:agents`. CI `agents` filter also runs `check:agents:strict` |
| `apps/web/**` | `pnpm --filter @watchdog/web ds:check`, `pnpm test:component`, `pnpm doctor:react` (advisory; CI Advisory job, does not fail **Check**). CI also runs full `pnpm test:e2e` — locally use `pnpm test:e2e:smoke` unless `e2e/` is dirty or the user asked for full e2e |
| `apps/web/src/**`, `apps/web/scripts/**` | plus `pnpm check:docs-affected:strict` (lefthook) |
| `packages/caps/**` | `pnpm generate:caps` then `git diff --exit-code -- packages/caps/capabilities.gen.json`; `check:docs-affected:strict` |
| `packages/api/**`, `packages/client/**`, `packages/core/**` | `pnpm generate:client` then `git diff --exit-code -- packages/client/src/generated/`; `check:docs-affected:strict` for api/client (lefthook; not core) |
| `packages/db/**` | `pnpm --filter @watchdog/db check:repos` |
| `packages/cli/**` | `check:docs-affected:strict` (doc-map); TS rows above |
| `e2e/**`, `playwright.config.ts` | `pnpm exec vitest run --project e2e-parser`; `pnpm test:e2e` (or `pnpm test:e2e:smoke` for harness-only); `check:docs-affected:strict` |
| `package.json`, lockfile, `pnpm-workspace.yaml`, `vitest.config.ts`, `knip.ts`, `oxlint.config.ts`, `oxfmt.config.ts`, `.github/**`, `scripts/**` | full set — treat as config |

`generate-routes` is not a CI drift job. Run it when route files changed so
`routeTree.gen.ts` matches; do not treat it as a merge gate.

Lefthook `effect-edges` skips `__tests__` and `*.test.ts(x)`; CI still runs
the script on any TypeScript change.

Desloppify is Advisory on `main` only (`pnpm desloppify:scan:ci`). Not a
merge gate — do not require it here.
