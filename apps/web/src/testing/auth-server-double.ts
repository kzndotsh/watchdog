/**
 * Stand-in for `@/auth/server` in web tests. The real module builds Better Auth with
 * server-only imports, so any test whose import graph reaches it needs a replacement;
 * `mock-auth-server.setup.ts` registers this one for every web test.
 *
 * A test that exercises `auth` itself (the `/api/auth/*` route) overrides it with its own
 * `vi.mock("@/auth/server", ...)` and the `handler` it needs.
 */
export const authServerDouble = () => ({ auth: {}, authDb: {} });
