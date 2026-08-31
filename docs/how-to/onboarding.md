# Onboarding

**What this is:** first-run setup for a solo investigator (signup, env, wipe).  
**What this is not:** day-to-day toolchain traps ([`local-dev.md`](local-dev.md)).

## Steps

1. `nix develop` · `just up` · `just minio-init` · `pnpm install` · `pnpm db:migrate`
2. Solo signup: `BETTER_AUTH_ALLOW_SIGNUP=1` → `/auth/sign-up` → set `0`
3. Open web: `pnpm dev:web`

## Gotchas

See [`auth-setup.md#gotchas`](auth-setup.md#gotchas) and [`local-dev.md#gotchas`](local-dev.md#gotchas).
