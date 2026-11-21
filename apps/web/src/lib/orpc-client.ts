import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SimpleCsrfProtectionLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { RPC_PREFIX } from "@/lib/rpc-prefix";
import type { AppRouter } from "@watchdog/server/api";

/**
 * The app's oRPC client, one per tab: `RPCLink` to `/api/rpc` with the session cookie and the
 * CSRF header the handler requires (`SimpleCsrfProtectionLinkPlugin`). SSR is off (`start.ts`),
 * so only the browser calls it. The URL is read per call: the server still imports this module
 * through the route tree when it renders the document shell, where there is no `window`.
 */
const orpcClient: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({
    url: () => `${window.location.origin}${RPC_PREFIX}`,
    plugins: [new SimpleCsrfProtectionLinkPlugin()],
    fetch: async (request, init) =>
      fetch(request, { ...init, credentials: "include" }),
  })
);

/**
 * TanStack Query utils over every procedure: `orpc.claims.list.call`, `.key`, `.infiniteKey`.
 * Keys are `[path, { input, type }]`, so `orpc.claims.key({ input: { caseId } })` is every
 * Claims query of a Case (a Case-scoped procedure takes `caseId` at the top level of its input).
 *
 * @canonical `orpc`: The web app's API calls, browser and server (there are no server functions): oRPC TanStack Query utils, `orpc.<path>.call` / `.key` / `.infiniteKey`; a Case's keys are `orpc.<domain>.key({ input: { caseId } })`
 */
export const orpc = createTanstackQueryUtils(orpcClient);
