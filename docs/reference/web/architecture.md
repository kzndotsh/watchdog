# Architecture: `@watchdog/web`

The server boundary, auth layering, and oRPC wiring of the TanStack Start app. Versions and plugins are in `apps/web/package.json` and `vite.config.ts`; the package import graph, Caps, and Collect/Triage/Export are in [`../platform/README.md`](../platform/README.md). Start and Router docs: <https://tanstack.com/llms.txt>.

## Shape

- Stack: TanStack Start (React) with file-based TanStack Router (`src/routes`), Vite, Tailwind v4, and TanStack Query wired into the router through `@tanstack/react-router-ssr-query` (QueryClient in router context; see [`data.md`](data.md)).
- Import alias: hand-written files use `@/*` for `./src/*`. Prefer `@/domains/...` over relative hops. `guidance`: nothing enforces it and relative imports exist today.
- Chrome: `shared/layout/app-shell.tsx` wraps the shadcn `SidebarProvider` + `SidebarInset`; nav is `shared/layout/app-sidebar.tsx`; page chrome sits beside `page.tsx`. Search chrome lives in `domains/search` (`SearchChrome` mounted from `AppShell`).
- Active Case id is an httpOnly cookie (`watchdog.active-case-id`); Case rows are Postgres.
- Domain layout and the folder-shape contract: [`domains.md`](domains.md).

## Auth layers

Server core is [`@watchdog/auth`](../../../packages/auth/AGENTS.md) (`createAuth`: Better Auth + Drizzle adapter, invite signup, instance admin); web appends `tanstackStartCookies()` in `src/auth/server.ts`. The client and Better Auth UI views are in `src/auth/`. API keys use `@better-auth/api-key`, sent as `Authorization: Bearer <key>` or `x-api-key`. Solo signup is gated by `BETTER_AUTH_ALLOW_SIGNUP`.

| Layer | Job |
| --- | --- |
| `_protected` routes / Better Auth UI | UX redirect only |
| Start `requireAuth` (global `functionMiddleware`) | ServerFn data gate; throws `UnauthorizedError` |
| `/api/auth/$` | Cookies and sessions |
| `createCsrfMiddleware({ filter: serverFn })` | CSRF, after evlog in `src/start.ts` `requestMiddleware` |

## Server boundary

- `*.functions.ts` is the RPC surface (`createServerFn`, safe to import from UI). Auth is global: `functionMiddleware: [evlogFunctionMiddleware, requireAuth]` in `src/start.ts`. Don't add per-function `.middleware([requireAuth])`; public endpoints go in `routes/api/*`.
- Handlers are thin: `orpcFromContext(context)` (in `src/lib/orpc.server.ts`, wraps `orpcForActor(actorFromSession(...))`) to `@watchdog/api` to `@watchdog/core` to `@watchdog/db` repos. No Drizzle in `apps/web`; the only exceptions are the Better Auth adapter and the SSE route `/api/events`, which checks Case access through `@watchdog/core`. The no-db rule is enforced by oxlint ([`rules.md`](ui/rules.md)); the handler pattern is `guidance`.
- Use `createServerFn` for server-only work; never use `*.client.ts` for server functions. DTOs and Zod are in `types.ts` ([`../platform/types.md`](../platform/types.md)).
- Process logs use the request and function middleware in `src/start.ts` (`@watchdog/log`): [`jobs-orpc.md`](../platform/jobs-orpc.md#process-logging-evlog).

## oRPC wiring

- Web UI: ServerFns call an in-process `createRouterClient`; there is no browser HTTP oRPC mount. The client injects the ALS `log` from Start middleware.
- OpenAPI: `src/routes/api/v1.ts` + `v1.$.ts` mount an `OpenAPIHandler` at `/api/v1` (Bearer, `x-api-key`, or session); spec at `/api/v1/spec.json`.
- Auth context: Better Auth session to `ApiActor` (`@watchdog/auth` `createApiContext`, bound to the app's `auth` in `src/auth/api-context.server.ts`).
- Case Export zip/md are authenticated file routes (API key OK), not oRPC.
- `src/lib/` holds this wiring plus `utils` only, not domain cookie or SSE helpers.

## Gotchas

- **Router loaders:** a child `loader({ context })` receives `beforeLoad` context (`{ session, user }` + `queryClient`), not parent loader return data. Each page loader must `ensureQueryData` what it needs; siblings share data via Query keys.
- **ServerFn imports:** statically import `*.server` from `*.functions` handlers (the TanStack pattern). Avoid `await import("./x.server")` unless a cycle forces it; never dynamically import the `.functions` module itself.
