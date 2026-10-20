/**
 * One wide event per HTTP request at the edge of the production server (`scripts/serve.mjs`),
 * through `@watchdog/log` like every other process log. Fields are method, path, status,
 * `durationMs` and the caller's `x-request-id` when it is a plain token. The path never carries a
 * query string, and request headers (cookies, authorization), the query and bodies are never
 * read into the event.
 *
 * The app already emits a richer wide event for `/api/**` (except `EDGE_LOGGED_API`) and for
 * server functions (`src/start.ts`), so those are skipped here: one event per request. Static
 * files and the health probes are logged at `debug`, which the logger drops (see
 * `initWatchdogLogger`), so they do not drown the page and error events.
 */
import type { ServerMiddleware } from "srvx";

import { EDGE_LOGGED_API } from "./request-log-paths";

/** Probes: every container healthcheck would otherwise log them. */
const QUIET_PATHS = new Set(["/api/v1/health", "/api/v1/ready"]);

const REQUEST_ID = /^[\w.:-]{1,128}$/;

export type RequestLogFields = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId?: string;
};

type Emit = (fields: RequestLogFields, level: "debug" | "info") => unknown;

/** True when the app's own middleware already logs this path. */
function loggedByApp(pathname: string): boolean {
  if (pathname.startsWith("/_serverFn")) return true;
  return pathname.startsWith("/api/") && !EDGE_LOGGED_API.includes(pathname);
}

function isQuiet(pathname: string): boolean {
  if (pathname.startsWith("/assets/") || QUIET_PATHS.has(pathname)) {
    return true;
  }
  // A file request (`/favicon.ico`, `/robots.txt`): a page route has no extension.
  return /\.[a-z0-9]+$/i.test(pathname);
}

/** The event's fields, taken from the parts of a request that are safe to log. */
export function requestLogFields(
  request: Request,
  status: number,
  durationMs: number
): RequestLogFields {
  const fields: RequestLogFields = {
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: Math.round(durationMs * 100) / 100,
  };
  const id = request.headers.get("x-request-id");
  if (id !== null && REQUEST_ID.test(id)) fields.requestId = id;
  return fields;
}

async function emitRequestLog(
  fields: RequestLogFields,
  level: "debug" | "info"
): Promise<void> {
  await import("../evlog-init.server");
  const { createLogger } = await import("@watchdog/log");
  const log = createLogger({ scope: "http.request" });
  if (fields.status >= 500) log.setLevel("error");
  else if (fields.status >= 400) log.setLevel("warn");
  else log.setLevel(level);
  log.set({ ...fields });
  // evlog times a logger from its creation (here: now); the request's own duration overrides it.
  void log.emit({ _durationMs: fields.durationMs });
}

/** A failed log write must never fail or delay the response. */
async function emitSafely(
  emit: Emit,
  fields: RequestLogFields,
  level: "debug" | "info"
): Promise<void> {
  try {
    await emit(fields, level);
  } catch {
    // dropped on purpose: logging is best effort
  }
}

/** srvx middleware: time the rest of the chain, then log the request once. */
export function createRequestLogMiddleware(
  emit: Emit = emitRequestLog
): ServerMiddleware {
  return async (request, next) => {
    const started = performance.now();
    let status = 500;
    // Alias avoids node/callback-return on the identifier `next`.
    const proceed = next;
    try {
      const response = await proceed();
      status = response.status;
      return response;
    } finally {
      const pathname = new URL(request.url).pathname;
      if (!loggedByApp(pathname)) {
        const fields = requestLogFields(
          request,
          status,
          performance.now() - started
        );
        const level = isQuiet(pathname) ? "debug" : "info";
        void emitSafely(emit, fields, level);
      }
    }
  };
}
