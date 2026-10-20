import { auditRedactPreset, createLogger, initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";

import {
  configureErrorReporting,
  installProcessErrorHandlers,
  reportWideEvent,
} from "./error-report";
import { setUpOtlpExport, type OtlpSettings } from "./otlp-export";
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
  /**
   * Optional OTLP log export. Without an `endpoint` (the default) nothing is configured and nothing
   * is sent. An unusable value leaves export off with one warning; it never stops startup.
   */
  otlp?: OtlpSettings;
};

/**
 * Watchdog paths on top of `auditRedactPreset` (which already drops `password`, `token`, `apiKey`,
 * `secret`, `authorization`, `cookie` and `set-cookie`) and the `secrets` builtin (every key ending in
 * `password`, `passwd`, `secret` or `token`, at any depth). `x-api-key` is the one header name
 * (Watchdog `wd_` keys) that neither covers: it ends in `key`, not a secret suffix.
 */
const EXTRA_REDACT_PATHS = ["x-api-key"] as const;

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

function warnOnce(scope: string, message: string): void {
  const log = createLogger({ scope });
  log.setLevel("warn");
  log.set({ message });
  void log.emit();
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
  const otlp = setUpOtlpExport(options.otlp, options.service);

  initLogger({
    env: { service: options.service },
    pretty: consolePretty,
    redact: {
      paths: [...(auditRedactPreset.paths ?? []), ...EXTRA_REDACT_PATHS],
      // Only `secrets` (key-name based). The CC/email/IP/phone maskers match values and
      // false-positive on digit-heavy case/evidence UUIDs, so they stay off.
      builtins: ["secrets"],
    },
    drain: async (ctx) => {
      // Reporting is fire-and-forget and never throws: it cannot delay or fail the file drain.
      reportWideEvent(ctx.event);
      otlp.exporter?.push(ctx.event);
      await fsDrain(ctx);
    },
  });

  if (dsnRejected) {
    warnOnce(
      "error-reporting",
      "WD_ERROR_REPORTING_DSN is not a valid DSN (https://<key>@host/<project>); error reporting is off"
    );
  }
  if (otlp.warning !== null) warnOnce("otlp", otlp.warning);
}
