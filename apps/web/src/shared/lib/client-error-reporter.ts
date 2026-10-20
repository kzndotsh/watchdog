/**
 * Browser side of error reporting: unhandled errors and rejections, and render failures caught by
 * an error boundary, are posted to this app's own `/api/client-errors` (never to a third party; the
 * server decides whether a tracker is configured). A stale-chunk failure reloads once first
 * (`chunk-reload.ts`). Reporting is best effort: it never throws and never blocks the page.
 */
import { reloadOnceForStaleChunk } from "./chunk-reload";

const CLIENT_ERRORS_PATH = "/api/client-errors";

/** Per page load, so a render loop cannot flood the endpoint. */
const MAX_REPORTS_PER_PAGE = 5;

export type ClientErrorKind = "error" | "unhandledrejection" | "render";

const seen = new Set<string>();

/** Test hook: forget what this page already reported. */
export function resetClientErrorReporter(): void {
  seen.clear();
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
  send: typeof fetch = async (...args) => fetch(...args)
): void {
  try {
    const parts = describe(error);
    const key = `${parts.name}:${parts.message}`;
    if (seen.has(key) || seen.size >= MAX_REPORTS_PER_PAGE) return;
    seen.add(key);
    void post(
      send,
      JSON.stringify({ kind, ...parts, page: globalThis.location.pathname })
    );
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
  if (reloadOnceForStaleChunk(Reflect.get(event, "payload"))) {
    event.preventDefault();
  }
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
