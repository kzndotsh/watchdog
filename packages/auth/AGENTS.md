# Auth package (`@watchdog/auth`)

> Scope: `packages/auth` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

The server side of identity: the Better Auth instance, invite-only signup, instance admin, API keys, and "who is calling" (`createApiContext`). No React, UI, or framework code: apps add their own cookie plugin and views (client, `auth/ui`, TanStack wiring live in `apps/web/src/auth/`). Dependency boundaries (no `@tanstack/*`, api, core, caps, apps) are held by `package.json`.

## Commands

| Task       | Command                                  |
| ---------- | ---------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/auth typecheck` |
| Unit tests | `pnpm test:unit`                         |

## Entry points

| Import | Use |
| --- | --- |
| `@watchdog/auth/server` | `createAuth`, `createApiContext`, `actorFromSession`, `resolveActorOrganizationId`. Touches db + env: server only. |
| `@watchdog/auth/instance-admin` · `org-roles` (invite role options only; `canManageTeam` is in `@watchdog/schemas/shared`) · `invitation-url` | Pure helpers and access-control roles; safe in the browser bundle. |

## First admin

`src/bootstrap-admin-cli.ts` is the first-admin command (`just admin`, `pnpm admin:bootstrap`; bundled by `scripts/build-bootstrap.mjs` to `bootstrap-admin.mjs` in the web image). `bootstrapFirstAdmin` (`src/bootstrap-admin.ts`) inserts the admin and its credential through `@watchdog/db` repo functions in one transaction behind an advisory lock, and refuses when an instance admin exists. Walkthrough: [`auth-setup`](../../docs/how-to/auth-setup.md#first-admin).

## Rules

- Never log an invitation accept URL: `sendInvitationEmail` logs the invitation id, the organization id and a masked email, and puts the URL only in the mail. Tested by `send-invitation-email.test.ts`.
- Pass framework plugins (`tanstackStartCookies()`) through `createAuth({ trailingPlugins })`; they must be last.
- Gate org creation on `BETTER_AUTH_ALLOW_SIGNUP` or instance admin, and keep the signup / org-create / role-change `rateLimit.customRules` (production only). Guidance.
- Read env inside `createAuth()`, never at import time in the pure entry points (they ship to the browser). Guidance.
- The session cookie cache is 60 s with `refreshCache: false` (`src/session-cache.ts`): never raise it or enable refresh without updating the revocation window in [`auth-setup`](../../docs/how-to/auth-setup.md#session-cookie-cache-and-the-revocation-window). Endpoints that change roles, bans or membership read the database (`hooks.before`); add a new one to `needsAuthoritativeSession`. Membership is never cached. Tested by `session-cookie-cache.int.test.ts`.
- Trusted origins are one list: `configuredTrustedOrigins()` (`BETTER_AUTH_URL` plus `BETTER_AUTH_TRUSTED_ORIGINS`, built by the pure `expandTrustedOrigins`) feeds Better Auth's `trustedOrigins` and the web app's CORS allowlist; do not keep a second list.
- `resolveActorOrganizationId` (`src/actor.ts`) is the one place an `OrganizationId` is minted for an actor: it parses the preferred (session or API-key) id and reads the resolved id from a typed db column. `actorFromSession` takes the branded value; do not cast one.
- `ApiActor` / `ApiCaller` come from `@watchdog/schemas`; `createApiContext` returns `ApiCaller & { log? }`, the same shape as the API's `ApiContext`: an actor always comes with its `credential` (`{ kind: "session" }` or `{ kind: "apiKey", keyId, scopes }`; the scopes are parsed once from the key's `permissions` by `parseKeyScopes`, a key without any holds `cases:read`, and unreadable ones deny the key). A key whose owner is banned (`isUserBanned`, which honours `banExpires`) or who left a scoped key's organization yields no actor. Never detect a key actor from the `api-key:<name>` label.

See also: [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) · [`agent-ingress`](../../docs/reference/contracts/agent-ingress.md) (API keys) · [`packages.md`](../../docs/reference/platform/packages.md).
