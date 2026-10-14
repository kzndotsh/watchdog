import { sessionOptions } from "@better-auth-ui/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";

import { authClient } from "@/auth/client";
import { STALE_SESSION } from "@/shared/lib/query-stale";

/**
 * Seed / read the BA UI session query (`authQueryKeys.session`).
 * Server: direct `auth.api.getSession` (no HTTP hop).
 * Client: served from the Query cache for `STALE_SESSION` (60 s, the length of the
 * Better Auth cookie cache), then revalidated on the next navigation, so a navigation
 * costs no auth request while the session is fresh. A signed-out answer (`null`) is never
 * kept: the next call asks again, so signing in right after reaches the app.
 * With `isPreload` (a hover preload warming loaders) the cached session is used whatever its
 * age and nothing is fetched while one exists: a preload never grants access, the click
 * that follows runs the gate again with `preload: false`.
 *
 * Must stay a plain (non-async) function returning `createIsomorphicFn()…()` —
 * wrapping it in `async` breaks Start's server/client split and pulls
 * `@/auth/server` → `@watchdog/env/server` → `node:path` into the browser.
 */
// oxlint-disable-next-line typescript/promise-function-async -- isomorphic fn factory must not be async
export function ensureAppSession(
  queryClient: QueryClient,
  opts?: { isPreload?: boolean }
) {
  return createIsomorphicFn()
    .server(async () => {
      const { ensureSessionServer } =
        await import("@better-auth-ui/core/server");
      const { getRequestHeaders } =
        await import("@tanstack/react-start/server");
      const { auth } = await import("@/auth/server");
      return ensureSessionServer(queryClient, auth, {
        headers: getRequestHeaders(),
      });
    })
    .client(async () => {
      const options = queryOptions(sessionOptions(authClient));
      if (opts?.isPreload) {
        const cached = queryClient.getQueryData(options.queryKey);
        if (cached) return cached;
      }
      return queryClient.query({
        ...options,
        staleTime: (query) => (query.state.data ? STALE_SESSION : 0),
      });
    })();
}
