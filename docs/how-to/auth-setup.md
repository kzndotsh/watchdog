# Auth setup

**What this is:** Better Auth layers, session cache, API keys, CSRF, ServerFn vs route auth.  
**What this is not:** product IA for sign-in screens ([`../explanation/ux.md`](../explanation/ux.md)).

## Bootstrap (solo install)

No account is seeded; registration is closed by default.

1. In `.env`, set `BETTER_AUTH_SECRET` (≥32 chars: `openssl rand -base64 32`) and `BETTER_AUTH_URL=http://127.0.0.1:3000`.
2. Set `BETTER_AUTH_ALLOW_SIGNUP=1`, restart `pnpm dev:web`.
3. Register at `/auth/sign-up` (or run `just bootstrap-hint` for the checklist).
4. Set `BETTER_AUTH_ALLOW_SIGNUP=0`, restart web again.

First-run toolchain order: [`onboarding.md`](onboarding.md).

## Auth layers

| Layer | What it does |
| --- | --- |
| **Better Auth** | Cookie session; routes under `/auth/*` (BA UI) |
| **`_protected` layout** | Redirects unauthenticated users; seeds `authQueryKeys.session` via `ensureAppSession` |
| **`requireAuth` (global)** | All domain `createServerFn` handlers in `src/start.ts`; throws `UnauthorizedError` |
| **`routes/api/*`** | Public HTTP (Better Auth handler, OpenAPI, file export) — not ServerFns |
| **API keys** | Settings → API Keys; used by `wd` and OpenAPI clients (`WD_API_KEY`) |

Optional: `BETTER_AUTH_TRUSTED_ORIGINS` for extra origins (comma-separated).

## API keys for CLI

1. Settings → **API Keys** → create a key.
2. In `.env` (or shell): `WD_API_URL=http://localhost:3000/api/v1`, `WD_API_KEY=<key>`.
3. `wd --help` works without a key; authenticated verbs need both vars (`@watchdog/env/cli`).

## Gotchas

- **Auth session cache**: `_protected` seeds BA UI's `authQueryKeys.session` via `ensureAppSession` (`createIsomorphicFn`). Use `useSession(authClient)` from `@better-auth-ui/react` in UI: not `authClient.useSession()`. Post-sign-in return URL search param is **`redirectTo`** (BA UI), not `redirect`. Sign out via `/auth/sign-out` (BA UI clears cookie **and** removes auth queries); raw `authClient.signOut()` leaves a stale session cache and bounces you back in.
- **ServerFn auth ≠ route auth**: `_protected` redirects for UX; domain ServerFns are gated by global `requireAuth` in `src/start.ts` (`UnauthorizedError`). Do not re-add `.middleware([requireAuth])` on `*.functions.ts`. No public ServerFn: use `routes/api/*`. Detect denials with `isUnauthorizedError`, not `message === "Unauthorized"`.
- **CSRF on ServerFns**: custom `start.ts` disables Start's auto CSRF; keep CSRF **after** evlog in `requestMiddleware`. CSRF 403s on `/_serverFn` log `auth.reason: "csrf"` (request logger otherwise skips ServerFns).
