import { createFileRoute } from "@tanstack/react-router";

import { handleRpcRequest } from "@/lib/rpc-handler.server";

/** `/api/rpc/*`: the browser's oRPC calls (RPC protocol, CSRF header required). */
export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      ANY: async ({ request }: { request: Request }) =>
        handleRpcRequest(request),
    },
  },
});
