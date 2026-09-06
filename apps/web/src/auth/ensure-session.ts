import { sessionOptions } from "@better-auth-ui/react";
import type { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";

import { authClient } from "@/auth/client";

/**
 * Seed / read the BA UI session query (`authQueryKeys.session`).
 * Server: direct `auth.api.getSession` (no HTTP hop).
 * Client: always revalidate (`staleTime: 0`) so sign-out / cookie changes
 * are not masked by the app's default Query staleTime.
 *
 * Must stay a plain (non-async) function returning `createIsomorphicFn()…()` —
 * wrapping it in `async` breaks Start's server/client split and pulls
 * `@/auth/server` → `@watchdog/env/server` → `node:path` into the browser.
 */
// oxlint-disable-next-line typescript/promise-function-async -- isomorphic fn factory must not be async
export function ensureAppSession(queryClient: QueryClient) {
  return createIsomorphicFn()
    .server(async () => {
      const { ensureSession: ensureSessionServer } =
        await import("@better-auth-ui/react/server");
      const { getRequestHeaders } =
        await import("@tanstack/react-start/server");
      const { auth } = await import("@/auth/server");
      return ensureSessionServer(queryClient, auth, {
        headers: getRequestHeaders(),
      });
    })
    .client(async () =>
      queryClient.query({
        ...sessionOptions(authClient),
        staleTime: 0,
      })
    )();
}
