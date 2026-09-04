import { ORPCError } from "@orpc/server";
import { Match } from "effect";

import type { DomainTag } from "@watchdog/core";
import { peekRequestLogger } from "@watchdog/log";

/** Convert a tagged domain failure to an oRPC HTTP error value. */
export function toOrpcError(error: DomainTag) {
  peekRequestLogger()?.set({ error: { domainTag: error._tag } });
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
    })
  );
}
