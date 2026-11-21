import { sessionOptions } from "@better-auth-ui/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { STALE_SESSION } from "@/shared/lib/query-stale";

/**
 * Seed / read the BA UI session query (`authQueryKeys.session`), in the browser only (SSR is off).
 * Served from the Query cache for `STALE_SESSION` (60 s, the length of the
 * Better Auth cookie cache), then revalidated on the next navigation, so a navigation
 * costs no auth request while the session is fresh. A signed-out answer (`null`) is never
 * kept: the next call asks again, so signing in right after reaches the app.
 * With `isPreload` (a hover preload warming loaders) the cached session is used whatever its
 * age and nothing is fetched while one exists: a preload never grants access, the click
 * that follows runs the gate again with `preload: false`.
 */
export async function ensureAppSession(
  queryClient: QueryClient,
  opts?: { isPreload?: boolean }
) {
  const options = queryOptions(sessionOptions(authClient));
  if (opts?.isPreload) {
    const cached = queryClient.getQueryData(options.queryKey);
    if (cached) return cached;
  }
  return queryClient.query({
    ...options,
    staleTime: (query) => (query.state.data ? STALE_SESSION : 0),
  });
}
