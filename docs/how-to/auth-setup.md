# Auth setup

**What this is:** Better Auth layers, session cache, API keys, CSRF, ServerFn vs route auth.  
**What this is not:** product IA for sign-in screens ([`../explanation/ux.md`](../explanation/ux.md)).

## Bootstrap (solo install)

No account is seeded; registration is closed by default.

1. In `.env`, set `BETTER_AUTH_SECRET` (≥32 chars: `openssl rand -base64 32`) and `BETTER_AUTH_URL=http://127.0.0.1:3000`.
2. Set `BETTER_AUTH_ALLOW_SIGNUP=1`, restart `pnpm dev:web`.
3. Register at `/auth/sign-up` (or run `just bootstrap-hint` for the checklist).
4. Set `BETTER_AUTH_ALLOW_SIGNUP=0`, restart web again.

The first account becomes the instance admin (`auth.user.role` `admin`). Every new account then lands on onboarding to create an organization (name and URL slug; the creator is its owner). With the flag on, anyone can sign up and create organizations; with it off, sign-up is closed, only the instance admin can create organizations, and everyone else joins by invite from Settings → Organization → **Members**. The sign-in page hides the sign-up link when the flag is off. Users in several organizations switch from the sidebar footer; switching reloads the app in the new organization. Only an organization's owner can delete it (Settings → Organization → General → Delete, confirmed by typing the name): every Case, its evidence and artifacts, and its export folder are deleted first, then members and invitations. It cannot be undone.

Owner and organization **admin** can invite with role `admin` or `member`. Members cannot invite. Accept is `/auth/accept-invitation/{id}`: the invitee creates an account on that page (public `/auth/sign-up` stays closed) or signs in if the email already has an account. Invitation URLs are written to process logs; set `SMTP_HOST` + `SMTP_FROM` (optional `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`) to also send mail. The Organization tab always has **Copy link**.

Instance admins also see Settings → **Users**: Disable / Enable (Better Auth `banUser` / `unbanUser`; UI never says “ban”), and **Sign out all sessions**. Impersonation is not enabled. A disabled account that tries to sign in sees **This account is disabled.** Organization **admin** is not instance admin. `just wipe` keeps `auth.*` including `auth_event` (session create + IP/UA).

Job, Evidence, Triage, Graph-write, and Dashboard Activity surfaces show **who acted** as `By` plus an AtSign glyph + handle from `auth.user.name` (slug; else email local-part), not the raw user id or a masked email. CLI/API-key runs store a snapshot `api-key:<key name>` on the row (`actor_label`); vault and Graph still key off the **user** id. Caps never set actor.

A signed-in user with pending invitations can accept or decline them under Settings → **Organizations**, which also lists, switches, and creates organizations. Delete lives under Settings → Organization → **General**.

**Rate limits** (production only, per IP, in memory): sign-up 10/hour, organization create/delete 5/hour each, invite 20/min, role change 10/min, member remove 20/min (`rateLimit.customRules` in `packages/auth/src/create-auth.ts`). The server core (`createAuth`, `createApiContext`, invite signup, instance admin) lives in `packages/auth`; `apps/web/src/auth/` keeps the client, views, and routes.

First-run toolchain order: [`onboarding.md`](onboarding.md).

## Auth layers

| Layer | What it does |
| --- | --- |
| **Better Auth** | Cookie session; routes under `/auth/*` (BA UI) |
| **`_protected` layout** | Redirects unauthenticated users; seeds `authQueryKeys.session` via `ensureAppSession` |
| **`requireAuth` (global)** | All domain `createServerFn` handlers in `src/start.ts`; throws `UnauthorizedError` |
| **`routes/api/*`** | Public HTTP (Better Auth handler, OpenAPI, file export) — not ServerFns |
| **API keys** | Settings → API Keys; used by `wd` and OpenAPI clients (`WD_API_KEY`); each key acts in the organization that was active when it was created |

Optional: `BETTER_AUTH_TRUSTED_ORIGINS` for extra origins (comma-separated).

## API keys for CLI

1. Settings → **API Keys** → create a key.
2. In `.env` (or shell): `WD_API_URL=http://localhost:3000/api/v1`, `WD_API_KEY=<key>`.
3. `wd --help` works without a key; authenticated verbs need both vars (`loadCliEnv()` in `@watchdog/cli`).

## See also

- Full CLI surface: [`agent-cli.md`](agent-cli.md)
- Troubleshooting: [`troubleshooting.md`](troubleshooting.md)

## Gotchas

- **Auth session cache**: `_protected` seeds BA UI's `authQueryKeys.session` via `ensureAppSession` (`createIsomorphicFn`). Use `useSession(authClient)` from `@better-auth-ui/react` in UI: not `authClient.useSession()`. Post-sign-in return URL search param is **`redirectTo`** (BA UI), not `redirect`. Sign out via `/auth/sign-out` (BA UI clears cookie **and** removes auth queries); raw `authClient.signOut()` leaves a stale session cache and bounces you back in.
- **Better Auth versions**: runtime `better-auth` / `@better-auth/core` / `@better-auth/api-key` / `@better-auth/drizzle-adapter` are **1.7.5**. Forked `@better-auth-ui/{core,react}` are **1.7.23** (exact, no caret). Workspace `overrides` pin `better-auth` and `@better-auth/core` so the catalog cannot keep a 1.6 core. API keys are user-owned and carry the active organization in `metadata.organizationId`; do not enable organization-owned keys (`referenceId`) until `createApiContext` maps `referenceId` without stamping an org id onto `actor.userId`. Password sign-in matches `auth.account.issuer` (`local:credential`); pre-1.7 rows need that column (migration `0011`).
- **ServerFn auth ≠ route auth**: `_protected` redirects for UX; domain ServerFns are gated by global `requireAuth` in `src/start.ts` (`UnauthorizedError`). Do not re-add `.middleware([requireAuth])` on `*.functions.ts`. No public ServerFn: use `routes/api/*`. Detect denials with `isUnauthorizedError`, not `message === "Unauthorized"`.
- **CSRF on ServerFns**: custom `start.ts` disables Start's auto CSRF; keep CSRF **after** evlog in `requestMiddleware`. CSRF 403s on `/_serverFn` log `auth.reason: "csrf"` (request logger otherwise skips ServerFns).
