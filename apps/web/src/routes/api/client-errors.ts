/**
 * POST /api/client-errors
 *
 * Where the browser reports an unhandled error or rejection (root error boundary, `error` and
 * `unhandledrejection` listeners). Same-origin, size capped and rate limited; see
 * `lib/client-errors.server.ts`. The report is logged as an error event and forwarded to the
 * error tracker when `WD_ERROR_REPORTING_DSN` is set.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  handleClientError,
  type ClientErrorReport,
} from "@/lib/client-errors.server";
import { createLogger } from "@watchdog/log";

function logClientError(report: ClientErrorReport): void {
  const log = createLogger({ scope: "web.client" });
  log.set({ path: report.page, operation: `client.${report.kind || "error"}` });
  const error = new Error(report.message);
  error.name = report.name;
  error.stack = report.stack === "" ? undefined : report.stack;
  log.error(error);
  void log.emit();
}

export const Route = createFileRoute("/api/client-errors")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        handleClientError(request, { log: logClientError }),
    },
  },
});
