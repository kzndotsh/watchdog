import { auditRedactPreset, initLogger } from "evlog";
import { createFsDrain } from "evlog/fs";

export interface InitWatchdogLoggerOptions {
  service: string;
  drainDir: string;
  pretty?: boolean;
}

const EXTRA_REDACT_PATHS = [
  "password",
  "*_token",
  "x-api-key",
  "authorization",
  "cookie",
  "set-cookie",
] as const;

let initialized = false;

/** Init process logger once (FS NDJSON + stdout). Safe to call again (HMR). */
export function initWatchdogLogger(options: InitWatchdogLoggerOptions): void {
  if (initialized) return;
  initialized = true;

  const isProd = process.env.NODE_ENV === "production";
  // Console/stdout only; FS drain stays compact NDJSON for parsers.
  const consolePretty = options.pretty ?? !isProd;

  initLogger({
    env: { service: options.service },
    pretty: consolePretty,
    redact: {
      paths: [...(auditRedactPreset.paths ?? []), ...EXTRA_REDACT_PATHS],
      // Builtins (CC/email/IP) false-positive on digit-heavy case/evidence UUIDs.
      builtins: false,
    },
    drain: createFsDrain({
      pretty: false,
      maxFiles: 14,
      maxSizePerFile: 10 * 1024 * 1024,
      dir: options.drainDir,
    }),
  });
}
