import type { ClientContext, ClientLink } from "@orpc/client";
import { createRouterClient } from "@orpc/server";
import "@tanstack/react-start/server-only";
import { getRequest } from "@tanstack/react-start/server";

import { createApiContext } from "@/auth/api-context.server";
import { router } from "@watchdog/api";

/**
 * The router called in process, for the oRPC client's server side (`lib/orpc-client.ts`):
 * no HTTP hop during SSR or a loader. Each call resolves the caller from the request being
 * served, through the same `createApiContext` as `/api/rpc` and `/api/v1`.
 */
const routerClient = createRouterClient(router, {
  context: async () => createApiContext(getRequest()),
});

/** Calls the procedure at `path` (`["claims", "list"]`) on the in-process router client. */
export const inProcessLink: ClientLink<ClientContext> = {
  call: async (path, input, { signal }) => {
    let procedure: unknown = routerClient;
    for (const key of path) {
      procedure =
        (typeof procedure === "object" || typeof procedure === "function") &&
        procedure !== null
          ? Reflect.get(procedure, key)
          : undefined;
    }
    if (typeof procedure !== "function") {
      throw new TypeError(`No procedure at ${path.join(".")}`);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a router client leaf is a procedure client
    const call = procedure as (
      input: unknown,
      options: { signal?: AbortSignal }
    ) => Promise<unknown>;
    return call(input, { signal });
  },
};
