import { auditRedactPreset, createLogger, initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";

import {
  configureErrorReporting,
  installProcessErrorHandlers,
  reportWideEvent,
} from "./error-report";
import { createSentrySink } from "./sentry-sink";

export type InitWatchdogLoggerOptions = {
  service: string;
  drainDir: string;
  pretty?: boolean;
  /**
   * Optional error reporting. Without a `dsn` (the default) nothing is configured and nothing is
   * sent. `secrets` are values (from the validated env) that must never appear in a report.
   */
  errorReporting?: {
    dsn?: string | undefined;
    release?: string | undefined;
    environment?: string | undefined;
    secrets?: readonly string[];
  };
};

const EXTRA_REDACT_PATHS = [
  "password",
  "*_token",
  "x-api-key",
  "authorization",
  "cookie",
  "set-cookie",
] as const;

let initialized = false;

/**
 * `WD_LOG_DIR` moves the NDJSON drain, for a container whose app directory is read-only or not
 * writable by its user (the image sets it to a path under /tmp; stdout carries the same events).
 * Unset or blank keeps the directory the app passed.
 */
export function resolveDrainDir(
  configured: string,
  override: string | undefined = process.env.WD_LOG_DIR
): string {
  const trimmed = override?.trim() ?? "";
  return trimmed === "" ? configured : trimmed;
}

/** Error reporting is off unless a DSN is configured (and parses); then nothing else changes. */
/** True when a DSN was given but is unusable (reporting stays off). */
function setUpErrorReporting(options: InitWatchdogLoggerOptions): boolean {
  const settings = options.errorReporting;
  const dsn = settings?.dsn?.trim();
  if (settings === undefined || dsn === undefined || dsn === "") return false;
  const sink = createSentrySink({ dsn });
  if (sink === null) return true;
  configureErrorReporting({
    sink,
    service: options.service,
    release: settings.release,
    environment: settings.environment,
    secrets: [dsn, ...(settings.secrets ?? [])],
  });
  installProcessErrorHandlers();
  return false;
}

/** Init process logger once (FS NDJSON + stdout). Safe to call again (HMR). */
export function initWatchdogLogger(options: InitWatchdogLoggerOptions): void {
  if (initialized) return;
  initialized = true;

  const isProd = process.env.NODE_ENV === "production";
  // Console/stdout only; FS drain stays compact NDJSON for parsers.
  const consolePretty = options.pretty ?? !isProd;

  const fsDrain = createFsDrain({
    pretty: false,
    maxFiles: 14,
    maxSizePerFile: 10 * 1024 * 1024,
    dir: resolveDrainDir(options.drainDir),
  });
  const dsnRejected = setUpErrorReporting(options);

  initLogger({
    env: { service: options.service },
    pretty: consolePretty,
    // Debug wide events (static files and health probes at the web edge) are dropped, not
    // written: an operator who wants them lifts this rate.
    sampling: { rates: { debug: 0 } },
    redact: {
      paths: [...(auditRedactPreset.paths ?? []), ...EXTRA_REDACT_PATHS],
      // Builtins (CC/email/IP) false-positive on digit-heavy case/evidence UUIDs.
      builtins: false,
    },
    drain: async (ctx) => {
      // Reporting is fire-and-forget and never throws: it cannot delay or fail the file drain.
      reportWideEvent(ctx.event);
      await fsDrain(ctx);
    },
  });

  if (dsnRejected) {
    const log = createLogger({ scope: "error-reporting" });
    log.setLevel("warn");
    log.set({
      message:
        "WD_ERROR_REPORTING_DSN is not a valid DSN (https://<key>@host/<project>); error reporting is off",
    });
    void log.emit();
  }
}
