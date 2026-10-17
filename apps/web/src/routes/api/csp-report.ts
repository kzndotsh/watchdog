/**
 * POST /api/csp-report
 *
 * Where browsers send Content-Security-Policy violation reports (`report-uri`
 * and the `csp` Reporting-Endpoints group, set in `lib/security-headers.server.ts`).
 * Unauthenticated by design (the browser posts it), so it is size capped and rate
 * limited, logs a short summary (directive and scrubbed URLs, never the raw
 * report), and answers with an empty body.
 */
import { createFileRoute } from "@tanstack/react-router";

import { handleCspReport, type CspViolation } from "@/lib/csp-report.server";
import { createLogger } from "@watchdog/log";

function logViolation(violation: CspViolation): void {
  const log = createLogger({ scope: "csp.report" });
  log.setLevel("warn");
  log.set({ csp: violation });
  void log.emit();
}

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        handleCspReport(request, { log: logViolation }),
    },
  },
});
