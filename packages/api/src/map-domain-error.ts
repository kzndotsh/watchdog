import { ORPCError } from "@orpc/server";
import { Match } from "effect";

import type { DomainTag } from "@watchdog/core/errors";
import { peekRequestLogger } from "@watchdog/log";

/** Message sent to clients for every `InternalError`; the real cause is log-only. */
const INTERNAL_ERROR_MESSAGE = "Internal server error";

/** Cap for non-Error causes so a hostile or huge value cannot bloat the log line. */
const MAX_CAUSE_CHARS = 1000;

function truncate(text: string): string {
  return text.length > MAX_CAUSE_CHARS
    ? `${text.slice(0, MAX_CAUSE_CHARS)}...[truncated]`
    : text;
}

function stringifyCause(cause: unknown): string {
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause) ?? "[unserializable cause]";
  } catch {
    return "[unserializable cause]";
  }
}

interface ErrorCauseFields {
  name: string;
  message: string;
  stack: string | undefined;
}

/**
 * The full underlying cause for the request log (never the HTTP body). Errors keep
 * name, message and stack; anything else is a truncated string. Plain objects are
 * set as plain data because evlog drains an `Error` instance as `{}`.
 */
function describeCause(cause: unknown): ErrorCauseFields | string | null {
  if (cause === undefined || cause === null) return null;
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return truncate(stringifyCause(cause));
}

function logFieldsFor(error: DomainTag) {
  if (error._tag !== "InternalError") return { domainTag: error._tag };
  return {
    domainTag: error._tag,
    reason: error.reason,
    cause: describeCause(error.cause),
  };
}

/**
 * Body shape every mapped error carries in the oRPC `data` field: the stable
 * `code` (never renamed once released) next to the safe message.
 */
export interface ApiErrorData {
  readonly code: DomainTag["code"];
}

/** Convert a tagged domain failure to an oRPC HTTP error value. */
export function toOrpcError(error: DomainTag) {
  peekRequestLogger()?.set({ error: logFieldsFor(error) });
  return Match.value(error).pipe(
    Match.tagsExhaustive({
      NotFoundError: (tagged) =>
        new ORPCError("NOT_FOUND", {
          message: tagged.resource,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      ConflictError: (tagged) =>
        new ORPCError("CONFLICT", {
          message: tagged.reason,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      InvalidError: (tagged) =>
        new ORPCError("BAD_REQUEST", {
          message: tagged.reason,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      ForbiddenError: (tagged) =>
        new ORPCError("FORBIDDEN", {
          message: tagged.reason,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      InternalError: (tagged) =>
        new ORPCError("INTERNAL_SERVER_ERROR", {
          message: INTERNAL_ERROR_MESSAGE,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
    })
  );
}
