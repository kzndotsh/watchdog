/**
 * Browser side of error reporting: unhandled errors and rejections, and render failures caught by
 * an error boundary, are posted to this app's own `/api/client-errors` (never to a third party; the
 * server decides whether a tracker is configured). A stale-chunk failure reloads once first
 * (`chunk-reload.ts`). Reporting is best effort: it never throws and never blocks the page.
 */
import { reloadOnceForStaleChunk } from "./chunk-reload";

const CLIENT_ERRORS_PATH = "/api/client-errors";

/** At most this many distinct reports per window, so a render loop cannot flood the endpoint. */
const MAX_REPORTS_PER_WINDOW = 5;
/** A sliding window, not per page load: a long-lived tab keeps reporting new failures. */
const REPORT_WINDOW_MS = 5 * 60_000;

/** Field caps (the server truncates to the same numbers) and the body budget under its 8 KiB cap. */
const MAX_NAME = 100;
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
const MAX_PAGE = 1000;
const MAX_BODY_BYTES = 7000;

export type ClientErrorKind = "error" | "unhandledrejection" | "render";

/** Report key to the time it was last sent, inside the window. */
const recent = new Map<string, number>();

/** Test hook: forget what this page already reported. */
export function resetClientErrorReporter(): void {
  recent.clear();
}

function describe(error: unknown): {
  name: string;
  message: string;
  stack: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
    };
  }
  return {
    name: "Error",
    message: typeof error === "string" ? error : "Non-error value thrown",
    stack: "",
  };
}

/** The JSON body, shrunk (stack first, then message) until it fits under the server's cap. */
export function buildReportBody(
  kind: ClientErrorKind,
  parts: { name: string; message: string; stack: string },
  page: string
): string {
  let stack = parts.stack.slice(0, MAX_STACK);
  let message = parts.message.slice(0, MAX_MESSAGE);
  const name = parts.name.slice(0, MAX_NAME);
  const path = page.slice(0, MAX_PAGE);
  for (;;) {
    const body = JSON.stringify({ kind, name, message, stack, page: path });
    if (new Blob([body]).size <= MAX_BODY_BYTES) return body;
    if (stack.length > 0) stack = stack.slice(0, Math.floor(stack.length / 2));
    else if (message.length > 1)
      message = message.slice(0, Math.floor(message.length / 2));
    else return JSON.stringify({ kind, name: "Error", message: "Error" });
  }
}

async function post(send: typeof fetch, body: string): Promise<void> {
  try {
    await send(CLIENT_ERRORS_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // reporting never breaks the page
  }
}

export function reportClientError(
  error: unknown,
  kind: ClientErrorKind,
  send: typeof fetch = async (...args) => fetch(...args),
  now: () => number = Date.now
): void {
  try {
    const parts = describe(error);
    const key = `${parts.name}:${parts.message}:${parts.stack.slice(0, 300)}`;
    const at = now();
    for (const [entry, sentAt] of recent) {
      if (at - sentAt >= REPORT_WINDOW_MS) recent.delete(entry);
    }
    if (recent.has(key) || recent.size >= MAX_REPORTS_PER_WINDOW) return;
    recent.set(key, at);
    void post(send, buildReportBody(kind, parts, globalThis.location.pathname));
  } catch {
    // reporting never breaks the page
  }
}

/** What an error handler does with a failure: reload for a stale chunk, otherwise report. */
export function handleClientFailure(
  error: unknown,
  kind: ClientErrorKind
): void {
  if (reloadOnceForStaleChunk(error)) return;
  reportClientError(error, kind);
}

/** Cross-origin script errors arrive as an opaque "Script error." with nothing to act on. */
function isOpaque(event: ErrorEvent): boolean {
  return event.error === null || event.error === undefined
    ? event.message === "Script error." || event.message === ""
    : false;
}

function onError(event: ErrorEvent): void {
  if (isOpaque(event)) return;
  handleClientFailure(event.error ?? new Error(event.message), "error");
}

function onRejection(event: PromiseRejectionEvent): void {
  handleClientFailure(event.reason, "unhandledrejection");
}

// Vite fires this when a dynamic import's preload fails; it throws unless prevented.
function onPreloadError(event: Event): void {
  const payload: unknown = Reflect.get(event, "payload");
  if (reloadOnceForStaleChunk(payload)) {
    event.preventDefault();
    return;
  }
  // Could not reload (guard active, storage unavailable): report it and let the error reach the boundary.
  reportClientError(payload, "error");
}

/** Install the page-wide listeners; returns the function that removes them. */
export function installClientErrorHandlers(
  target: Pick<
    Window,
    "addEventListener" | "removeEventListener"
  > = globalThis.window
): () => void {
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("vite:preloadError", onPreloadError);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("vite:preloadError", onPreloadError);
  };
}
