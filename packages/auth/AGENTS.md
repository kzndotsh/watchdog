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
| `@watchdog/auth/instance-admin` · `org-roles` · `invitation-url` | Pure helpers and access-control roles; safe in the browser bundle. |

## Rules

- Pass framework plugins (`tanstackStartCookies()`) through `createAuth({ trailingPlugins })`; they must be last.
- Gate org creation on `BETTER_AUTH_ALLOW_SIGNUP` or instance admin, and keep the signup / org-create / role-change `rateLimit.customRules` (production only). Guidance.
- Read env inside `createAuth()`, never at import time in the pure entry points (they ship to the browser). Guidance.
- `ApiActor` / `ApiCaller` come from `@watchdog/schemas`; `createApiContext` returns `ApiCaller & { log? }`, the same shape as the API's `ApiContext`.

See also: [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) · [`agent-ingress`](../../docs/reference/contracts/agent-ingress.md) (API keys) · [`packages.md`](../../docs/reference/platform/packages.md).
