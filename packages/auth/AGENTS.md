# Auth package (`@watchdog/auth`)

> Scope: `packages/auth` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

The server side of identity: the Better Auth instance, invite-only signup, instance admin, API keys, and "who is calling" (`createApiContext`). No React, no UI, no framework: apps add their own cookie plugin and their own views. The client, `auth/ui` views and TanStack wiring stay in `apps/web/src/auth/`.

## Commands

| Task       | Command                                  |
| ---------- | ---------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/auth typecheck` |
| Unit tests | `pnpm test:unit`                         |

## Entry points

| Import | Use |
| --- | --- |
| `@watchdog/auth/server` | `createAuth`, `createApiContext`, `actorFromSession`, `resolveActorOrganizationId`. Touches db + env: server only. |
| `@watchdog/auth/instance-admin` · `org-roles` · `invitation-url` | Pure helpers and access-control roles; safe in the browser bundle (the auth client and the team/users views use them). |

## Do / Don't

| Do | Don't |
| --- | --- |
| Pass framework plugins (`tanstackStartCookies()`) through `createAuth({ trailingPlugins })`: they must be last | Import `@tanstack/*` or `better-auth/tanstack-start` here |
| Keep one org, invite-only signup (`allowUserToCreateOrganization: false`, `inviteSignupPlugin`) | Add self-serve org creation without changing the product model |
| Read env inside `createAuth()`, not at import time in pure modules | Import `@watchdog/env/server` from the pure entry points (they ship to the browser) |
| Depend on `@watchdog/api` for **types only** (`ApiActor`, `ApiContext`) | Depend on core, caps, or apps |

## See also

| Need | File |
| --- | --- |
| Web wiring (client, views, routes) | [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) |
| Package import matrix | [`docs/reference/platform/packages.md`](../../docs/reference/platform/packages.md) |
| Agent ingress / API keys | [`docs/reference/contracts/agent-ingress.md`](../../docs/reference/contracts/agent-ingress.md) |
