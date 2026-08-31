# Onboarding

**What this is:** first-run setup for a solo investigator (env, infra, signup, dev servers).  
**What this is not:** day-to-day toolchain traps ([`local-dev.md`](local-dev.md)).

## Steps

1. **Toolchain:** `nix develop`
2. **Env:** copy `env.example` → `.env`; set `BETTER_AUTH_SECRET`, `WD_MASTER_VAULT_KEY`, and DB/S3 defaults (see [`vault-setup.md`](vault-setup.md) for vault key generation).
3. **Infra:** `just up` · `just minio-init`
4. **Deps + schema:** `pnpm install` · `pnpm db:migrate`
5. **First account:** `BETTER_AUTH_ALLOW_SIGNUP=1` → restart web → `/auth/sign-up` → set `BETTER_AUTH_ALLOW_SIGNUP=0` → restart again ([`auth-setup.md`](auth-setup.md)).
6. **Run:** terminal A: `pnpm dev:web` · terminal B: `pnpm dev:worker`
7. **Smoke:** sign in → create a Case → optional Settings credentials for Caps you will run.

`just bootstrap-hint` prints the signup checklist without running servers.

## After onboarding

| Next            | Doc                                                      |
| --------------- | -------------------------------------------------------- |
| Cap credentials | [`vault-setup.md`](vault-setup.md)                       |
| Auth / API keys | [`auth-setup.md`](auth-setup.md)                         |
| Wipe case data  | [`local-dev.md`](local-dev.md) (`just wipe`)             |
| Product loop    | [`../explanation/product.md`](../explanation/product.md) |

## Gotchas

See [`auth-setup.md#gotchas`](auth-setup.md#gotchas) and [`local-dev.md#gotchas`](local-dev.md#gotchas).
