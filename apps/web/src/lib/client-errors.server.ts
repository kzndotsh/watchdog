import "@tanstack/react-start/server-only";
/**
 * Browser error reports (`POST /api/client-errors`). The browser never talks to the error tracker:
 * it posts a short, same-origin report here, and the server logs it as an error event, which the
 * logger's drain forwards to the tracker when one is configured (`@watchdog/log` error reporting).
 * Unauthenticated by design (a crash can happen signed out), so the body is size capped, the request
 * must be same-origin, the report is rate limited, every field is truncated, and every answer has an
 * empty body.
 */
import { createReportLimiter, readCappedText } from "@/lib/csp-report.server";

export const CLIENT_ERROR_MAX_BYTES = 8 * 1024;
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 60_000;
const MAX_FIELD = 1000;
const MAX_STACK = 4000;

export type ClientErrorReport = {
  kind: string;
  name: string;
  message: string;
  stack: string;
  /** The page's path (no query or fragment). */
  page: string;
};

function text(record: object, key: string, max: number): string {
  const value: unknown = Reflect.get(record, key);
  return typeof value === "string" ? value.slice(0, max) : "";
}

function pathOf(value: string): string {
  try {
    return new URL(value, "http://wd.invalid").pathname;
  } catch {
    return "";
  }
}

export function parseClientError(body: string): ClientErrorReport | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const message = text(json, "message", MAX_FIELD);
  if (message === "") return null;
  return {
    kind: text(json, "kind", 32),
    name: text(json, "name", 100) || "Error",
    message,
    stack: text(json, "stack", MAX_STACK),
    page: pathOf(text(json, "page", MAX_FIELD)),
  };
}

const processLimiter = createReportLimiter({
  max: MAX_PER_WINDOW,
  windowMs: WINDOW_MS,
});

type Deps = {
  log: (report: ClientErrorReport) => void;
  limiter?: { take: () => boolean };
};

/** 403 cross-site, 413 over the cap, 429 over the rate limit, 204 otherwise. */
export async function handleClientError(
  request: Request,
  { log, limiter = processLimiter }: Deps
): Promise<Response> {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") {
    return new Response(null, { status: 403 });
  }
  const body = await readCappedText(request, CLIENT_ERROR_MAX_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  const report = parseClientError(body);
  if (report === null) return new Response(null, { status: 204 });
  if (!limiter.take()) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(WINDOW_MS / 1000) },
    });
  }
  log(report);
  return new Response(null, { status: 204 });
}
