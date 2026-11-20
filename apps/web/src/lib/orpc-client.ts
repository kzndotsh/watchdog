import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";

import { RPC_PREFIX } from "@/lib/rpc-prefix";
import type { AppRouter } from "@watchdog/api";

/**
 * The app's oRPC client, one per process (oRPC's TanStack Start pattern):
 *
 * - Server (SSR, loaders): the router in process, with the caller resolved from the request
 *   being served (`orpc-in-process.server.ts`, imported lazily so the router and its server
 *   dependencies stay off the browser's import graph).
 * - Browser: `RPCLink` to `/api/rpc` with the session cookie and the CSRF header the handler
 *   requires (`SimpleCsrfProtectionLinkPlugin`).
 *
 * Must stay a plain `createIsomorphicFn()…()` call: Start's compiler drops the `.server()` body
 * from the browser bundle.
 */
const getOrpcClient = createIsomorphicFn()
  .server((): RouterClient<AppRouter> =>
    createORPCClient({
      call: async (path, input, options) => {
        const { inProcessLink } = await import("@/lib/orpc-in-process.server");
        return inProcessLink.call(path, input, options);
      },
    })
  )
  .client((): RouterClient<AppRouter> =>
    createORPCClient(
      new RPCLink({
        url: `${window.location.origin}${RPC_PREFIX}`,
        plugins: [new SimpleCsrfProtectionLinkPlugin()],
        fetch: async (request, init) =>
          fetch(request, { ...init, credentials: "include" }),
      })
    )
  );

const orpcClient: RouterClient<AppRouter> = getOrpcClient();

/**
 * TanStack Query utils over every procedure: `orpc.claims.list.call`, `.key`, `.infiniteKey`.
 * Keys are `[path, { input, type }]`, so `orpc.claims.key({ input: { caseId } })` is every
 * Claims query of a Case (a Case-scoped procedure takes `caseId` at the top level of its input).
 */
export const orpc = createTanstackQueryUtils(orpcClient);
