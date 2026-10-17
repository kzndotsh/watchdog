# Auth setup

**What this is:** first account, Better Auth layers, session cache, CSRF, ServerFn vs route auth.  
**What this is not:** product IA for sign-in screens ([`../explanation/ux.md`](../explanation/ux.md)); API keys for agents ([`agent-cli.md`](agent-cli.md)).

## First admin

No account is seeded; registration is closed by default and stays closed. A command creates the first instance admin:

1. In `.env`, set `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY` (32+ characters, not a placeholder: `openssl rand -base64 32`) and `BETTER_AUTH_URL=http://127.0.0.1:3000`. `just env` writes a `.env` from `env.example` with both generated.
2. With the database migrated (`just up`): `just admin --email you@example.com`. A password is generated and printed once; `--password-stdin` reads one instead (12+ characters), `--name` sets the display name. In a container: [`self-host`](self-host.md#first-admin).
3. Sign in at `/auth/sign-in`, then create your organization on `/onboarding`.

The command refuses (exit 1) when an instance admin already exists or the email has an account. It writes the same rows Better Auth's sign-up does, so the sign-in form accepts it; `packages/auth/src/bootstrap-admin.ts` has the logic and `bootstrap-admin.int.test.ts` pins it. Opening signup (`BETTER_AUTH_ALLOW_SIGNUP=1`) is for installs that want public registration, not for the first account. If it is on, the first account to register still becomes the instance admin.

The instance admin has `auth.user.role` `admin`. On an open-signup install the first account to register gets it; otherwise the first-admin command creates it. Every new account lands on onboarding to create an organization (name + URL slug; the creator is its owner).

- **Flag on:** anyone can sign up and create organizations.
- **Flag off:** sign-up is closed, only the instance admin can create organizations, and everyone else joins by invite (Settings → Organization → **Members**: Copy link; set `SMTP_HOST` + `SMTP_FROM`, optionally `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`, to also send mail. The accept URL is never logged: a log line holds the invitation id and a masked address). Accept is `/auth/accept-invitation/{id}`: the invitee creates an account on that page or signs in.
- **Roles:** org owner and org **admin** can invite as `admin` or `member`; members cannot. Org admin is not instance admin. Only an owner can delete an organization (typed-name confirm; deletes every Case, its evidence, artifacts and export folder first).
- **Instance admins** also see Settings → **Users** (Disable / Enable, Sign out all sessions). Impersonation is not enabled.
- `just wipe` keeps `auth.*`, including `auth_event`.

Surfaces that show who acted use the user's handle (from `auth.user.name`, slugged; else email local-part), not the raw id. CLI/API-key runs store `api-key:<key name>` in `actor_label`; vault and Graph still key off the **user** id. Caps never set actor.

Sign-up, organization and invite actions are rate-limited in production only (`rateLimit.customRules` in `packages/auth/src/create-auth.ts`). The server core (`createAuth`, `createApiContext`, invite signup, instance admin) lives in `packages/auth`; `apps/web/src/auth/` keeps the client, views and routes.

## Auth layers

| Layer | What it does |
| --- | --- |
| **Better Auth** | Cookie session; routes under `/auth/*` (BA UI) |
| **`_protected` layout** | Redirects unauthenticated users; seeds `authQueryKeys.session` via `ensureAppSession` and decides onboarding through `ensureOrganizationState` ([route guard cost](#route-guard-cost)) |
| **`requireAuth` (global)** | All domain `createServerFn` handlers, installed in `src/start.ts`; throws `UnauthorizedError` |
| **`routes/api/*`** | Public HTTP (Better Auth handler, OpenAPI, file export), not ServerFns |
| **API keys** | Settings → API Keys; used by `wd` and OpenAPI clients; each key acts in the organization that was active when it was created |

## Session cookie cache and the revocation window

Better Auth's `session.cookieCache` is on (`packages/auth/src/session-cache.ts`): a signed `better-auth.session_data` cookie lets a request skip the session read for **60 seconds**. Every server function and `/api/v1` call otherwise read the session and user rows before its own query.

| Question | Answer |
| --- | --- |
| How long can a revoked session keep working? | **Up to 60 seconds** on the cached path: sign-out elsewhere, "Sign out all sessions", a disabled user, a deleted user. After that the cookie is rejected and the database decides. Browser sign-out clears the cookie at once. |
| Is it ever extended without a database read? | No. `refreshCache` is `false` (a test pins it); the cache is only re-issued after a database read. |
| What is never cached? | **Organization membership.** `resolveActorOrganizationId` reads the `member` row on every request, so removing someone from an organization takes effect on their next request. The session only names the active organization (`activeOrganizationId`, stamped when the session is created). |
| Which actions read the database anyway? | Every `/admin/*` endpoint (disable, enable, set role, revoke sessions, list users) and the organization endpoints that change membership or the organization (`create`, `update`, `delete`, `leave`, `invite-member`, `cancel-invitation`, `accept-invitation`, `reject-invitation`, `remove-member`, `update-member-role`), through `hooks.before` in `createAuth` (`disableCookieCache`). A demoted instance admin or removed owner cannot act on a cached cookie. |
| What re-issues the cached session? | Better Auth writes `activeOrganizationId` to the session row on organization `create`, `delete`, `leave`, `accept-invitation` and `remove-member` without re-signing the cookie, so `hooks.after` expires the cache cookie after those: the next request reads the row (a just-created organization is the active one at once; without this, onboarding looked unfinished for up to 60 s). `set-active` and `update-user` re-sign it themselves. |
| How big is the cookie? | About 1.2 KB for a user with name, email, role, an image URL and an organization id, against the 4 KB browser limit. A cache that would need more than one cookie (an inline `data:` avatar: the profile editor stores a resized image inline when no upload backend is configured) is dropped by `hooks.after` and expired in the browser: that user's requests read the database, as before the cache. |

Cost per authenticated call, measured by `packages/auth/src/__tests__/session-cookie-cache.int.test.ts`: 3 statements without a cached cookie (session row, user row, membership), 1 with it (membership).

## Route guard cost

The `_protected` guard (`routes/_protected.tsx`) runs on every navigation and hover preload. It no longer makes two serial uncached requests.

| Step | Behavior |
| --- | --- |
| Session (`ensureAppSession`) | Query cache, **60 s** stale time (`STALE_SESSION`, the cookie cache length). A navigation inside the window makes no auth request. A signed-out answer is never kept. |
| Hover preload (`preload` in the route context) | Uses the cached session whatever its age and fetches nothing while one exists. A preload never grants access; the click re-runs the guard with the normal stale time. |
| Organization (`ensureOrganizationState`) | Cached per user until an organization change invalidates it. On the client the session's `activeOrganizationId` answers the first lookup, so a cold navigation is one request (the session). A full page load (SSR) still asks the database. |
| Organization changes | Create, switch, accept an invitation, leave, delete and remove member call `invalidateAfterOrganizationChange` (the first five through `useReloadIntoOrganization`, which then reloads into `/`): the organization state and the session are marked stale. |
| Revocation mid-visit | Noticed on the first navigation after the 60 s stale time (`beforeLoad` redirects to sign-in with `redirectTo`), and at once when any server function or mutation answers `Unauthorized`: `createAppQueryClient` revalidates the session and `useAuthenticate` redirects. Worst case from revocation to redirect is the cookie cache (60 s) plus the client stale time (60 s) for an idle tab that makes no server call. |

A member removed from their active organization keeps the app shell until the next reload (or organization change): every server function reads membership, so they get no data. A reload corrects it.

Optional: `BETTER_AUTH_TRUSTED_ORIGINS` for extra origins (comma-separated).

## Gotchas

- **Session cache:** `_protected` seeds BA UI's `authQueryKeys.session` via `ensureAppSession` (`createIsomorphicFn`). Use `useSession(authClient)` from `@better-auth-ui/react`, not `authClient.useSession()`. The post-sign-in return param is **`redirectTo`** (BA UI), not `redirect`. Sign out via `/auth/sign-out` (clears the cookie and the whole query cache, so the next account on the tab never sees this one's data); raw `authClient.signOut()` leaves a stale cache and bounces you back in.
- **Versions:** `better-auth`, `@better-auth/core`, `@better-auth/api-key` and `@better-auth/drizzle-adapter` move together, and the forked `@better-auth-ui/{core,react}` are pinned exact (no caret); the `pnpm-workspace.yaml` catalog pins `better-auth` and `@better-auth/api-key` once for every package, and `better-auth` pulls its matching `@better-auth/core`. API keys are user-owned and carry the active organization in `metadata.organizationId`; do not enable organization-owned keys (`referenceId`) until `createApiContext` maps `referenceId` without stamping an org id onto `actor.userId`. Password sign-in matches `auth.account.issuer` (`local:credential`); pre-1.7 rows need that column (migration `0011`; `pnpm db:migrate`).
- **ServerFn auth is not route auth:** `_protected` redirects for UX; domain ServerFns are gated by the global `requireAuth` in `src/start.ts`. Do not add `.middleware([requireAuth])` on `*.functions.ts` (guidance; no lint). There is no public ServerFn; use `routes/api/*`. Detect denials with `isUnauthorizedError`, not `message === "Unauthorized"`.
- **CSRF on ServerFns:** the custom `start.ts` disables Start's auto CSRF; keep CSRF **after** evlog in `requestMiddleware` ([`../reference/platform/jobs-orpc.md`](../reference/platform/jobs-orpc.md#process-logging-evlog)). CSRF 403s on `/_serverFn` log `auth.reason: "csrf"`.

See also: [`troubleshooting.md`](troubleshooting.md).
