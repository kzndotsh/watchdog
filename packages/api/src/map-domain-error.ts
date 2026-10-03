import { ORPCError } from "@orpc/server";
import { Match } from "effect";

import type { DomainTag } from "@watchdog/core";
import { peekRequestLogger } from "@watchdog/log";

/** Message sent to clients for every `InternalError`; the real cause is log-only. */
const INTERNAL_ERROR_MESSAGE = "Internal server error";

function describeCause(cause: unknown): string | undefined {
  if (cause instanceof Error) return cause.message;
  return typeof cause === "string" ? cause : undefined;
}

function logFieldsFor(error: DomainTag) {
  if (error._tag !== "InternalError") return { domainTag: error._tag };
  return {
    domainTag: error._tag,
    reason: error.reason,
    cause: describeCause(error.cause),
  };
}

/** Convert a tagged domain failure to an oRPC HTTP error value. */
export function toOrpcError(error: DomainTag) {
  peekRequestLogger()?.set({ error: logFieldsFor(error) });
  return Match.value(error).pipe(
    Match.tagsExhaustive({
      NotFoundError: (tagged) =>
        new ORPCError("NOT_FOUND", { message: tagged.resource }),
      ConflictError: (tagged) =>
        new ORPCError("CONFLICT", { message: tagged.reason }),
      InvalidError: (tagged) =>
        new ORPCError("BAD_REQUEST", { message: tagged.reason }),
      ForbiddenError: (tagged) =>
        new ORPCError("FORBIDDEN", { message: tagged.reason }),
      InternalError: () =>
        new ORPCError("INTERNAL_SERVER_ERROR", {
          message: INTERNAL_ERROR_MESSAGE,
        }),
    })
  );
}
