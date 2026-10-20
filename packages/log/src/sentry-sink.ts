/**
 * A sink that speaks the Sentry envelope protocol, so one DSN works against Sentry, GlitchTip,
 * Bugsink and any other server that implements it. It is a few lines of `fetch`, not the Sentry SDK:
 * the SDK would add megabytes to the server and worker bundles and patch Node internals, for a
 * feature that must be off by default.
 */

import { randomUUID } from "node:crypto";

import type { ErrorReport, ErrorSink } from "./error-report";

const SEND_TIMEOUT_MS = 3000;
const CLIENT = "watchdog-error-sink/1";

export type ParsedDsn = {
  readonly envelopeUrl: string;
  readonly publicKey: string;
};

/** `https://<key>@host[:port][/prefix]/<project>` -> the envelope URL and key; `null` when it is not a DSN. */
export function parseDsn(dsn: string): ParsedDsn | null {
  let url: URL;
  let publicKey: string;
  try {
    url = new URL(dsn.trim());
    publicKey = decodeURIComponent(url.username);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const segments = url.pathname.split("/").filter((part) => part !== "");
  const project = segments.pop();
  if (publicKey === "" || project === undefined) return null;
  const prefix = segments.length === 0 ? "" : `/${segments.join("/")}`;
  return {
    envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`,
    publicKey,
  };
}

type Frame = {
  function: string;
  filename: string;
  lineno?: number;
  colno?: number;
};

const FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/;

/** V8 `stack` lines to Sentry frames, oldest first. Lines that do not parse are skipped. */
function framesOf(stack: string | undefined): Frame[] {
  if (stack === undefined) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const match = FRAME.exec(line);
    if (match === null) continue;
    const [, fn, file = "", row, col] = match;
    frames.unshift({
      function: fn ?? "<anonymous>",
      filename: file,
      lineno: Number(row),
      colno: Number(col),
    });
  }
  return frames;
}

function envelopeOf(report: ErrorReport): string {
  const eventId = randomUUID().replaceAll("-", "");
  const frames = framesOf(report.stack);
  const event = {
    event_id: eventId,
    timestamp: report.timestamp / 1000,
    platform: "node",
    level: report.level,
    logger: report.service,
    server_name: report.service,
    release: report.release,
    environment: report.environment,
    exception: {
      values: [
        {
          type: report.name,
          value: report.message,
          stacktrace: frames.length > 0 ? { frames } : undefined,
        },
      ],
    },
    tags: { service: report.service },
    extra: report.context,
  };
  const header = { event_id: eventId, sent_at: new Date().toISOString() };
  return [
    JSON.stringify(header),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

export type SentrySinkOptions = {
  readonly dsn: string;
  /** Tests inject a fake; defaults to global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
};

/** The sink for a DSN, or `null` when the DSN does not parse (reporting then stays off). */
export function createSentrySink(options: SentrySinkOptions): ErrorSink | null {
  const parsed = parseDsn(options.dsn);
  if (parsed === null) return null;
  const doFetch = options.fetch ?? fetch;
  return {
    send: async (report) => {
      const response = await doFetch(parsed.envelopeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-sentry-envelope",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_client=${CLIENT}, sentry_key=${parsed.publicKey}`,
        },
        body: envelopeOf(report),
        signal: AbortSignal.timeout(options.timeoutMs ?? SEND_TIMEOUT_MS),
      });
      // Drain so the connection is released; the body is never read into a log.
      await response.body?.cancel();
    },
  };
}
