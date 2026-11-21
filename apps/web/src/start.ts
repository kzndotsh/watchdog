/**
 * TanStack Start: SSR is off for every route (`defaultSsr: false`), so the server renders only the
 * document shell and the client renders the page; Start stays the server for the API, auth and
 * live-update routes. Request middleware: security headers + evlog. The app has no server functions:
 * the browser calls the API over `/api/rpc` (CSRF header required there, `lib/rpc-handler.server.ts`)
 * and every other server path is a route that authenticates itself.
 * Dynamic-import drain init inside `.server()` only — never top-level `evlog/fs`
 * (Start keeps bare side-effect imports after stripping `.server()` bodies).
 */

import { createMiddleware, createStart } from "@tanstack/react-start";

import { EDGE_LOGGED_API } from "@/lib/request-log-paths";

/** nginx convention: client closed the connection before the response. */
const CLIENT_CLOSED_REQUEST = 499;

/**
 * Resolve the `Server-Timing` gate once per request: dev and test only, never
 * production (validated `NODE_ENV` from `@watchdog/server/env`, not raw `process.env`).
 */
async function serverTimingEnabled(): Promise<boolean> {
  const [{ env }, { shouldEmitServerTiming }] = await Promise.all([
    import("@watchdog/server/env/server"),
    import("@watchdog/server/log"),
  ]);
  return shouldEmitServerTiming(env.NODE_ENV);
}

/**
 * Security headers on every response. Mints the per-request CSP nonce and hands it
 * to the router through the request context (`lib/csp-nonce.ts`); the policy itself
 * lives in `lib/security-headers.server.ts`.
 */
const securityHeadersMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const {
      applySecurityHeaders,
      createCspNonce,
      resolveSecurityHeadersConfig,
    } = await import("./lib/security-headers.server");
    const nonce = createCspNonce();
    const config = await resolveSecurityHeadersConfig();
    // Alias avoids node/callback-return on the identifier `next`.
    const proceed = next;
    const result = await proceed({ context: { cspNonce: nonce } });
    return {
      ...result,
      response: await applySecurityHeaders(result.response, {
        request,
        nonce,
        config,
      }),
    };
  }
);

const evlogRequestMiddleware = createMiddleware().server(
  async ({ next, request, pathname }) => {
    await import("./evlog-init.server");
    const { createMiddlewareLogger, extractSafeHeaders } =
      await import("evlog/toolkit");
    const {
      runWithRequestLogger,
      serverTimingHeader,
      startRequestTiming,
      withServerTiming,
    } = await import("@watchdog/server/log");

    const headers = extractSafeHeaders(request.headers);
    const { logger, finish, finishResponse, skipped } = createMiddlewareLogger({
      method: request.method,
      path: pathname,
      headers,
      include: ["/api/**"],
      exclude: [...EDGE_LOGGED_API],
    });

    // Alias avoids node/callback-return on the identifier `next`.
    const proceed = next;

    if (skipped) return proceed();

    const emitTiming = await serverTimingEnabled();
    return runWithRequestLogger(logger, async () => {
      const snapshot = startRequestTiming(logger);
      try {
        const result = await proceed();
        const timing = snapshot();
        logger.set(timing);
        const wrapped = await finishResponse(result.response, {
          status: result.response.status,
        });
        return {
          ...result,
          response: emitTiming
            ? withServerTiming(wrapped, serverTimingHeader(timing))
            : wrapped,
        };
      } catch (error: unknown) {
        // Client went away mid-request (SSE reconnect, tab close, navigation).
        // Node surfaces this as `aborted` / ECONNRESET; it isn't a server fault,
        // so record it as 499 instead of rethrowing into an unhandled 500.
        if (request.signal.aborted) {
          logger.set({ aborted: true, ...snapshot() });
          await finish({ status: CLIENT_CLOSED_REQUEST });
          return new Response(null, { status: CLIENT_CLOSED_REQUEST });
        }
        logger.set(snapshot());
        await finish({
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    });
  }
);

export const startInstance = createStart(() => ({
  // The client renders every route: loaders and `beforeLoad` never run on the server.
  defaultSsr: false,
  // Headers outermost so every response carries them; the logger sits just inside so request
  // failures still emit.
  requestMiddleware: [securityHeadersMiddleware, evlogRequestMiddleware],
}));
