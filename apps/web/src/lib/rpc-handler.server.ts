import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";

import { createApiContext } from "@/auth/api-context.server";
import { RPC_PREFIX } from "@/lib/rpc-prefix";
import { responsePlugins, router } from "@watchdog/server/api";

/**
 * The router over oRPC's RPC protocol, for this app's browser only (no CORS: another origin
 * gets no answer it can read). The same context as `/api/v1` (session or API key, through
 * `createApiContext`) and the same response plugins, so a refused Job start still sends
 * `Retry-After`; errors are mapped inside the router, as for `/api/v1`.
 *
 * CSRF: every call must carry the header `SimpleCsrfProtectionLinkPlugin` sets, which a
 * cross-site form or simple request cannot send; the session cookie is `SameSite=Lax` besides.
 * The default `StrictGetMethodPlugin` stays on, so only procedures declared `GET` answer a GET.
 */
const rpcHandler = new RPCHandler(router, {
  plugins: [...responsePlugins(), new SimpleCsrfProtectionHandlerPlugin()],
});

/** `/api/rpc/*`: the browser's oRPC calls. */
export async function handleRpcRequest(request: Request): Promise<Response> {
  const { matched, response } = await rpcHandler.handle(request, {
    prefix: RPC_PREFIX,
    context: await createApiContext(request),
  });
  return matched ? response : new Response("Not Found", { status: 404 });
}
