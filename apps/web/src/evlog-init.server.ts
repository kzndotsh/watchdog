/**
 * Node-only drain init — import from `src/start.ts` only (never route modules).
 */

import path from "node:path";

import { errorReportingSettings } from "@watchdog/env/server";
import { initWatchdogLogger } from "@watchdog/log";

initWatchdogLogger({
  service: "watchdog-web",
  // apps/web/src → apps/web/.evlog/logs (not apps/.evlog — one `..` too many)
  drainDir: path.join(import.meta.dirname, "..", ".evlog", "logs"),
  errorReporting: errorReportingSettings(),
});
