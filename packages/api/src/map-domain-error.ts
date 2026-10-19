import { ORPCError } from "@orpc/server";
import { Match } from "effect";

import {
  boundEchoedId,
  type DomainTag,
  type NotFoundEntity,
  type VersionedEntity,
} from "@watchdog/core/errors";
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

type ErrorCauseFields = {
  name: string;
  message: string;
  stack: string | undefined;
};

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
  if (error._tag === "InvalidError" && error.cause !== undefined) {
    return { domainTag: error._tag, cause: describeCause(error.cause) };
  }
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
export type ApiErrorData = {
  readonly code: DomainTag["code"];
};

/** `not_found` also names what was missing: the entity and the caller-supplied id. */
export type NotFoundErrorData = {
  readonly code: "not_found";
  readonly entity: NotFoundEntity;
  readonly id: string;
} & ApiErrorData;

/**
 * `stale_version`: an update named an out-of-date `version` of a Graph row (#307). Carries the
 * row (`entity`, `id`) and its `currentVersion` so a client can reload and retry.
 */
export type StaleVersionErrorData = {
  readonly code: "stale_version";
  readonly entity: VersionedEntity;
  readonly id: string;
  readonly currentVersion: number;
} & ApiErrorData;

/** Convert a tagged domain failure to an oRPC HTTP error value. */
export function toOrpcError(error: DomainTag) {
  peekRequestLogger()?.set({ error: logFieldsFor(error) });
  return Match.value(error).pipe(
    Match.tagsExhaustive({
      NotFoundError: (tagged) =>
        new ORPCError("NOT_FOUND", {
          defined: true,
          message: tagged.message,
          data: {
            code: tagged.code,
            entity: tagged.entity,
            id: boundEchoedId(tagged.id),
          } satisfies NotFoundErrorData,
        }),
      ConflictError: (tagged) =>
        new ORPCError("CONFLICT", {
          defined: true,
          message: tagged.reason,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      StaleVersionError: (tagged) =>
        new ORPCError("CONFLICT", {
          defined: true,
          message: tagged.message,
          data: {
            code: tagged.code,
            entity: tagged.entity,
            id: boundEchoedId(tagged.id),
            currentVersion: tagged.currentVersion,
          } satisfies StaleVersionErrorData,
        }),
      InvalidError: (tagged) =>
        new ORPCError("BAD_REQUEST", {
          defined: true,
          message: tagged.reason,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      ForbiddenError: (tagged) =>
        new ORPCError("FORBIDDEN", {
          defined: true,
          message: tagged.reason,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
      InternalError: (tagged) =>
        new ORPCError("INTERNAL_SERVER_ERROR", {
          defined: true,
          message: INTERNAL_ERROR_MESSAGE,
          data: { code: tagged.code } satisfies ApiErrorData,
        }),
    })
  );
}
