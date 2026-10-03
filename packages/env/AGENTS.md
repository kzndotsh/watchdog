# Environment package (`@watchdog/env`)

> Scope: `packages/env` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

T3 Env + Zod for deploy/boot secrets, through the single entrypoint `@watchdog/env/server` (web, worker, db client, core, api). The `wd` CLI owns its own `WD_API_*` parse in `apps/cli/src/env.ts`: do not add a CLI export here.

## Commands

| Task       | Command                                 |
| ---------- | --------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/env typecheck` |
| Unit tests | `pnpm test:unit`                        |

## Gotchas

- Cap secrets live in the vault (`WD_MASTER_VAULT_KEY` + Settings), not env. Read validated keys as `env.FOO`, not `process.env` (guidance; the lint rule is off).
- Set `SKIP_ENV_VALIDATION=1` for lint/Docker without secrets. An incomplete `.env` fails on the first `/server` import. Do not add a `VITE_` client entry until it is earned.
- `drizzle.config.ts` cannot resolve `@watchdog/env`: it loads the repo-root `.env` via dotenv ([`packages/db/AGENTS.md`](../db/AGENTS.md)).
- `BETTER_AUTH_ALLOW_SIGNUP` defaults to `false`, so omitting it also closes registration; `.env` is read at boot, so restart web after changing it. Walkthrough: [`auth-setup`](../../docs/how-to/auth-setup.md).
- `SMTP_*` is optional: invitations still work via copy-link + evlog; mail sends only when both `SMTP_HOST` and `SMTP_FROM` are set.
