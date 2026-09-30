/**
 * TanStack Start request + ServerFn middleware (CSRF + auth + evlog).
 * Dynamic-import drain init inside `.server()` only — never top-level `evlog/fs`
 * (Start keeps bare side-effect imports after stripping `.server()` bodies).
 */

import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import { requireAuth } from "@/auth/middleware";
import { isUnauthorizedError } from "@/auth/unauthorized-error";

/** Required when `src/start.ts` exists — Start auto-installs this only without a custom startInstance. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/** nginx convention: client closed the connection before the response. */
const CLIENT_CLOSED_REQUEST = 499;

const API_EXCLUDE = [
  "/api/v1/health",
  "/api/v1/spec.json",
  "/api/v1/",
  "/api/v1",
];

function serverFnOperationId(serverFnMeta: unknown): string {
  if (serverFnMeta === null || typeof serverFnMeta !== "object") {
    return "serverFn";
  }
  if ("id" in serverFnMeta && typeof serverFnMeta.id === "string") {
    return serverFnMeta.id;
  }
  if ("name" in serverFnMeta && typeof serverFnMeta.name === "string") {
    return serverFnMeta.name;
  }
  return "serverFn";
}

const evlogRequestMiddleware = createMiddleware().server(
  async ({ next, request, pathname }) => {
    await import("./evlog-init.server");
    const { createMiddlewareLogger, extractSafeHeaders } =
      await import("evlog/toolkit");
    const { createLogger, runWithRequestLogger } =
      await import("@watchdog/log");

    const headers = extractSafeHeaders(request.headers);
    const { logger, finish, finishResponse, skipped } = createMiddlewareLogger({
      method: request.method,
      path: pathname,
      headers,
      include: ["/api/**"],
      exclude: API_EXCLUDE,
    });

    // Alias avoids node/callback-return on the identifier `next`.
    const proceed = next;

    if (skipped) {
      const result = await proceed();
      // ServerFns are outside `/api/**`, so the request logger skips them —
      // but CSRF still runs here. Emit a warn when CSRF rejects so probes
      // aren't silent (functionMiddleware never runs on 403).
      if (pathname.startsWith("/_serverFn") && result.response.status === 403) {
        const log = createLogger();
        log.setLevel("warn");
        log.set({
          path: pathname,
          method: request.method,
          status: 403,
          auth: { denied: true, reason: "csrf" },
        });
        void log.emit();
      }
      return result;
    }

    return runWithRequestLogger(logger, async () => {
      try {
        const result = await proceed();
        const wrapped = await finishResponse(result.response, {
          status: result.response.status,
        });
        return {
          ...result,
          response: wrapped,
        };
      } catch (error: unknown) {
        // Client went away mid-request (SSE reconnect, tab close, navigation).
        // Node surfaces this as `aborted` / ECONNRESET; it isn't a server fault,
        // so record it as 499 instead of rethrowing into an unhandled 500.
        if (request.signal.aborted) {
          logger.set({ aborted: true });
          await finish({ status: CLIENT_CLOSED_REQUEST });
          return new Response(null, { status: CLIENT_CLOSED_REQUEST });
        }
        await finish({
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    });
  }
);

const evlogFunctionMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    await import("./evlog-init.server");
    const { createLogger, runWithRequestLogger } =
      await import("@watchdog/log");

    const log = createLogger();
    log.set({ operation: serverFnOperationId(serverFnMeta) });

    const proceed = next;
    return runWithRequestLogger(log, async () => {
      try {
        const result = await proceed();
        void log.emit();
        return result;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        // Expected auth denial → warn. Unexpected throws → error (log.error
        // serializes Error; log.set({ error: Error }) JSON-stringifies to {}).
        if (isUnauthorizedError(err)) {
          log.setLevel("warn");
          log.set({
            auth: { denied: true, reason: "no_session" },
            error: { name: err.name, message: err.message },
          });
        } else {
          log.error(err);
        }
        void log.emit();
        throw error;
      }
    });
  }
);

export const startInstance = createStart(() => ({
  // Logger outermost so CSRF 403s (and other request failures) still emit.
  requestMiddleware: [evlogRequestMiddleware, csrfMiddleware],
  // Logger outermost so Unauthorized from requireAuth still emits a wide event.
  functionMiddleware: [evlogFunctionMiddleware, requireAuth],
}));
