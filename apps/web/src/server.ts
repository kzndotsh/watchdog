/**
 * Server entry: the stock TanStack Start handler behind the request body limit
 * (`lib/body-limit.server.ts`). An oversized body is answered 413 here, before routing,
 * so it never reaches a route, a server function or Better Auth; the refusal still
 * carries the security headers (and CORS for `/api/v1`) and is logged.
 *
 * `BODY_LIMIT_BYTES` (the same number) is exported for `scripts/serve.mjs`, which passes it to
 * srvx (`maxRequestBodySize`) as a second line of defence in the container.
 */
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import { enforceBodyLimit } from "@/lib/body-limit.server";
import { createLogger } from "@watchdog/log";
import { REQUEST_BODY_MAX_BYTES } from "@watchdog/schemas/shared";

/**
 * Read by `scripts/serve.mjs` from the build output, which knip does not follow.
 * @public
 */
export const BODY_LIMIT_BYTES = REQUEST_BODY_MAX_BYTES;

/** Headers (and CORS for the API) a 413 from the entry would otherwise miss. */
async function decorate(
  request: Request,
  response: Response
): Promise<Response> {
  const [
    { applySecurityHeaders, createCspNonce, resolveSecurityHeadersConfig },
    cors,
  ] = await Promise.all([
    import("@/lib/security-headers.server"),
    import("@/lib/api-cors.server"),
  ]);
  const withSecurity = await applySecurityHeaders(response, {
    request,
    nonce: createCspNonce(),
    config: await resolveSecurityHeadersConfig(),
  });
  return new URL(request.url).pathname.startsWith("/api/v1")
    ? cors.applyWatchdogCors(request, withSecurity)
    : withSecurity;
}

function logRefusal(request: Request): void {
  const log = createLogger({ scope: "http.body_limit" });
  log.setLevel("warn");
  log.set({
    method: request.method,
    path: new URL(request.url).pathname,
    status: 413,
    maxBytes: REQUEST_BODY_MAX_BYTES,
  });
  void log.emit();
}

export default createServerEntry({
  async fetch(request, options) {
    const bounded = await enforceBodyLimit(request);
    if (bounded instanceof Response) {
      logRefusal(request);
      return decorate(request, bounded);
    }
    return handler.fetch(bounded, options);
  },
});
