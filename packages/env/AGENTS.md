# Environment package (`@watchdog/env`)

> Scope: `packages/env` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

T3 Env + Zod for deploy/boot secrets. Schemas composed per entrypoint. The `wd` CLI owns its own `WD_API_*` parse — do not add a CLI export here.

## Commands

| Task       | Command                                 |
| ---------- | --------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/env typecheck` |
| Unit tests | `pnpm test:unit`                        |

## Entrypoints

| Import                 | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `@watchdog/env/server` | Platform boot — web, worker, db client, core, api |

## Boundaries

| Do | Don’t |
| --- | --- |
| Server: use `env.FOO` after import | Re-read `process.env` for validated keys |
| Cap secrets in vault (`WD_MASTER_VAULT_KEY` + Settings) | Put Cap API keys in env |
| `SKIP_ENV_VALIDATION=1` for lint/Docker without secrets | Add `VITE_` client entry until earned |
| Keep CLI env in `@watchdog/cli` | Reintroduce `@watchdog/env/cli` |

## Gotchas

- Incomplete `.env` fails on first `/server` import. Unit tests for CLI env live under `@watchdog/cli`.
- **`drizzle.config.ts` exception:** kit cannot resolve `@watchdog/env` — loads repo-root `.env` via dotenv (see [`packages/db/AGENTS.md`](../db/AGENTS.md)).
- `loadRepoEnv` is internal (not a public export).
- `BETTER_AUTH_ALLOW_SIGNUP` defaults to `false`, so omitting it also closes registration. A fresh DB seeds no account — set it to `1`, restart the web process (`.env` is read at boot, not watched), register at `/auth/sign-up`, then set it back.
- `SMTP_*` is optional. Invitations still work via copy-link + evlog. Mail sends only when both `SMTP_HOST` and `SMTP_FROM` are set.

## See also / External References

| Need | File |
| --- | --- |
| Server field list | `src/server.ts` / `src/fragments.ts` |
| CLI `WD_API_*` | [`apps/cli/AGENTS.md`](../../apps/cli/AGENTS.md) |
| DB kit dotenv | [`packages/db/AGENTS.md`](../db/AGENTS.md) |
| Platform architecture | [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
